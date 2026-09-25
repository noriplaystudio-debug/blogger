import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/session";
import {
  createAngleStage,
  createCategoryStage,
  createKeywordStage,
  finalizeStagedPlan,
  normalizePlanningSettings,
} from "@/lib/planning";
import {
  markLocalPlanningSearchReady,
  saveLocalPlanningSearch,
} from "@/lib/local-state";
import {
  getAutomationConfig,
  getPortfolioPerformanceGuidance,
  getRecentContentInventory,
  getRecentKeywords,
  getStrategyGuidance,
  hasDatabase,
  markPlanningSearchReady,
  persistWeeklyPlan,
  reserveEstimatedCost,
  saveAutomationConfig,
  savePlanningSearchSnapshot,
} from "@/lib/store";

// Vercel Hobby allows up to 60 seconds per function invocation.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function strings(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 300))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function browserHistory(value: any) {
  const content = Array.isArray(value?.recentContent)
    ? value.recentContent.slice(0, 300).map((item: any) => ({
        category: String(item?.category || "").slice(0, 200),
        keyword: String(item?.keyword || "").slice(0, 300),
        intent: String(item?.intent || "").slice(0, 100),
        angleTitle: String(item?.angleTitle || "").slice(0, 300),
        state: String(item?.state || "").slice(0, 50),
        articleTitle: String(item?.articleTitle || "").slice(0, 300),
      }))
    : [];
  return {
    categories: strings(value?.categories, 20),
    keywords: strings(value?.recentKeywords, 150),
    content,
  };
}

function phaseLabel(phase: string) {
  return (
    {
      categories: "카테고리 조사",
      keywords: "키워드 조사",
      angles: "글 방향 설계",
      finalize: "계획 저장",
    }[phase] || "주간 계획"
  );
}

export async function POST(req: NextRequest) {
  let phase = "categories";
  try {
    const session = await getSession();
    const apiKey = session.apiKeys?.openai || process.env.OPENAI_API_KEY;
    if (!apiKey)
      return NextResponse.json(
        { error: "카테고리·키워드 조사를 위해 OpenAI API 연결이 필요합니다." },
        { status: 400 },
      );

    const requested = await req.json().catch(() => ({}));
    phase = String(requested.phase || "categories");
    if (!["categories", "keywords", "angles", "finalize"].includes(phase))
      return NextResponse.json(
        { error: "지원하지 않는 계획 생성 단계입니다.", phase },
        { status: 400 },
      );

    const localHistory = browserHistory(requested.history);
    const config = hasDatabase() ? await getAutomationConfig() : null;
    const planningSettings = normalizePlanningSettings({
      categoryCount: requested.categoryCount ?? config?.categoryCount,
      keywordsPerCategory:
        requested.keywordsPerCategory ?? config?.keywordsPerCategory,
      articlesPerKeyword:
        requested.articlesPerKeyword ?? config?.articlesPerKeyword,
      dailyArticleLimit:
        requested.dailyArticleLimit ?? config?.dailyArticleLimit,
    });

    if (phase === "categories" && config) {
      const runKey = String(requested.runId || randomUUID()).slice(0, 100);
      const reservation = await reserveEstimatedCost({
        jobId: `manual-weekly-plan:${runKey}`,
        kind: "weekly-plan",
        amountWon: config.estimatedWeeklyPlanCostWon,
        detail: { basis: "user-configured-estimate", mode: "manual-staged" },
      });
      if (!reservation.allowed)
        return NextResponse.json(
          {
            error:
              "월 AI 예산 한도로 주간 조사를 시작하지 않았습니다. 수익 사령탑에서 예산을 조정하세요.",
            budget: reservation,
            phase,
          },
          { status: 429 },
        );
    }

    const storedKeywords = hasDatabase() ? await getRecentKeywords() : [];
    const recentKeywords = [
      ...new Set([...storedKeywords, ...localHistory.keywords]),
    ].slice(0, 150);
    const recentContent = hasDatabase()
      ? await getRecentContentInventory()
      : localHistory.content;

    if (phase === "categories") {
      const performanceGuidance = hasDatabase()
        ? await getPortfolioPerformanceGuidance()
        : [];
      const strategyGuidance = hasDatabase()
        ? await getStrategyGuidance()
        : null;
      if (hasDatabase()) await saveAutomationConfig(planningSettings);
      const result = await createCategoryStage(apiKey, {
        categoryPortfolio: [
          ...new Set([
            ...Object.entries(config?.categoryBlogMap || {})
              .filter(([, blogId]) => Boolean(blogId))
              .map(([category]) => category),
            ...localHistory.categories,
          ]),
        ],
        recentKeywords,
        recentContent,
        settings: planningSettings,
        performanceGuidance,
        strategyGuidance,
      });
      return NextResponse.json({ phase, ...result });
    }

    if (phase === "keywords") {
      if (!requested.category?.name)
        return NextResponse.json(
          { error: "키워드를 조사할 카테고리가 없습니다.", phase },
          { status: 400 },
        );
      const result = await createKeywordStage(apiKey, {
        category: requested.category,
        recentKeywords,
        recentContent,
        settings: planningSettings,
      });
      return NextResponse.json({ phase, ...result });
    }

    if (phase === "angles") {
      if (!requested.category?.name || !requested.keyword?.keyword)
        return NextResponse.json(
          { error: "글 방향을 설계할 카테고리 또는 키워드가 없습니다.", phase },
          { status: 400 },
        );
      const result = await createAngleStage(apiKey, {
        category: requested.category,
        keyword: requested.keyword,
        settings: planningSettings,
      });
      return NextResponse.json({ phase, ...result });
    }

    if (!requested.draft || !Array.isArray(requested.draft.categories))
      return NextResponse.json(
        { error: "완성할 임시 계획이 없습니다.", phase },
        { status: 400 },
      );
    const plan = finalizeStagedPlan(requested.draft, planningSettings);
    const sources = Array.isArray(requested.sources)
      ? requested.sources
          .filter((item: any) => item?.url)
          .slice(0, 200)
          .map((item: any) => ({
            title: String(item.title || item.url).slice(0, 300),
            url: String(item.url).slice(0, 2000),
          }))
      : [];
    let snapshotSaveError = "";
    const snapshot = {
      rawResponse: JSON.stringify(requested.draft),
      sources,
      settings: planningSettings,
      capturedAt: new Date().toISOString(),
    };
    try {
      if (hasDatabase()) await savePlanningSearchSnapshot(snapshot);
      else await saveLocalPlanningSearch({ ...snapshot, status: "captured" });
    } catch (error: any) {
      snapshotSaveError = error.message || "검색 원본을 저장하지 못했습니다.";
    }
    try {
      if (hasDatabase()) await markPlanningSearchReady(plan);
      else await markLocalPlanningSearchReady(plan);
    } catch (error: any) {
      snapshotSaveError ||= error.message || "완성 계획을 저장하지 못했습니다.";
    }
    const workspace = hasDatabase()
      ? await persistWeeklyPlan(
          plan,
          sources,
          planningSettings.dailyArticleLimit,
        )
      : null;
    return NextResponse.json({
      phase,
      ...plan,
      sources,
      tasks: workspace?.tasks || null,
      persisted: Boolean(workspace),
      persistenceWarning: snapshotSaveError || null,
    });
  } catch (error: any) {
    const timedOut =
      error?.name === "APIConnectionTimeoutError" ||
      /timed out|timeout/i.test(String(error?.message || ""));
    return NextResponse.json(
      {
        error: timedOut
          ? `${phaseLabel(phase)} 단계의 응답 시간이 초과됐습니다. 완료된 단계는 보존되므로 다시 누르면 이 단계부터 이어집니다.`
          : error.message || `${phaseLabel(phase)} 단계에 실패했습니다.`,
        code: timedOut ? "PLANNING_STAGE_TIMEOUT" : "PLANNING_STAGE_FAILED",
        phase,
      },
      { status: timedOut ? 504 : 500 },
    );
  }
}
