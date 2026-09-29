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

function plannedArticleCapacity(draft: any, settings: any) {
  return (draft?.categories || [])
    .filter((category: any) => !category?.planningSkipped)
    .reduce(
      (sum: number, category: any) =>
        sum +
        (category.keywords || [])
          .filter((keyword: any) => !keyword?.planningSkipped)
          .reduce(
            (keywordSum: number, keyword: any) =>
              keywordSum +
              (Array.isArray(keyword.angles) && keyword.angles.length
                ? keyword.angles.length
                : Number(
                    keyword.articleCountOverride ||
                      settings.articlesPerKeyword,
                  )),
            0,
          ),
      0,
    );
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
  let activeRunKey = "";
  try {
    assertCron(req);
    if (!hasDatabase()) throw new Error("DATABASE_URL이 없습니다.");
    if (!process.env.OPENAI_API_KEY)
      throw new Error("OPENAI_API_KEY가 없습니다.");

    const runKey = String(req.nextUrl.searchParams.get("runKey") || "").slice(0, 120);
    activeRunKey = runKey;
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
        error: null,
        failures: 0,
      });
      await finishRun(automationRunId, "success", { runKey, phase: "categories" });
      await queueNext(req, runKey);
      return NextResponse.json({ ok: true, queued: true, phase: "categories" });
    }

    let completedCategoryCount = (draft.categories || []).filter(
      (category: any) =>
        !category?.planningSkipped &&
        Array.isArray(category.keywords) &&
        category.keywords.length > 0,
    ).length;
    const weeklyArticleTarget = Number(settings.dailyArticleLimit) * 7;
    let articleCapacity = plannedArticleCapacity(draft, settings);

    const activeCandidates = () =>
      (draft.categories || []).filter(
        (category: any) => !category?.planningSkipped,
      );

    // Once the base category target is met, keep using reserve categories only
    // when consolidation leaves the week short of seven days of content.
    if (
      completedCategoryCount >= Number(settings.categoryCount) &&
      articleCapacity >= weeklyArticleTarget
    ) {
      for (const category of draft.categories || []) {
        if (
          !category?.planningSkipped &&
          (!Array.isArray(category.keywords) || category.keywords.length === 0)
        )
          category.planningSkipped = true;
      }
    }

    const hasUnprocessedCandidate = () =>
      activeCandidates().some(
        (category: any) =>
          !Array.isArray(category.keywords) || category.keywords.length === 0,
      );

    if (
      (completedCategoryCount < Number(settings.categoryCount) ||
        articleCapacity < weeklyArticleTarget) &&
      !hasUnprocessedCandidate() &&
      activeCandidates().length < 20
    ) {
      const [performanceGuidance, strategyGuidance] = await Promise.all([
        getPortfolioPerformanceGuidance(),
        getStrategyGuidance(),
      ]);
      const categoryResult = await createCategoryStage(process.env.OPENAI_API_KEY, {
        categoryPortfolio: (draft.categories || []).map(
          (category: any) => category.name,
        ),
        recentKeywords,
        recentContent,
        settings,
        performanceGuidance,
        strategyGuidance,
      });
      const existingNames = new Set(
        (draft.categories || []).map((category: any) =>
          String(category?.name || "").trim().toLowerCase(),
        ),
      );
      let addedCategories = 0;
      for (const category of categoryResult.draft?.categories || []) {
        if (activeCandidates().length >= 20) break;
        const key = String(category?.name || "").trim().toLowerCase();
        if (!key || existingNames.has(key)) continue;
        existingNames.add(key);
        draft.categories.push({
          ...category,
          supplementalCategory: true,
        });
        addedCategories += 1;
      }
      draft.supplementFailures = addedCategories
        ? 0
        : Number(draft.supplementFailures || 0) + 1;
      sources = mergeSources(sources, categoryResult.sources || []);
      await saveWeeklyPlanningProgress({
        runKey,
        weekStart: progress.weekStart,
        mode: "manual",
        settings,
        draft,
        sources,
        status: "running",
        error: null,
        failures: 0,
      });
      articleCapacity = plannedArticleCapacity(draft, settings);
      if (
        addedCategories === 0 &&
        Number(draft.supplementFailures || 0) < 3
      ) {
        await finishRun(automationRunId, "partial", {
          runKey,
          phase: "supplement-categories",
          supplementFailures: Number(draft.supplementFailures || 0),
        });
        await queueNext(req, runKey);
        return NextResponse.json({
          ok: true,
          queued: true,
          phase: "supplement-categories",
        });
      }
    }

    const categoryNeedingKeywords = draft.categories?.find(
      (category: any) =>
        !category?.planningSkipped &&
        (!Array.isArray(category.keywords) || category.keywords.length === 0),
    );
    if (categoryNeedingKeywords) {
      try {
        const result = await createKeywordStage(process.env.OPENAI_API_KEY, {
          category: categoryNeedingKeywords,
          settings,
          recentKeywords,
          recentContent,
        });
        categoryNeedingKeywords.keywords = result.keywords;
        categoryNeedingKeywords.planningFailures = 0;
        sources = mergeSources(sources, result.sources || []);
        await saveWeeklyPlanningProgress({
          runKey,
          weekStart: progress.weekStart,
          mode: "manual",
          settings,
          draft,
          sources,
          status: "running",
          error: null,
          failures: 0,
        });
        await finishRun(automationRunId, "success", {
          runKey,
          phase: "keywords",
          category: categoryNeedingKeywords.name,
        });
      } catch (error: any) {
        const failures = Number(categoryNeedingKeywords.planningFailures || 0) + 1;
        categoryNeedingKeywords.planningFailures = failures;
        if (failures >= 2) categoryNeedingKeywords.planningSkipped = true;
        await saveWeeklyPlanningProgress({
          runKey,
          weekStart: progress.weekStart,
          mode: "manual",
          settings,
          draft,
          sources,
          status: "running",
          error: failures >= 2
            ? `${categoryNeedingKeywords.name}: 키워드 검증 반복 실패로 이 후보만 제외하고 다음 후보로 진행합니다.`
            : error?.message || "키워드 조사 실패",
          failures: 0,
        });
        await finishRun(automationRunId, "partial", {
          runKey,
          phase: "keywords",
          category: categoryNeedingKeywords.name,
          skipped: failures >= 2,
          error: error?.message || "keyword planning failed",
        });
      }
      await queueNext(req, runKey);
      return NextResponse.json({ ok: true, queued: true, phase: "keywords" });
    }

    let generatedAngles = 0;
    for (const category of draft.categories || []) {
      if (category?.planningSkipped) continue;
      for (const keyword of category.keywords || []) {
        if (keyword?.planningSkipped) continue;
        if (
          !Array.isArray(keyword.angles) ||
          keyword.angles.length !== Number(
              keyword.articleCountOverride || settings.articlesPerKeyword,
            )
        ) {
          const result = await createAngleStage(process.env.OPENAI_API_KEY, {
            category,
            keyword,
            settings,
          });
          keyword.angles = result.angles;
          keyword.planningFailures = 0;
          generatedAngles += 1;
        }
      }
    }
    if (generatedAngles > 0) {
      await saveWeeklyPlanningProgress({
        runKey,
        weekStart: progress.weekStart,
        mode: "manual",
        settings,
        draft,
        sources,
        status: "running",
        error: null,
        failures: 0,
      });
      await finishRun(automationRunId, "success", {
        runKey,
        phase: "angles",
        generated: generatedAngles,
      });
      automationRunId = await startRun("weekly-plan-manual-step");
    }

    const finalDraft = {
      ...draft,
      categories: (draft.categories || [])
        .filter((category: any) => !category?.planningSkipped)
        .map((category: any) => ({
          ...category,
          keywords: (category.keywords || []).filter(
            (keyword: any) => !keyword?.planningSkipped,
          ),
        }))
        .filter((category: any) => category.keywords.length > 0),
    };
    const plan = finalizeStagedPlan(finalDraft, settings);
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
      error: null,
      failures: 0,
    });
    await finishRun(automationRunId, "success", {
      runKey,
      phase: "finalize",
      categories: plan.categories.length,
      tasks: workspace.tasks.length,
      articleCapacity: plan.categories.reduce(
        (sum: number, category: any) =>
          sum +
          category.keywords.reduce(
            (keywordSum: number, keyword: any) =>
              keywordSum + keyword.angles.length,
            0,
          ),
        0,
      ),
      weeklyArticleTarget,
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
    if (activeRunKey) {
      const progress = await getWeeklyPlanningProgress(activeRunKey).catch(() => null);
      if (progress) {
        const failures = Number(progress.failures || 0) + 1;
        const retrying = failures < 4;
        await saveWeeklyPlanningProgress({
          runKey: activeRunKey,
          weekStart: progress.weekStart,
          mode: "manual",
          settings: progress.settings,
          draft: progress.draft,
          sources: progress.sources || [],
          status: retrying ? "running" : "failed",
          error: error?.message || "주간 계획 백그라운드 실행 실패",
          failures,
        }).catch(() => {});
        if (retrying) await queueNext(req, activeRunKey).catch(() => {});
      }
    }
    return NextResponse.json(
      {
        error: error?.message || "주간 계획 백그라운드 실행 실패",
        retryScheduled: Boolean(activeRunKey),
      },
      { status: 500 },
    );
  }
}
