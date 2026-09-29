import { after, NextRequest, NextResponse } from "next/server";
import { assertCron } from "@/lib/cron";
import {
  createAngleStage,
  createCategoryStage,
  createKeywordStage,
  finalizeStagedPlan,
} from "@/lib/planning";
import {
  finishRun,
  getAutomationConfig,
  getPortfolioPerformanceGuidance,
  getRecentContentInventory,
  getRecentKeywords,
  getStrategyGuidance,
  getWeeklyPlanningProgress,
  hasDatabase,
  mondayOfKoreaWeek,
  persistWeeklyPlan,
  saveWeeklyPlanningProgress,
  startRun,
} from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function mergeSources(left: any[] = [], right: any[] = []) {
  return [
    ...new Map(
      [...left, ...right]
        .filter((source: any) => source?.url)
        .map((source: any) => [String(source.url), source]),
    ).values(),
  ];
}

async function queueNext(req: NextRequest, runKey: string) {
  const origin = new URL(req.url).origin;
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET이 없습니다.");
  after(async () => {
    await fetch(`${origin}/api/cron/weekly-manual-worker?runKey=${encodeURIComponent(runKey)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    }).catch(() => {});
  });
}

export async function POST(req: NextRequest) {
  let automationRunId: number | undefined;
  try {
    assertCron(req);
    if (!hasDatabase()) throw new Error("DATABASE_URL이 없습니다.");
    if (!process.env.OPENAI_API_KEY)
      throw new Error("OPENAI_API_KEY가 없습니다.");

    const runKey = String(req.nextUrl.searchParams.get("runKey") || "").slice(0, 120);
    if (!runKey) throw new Error("runKey가 없습니다.");

    const progress = await getWeeklyPlanningProgress(runKey);
    if (!progress) throw new Error("저장된 주간 계획 실행을 찾지 못했습니다.");
    if (progress.status === "ready")
      return NextResponse.json({ ok: true, ready: true, runKey });

    const config = await getAutomationConfig();
    const settings = progress.settings;
    let draft = progress.draft;
    let sources = progress.sources || [];
    automationRunId = await startRun("weekly-plan-manual-step");

    const [recentKeywords, recentContent] = await Promise.all([
      getRecentKeywords(),
      getRecentContentInventory(150),
    ]);

    if (!draft) {
      const [performanceGuidance, strategyGuidance] = await Promise.all([
        getPortfolioPerformanceGuidance(),
        getStrategyGuidance(),
      ]);
      const result = await createCategoryStage(process.env.OPENAI_API_KEY, {
        categoryPortfolio: [],
        recentKeywords,
        recentContent,
        settings,
        performanceGuidance,
        strategyGuidance,
      });
      draft = result.draft;
      sources = mergeSources(sources, result.sources || []);
      await saveWeeklyPlanningProgress({
        runKey,
        weekStart: progress.weekStart || mondayOfKoreaWeek(),
        mode: "manual",
        settings,
        draft,
        sources,
        status: "running",
      });
      await finishRun(automationRunId, "success", { runKey, phase: "categories" });
      await queueNext(req, runKey);
      return NextResponse.json({ ok: true, queued: true, phase: "categories" });
    }

    const categoryNeedingKeywords = draft.categories?.find(
      (category: any) =>
        !Array.isArray(category.keywords) || category.keywords.length === 0,
    );
    if (categoryNeedingKeywords) {
      const result = await createKeywordStage(process.env.OPENAI_API_KEY, {
        category: categoryNeedingKeywords,
        settings,
        recentKeywords,
        recentContent,
      });
      categoryNeedingKeywords.keywords = result.keywords;
      sources = mergeSources(sources, result.sources || []);
      await saveWeeklyPlanningProgress({
        runKey,
        weekStart: progress.weekStart,
        mode: "manual",
        settings,
        draft,
        sources,
        status: "running",
      });
      await finishRun(automationRunId, "success", {
        runKey,
        phase: "keywords",
        category: categoryNeedingKeywords.name,
      });
      await queueNext(req, runKey);
      return NextResponse.json({ ok: true, queued: true, phase: "keywords" });
    }

    let angleTarget: { category: any; keyword: any } | null = null;
    for (const category of draft.categories || []) {
      for (const keyword of category.keywords || []) {
        if (
          !Array.isArray(keyword.angles) ||
          keyword.angles.length !== Number(settings.articlesPerKeyword)
        ) {
          angleTarget = { category, keyword };
          break;
        }
      }
      if (angleTarget) break;
    }

    if (angleTarget) {
      const result = await createAngleStage(process.env.OPENAI_API_KEY, {
        category: angleTarget.category,
        keyword: angleTarget.keyword,
        settings,
      });
      angleTarget.keyword.angles = result.angles;
      await saveWeeklyPlanningProgress({
        runKey,
        weekStart: progress.weekStart,
        mode: "manual",
        settings,
        draft,
        sources,
        status: "running",
      });
      await finishRun(automationRunId, "success", {
        runKey,
        phase: "angles",
        category: angleTarget.category.name,
        keyword: angleTarget.keyword.keyword,
      });
      await queueNext(req, runKey);
      return NextResponse.json({ ok: true, queued: true, phase: "angles" });
    }

    const plan = finalizeStagedPlan(draft, settings);
    const workspace = await persistWeeklyPlan(
      plan,
      sources,
      Number(settings.dailyArticleLimit),
    );
    await saveWeeklyPlanningProgress({
      runKey,
      weekStart: progress.weekStart,
      mode: "manual",
      settings,
      draft,
      sources,
      status: "ready",
    });
    await finishRun(automationRunId, "success", {
      runKey,
      phase: "finalize",
      categories: plan.categories.length,
      tasks: workspace.tasks.length,
    });
    return NextResponse.json({
      ok: true,
      ready: true,
      phase: "finalize",
      tasks: workspace.tasks.length,
    });
  } catch (error: any) {
    if (automationRunId)
      await finishRun(automationRunId, "failed", {
        error: error?.message || "manual weekly worker failed",
      }).catch(() => {});
    return NextResponse.json(
      { error: error?.message || "주간 계획 백그라운드 실행 실패" },
      { status: 500 },
    );
  }
}
