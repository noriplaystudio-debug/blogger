import { NextRequest, NextResponse } from "next/server";
import { assertCron } from "@/lib/cron";
import {
  createAngleStage,
  createCategoryStage,
  createKeywordStage,
  finalizeStagedPlan,
} from "@/lib/planning";
import {
  acquireAutomationLock,
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
  releaseAutomationLock,
  reserveEstimatedCost,
  saveWeeklyPlanningProgress,
  startRun,
  weeklyPlanExists,
} from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_STAGE_CALLS_PER_INVOCATION = 4;

function mergeSources(left: any[] = [], right: any[] = []) {
  return [
    ...new Map(
      [...left, ...right]
        .filter((source: any) => source?.url)
        .map((source: any) => [String(source.url), source]),
    ).values(),
  ];
}

function sameSettings(left: any, right: any) {
  return (
    Number(left?.categoryCount) === Number(right?.categoryCount) &&
    Number(left?.keywordsPerCategory) === Number(right?.keywordsPerCategory) &&
    Number(left?.articlesPerKeyword) === Number(right?.articlesPerKeyword) &&
    Number(left?.dailyArticleLimit) === Number(right?.dailyArticleLimit)
  );
}

export async function GET(req: NextRequest) {
  let runId: number | undefined;
  let lockOwner: string | null = null;
  const weekStart = mondayOfKoreaWeek();
  const runKey = `automatic:${weekStart}`;

  try {
    assertCron(req);
    if (!hasDatabase()) throw new Error("DATABASE_URL이 없습니다.");
    if (!process.env.OPENAI_API_KEY)
      throw new Error("OPENAI_API_KEY가 없습니다.");

    const config = await getAutomationConfig();
    if (!config.enabled)
      return NextResponse.json({ skipped: true, reason: "automation disabled" });

    if (await weeklyPlanExists(weekStart))
      return NextResponse.json({
        skipped: true,
        reason: "weekly plan already ready",
        weekStart,
      });

    lockOwner = await acquireAutomationLock("weekly-plan", 10);
    if (!lockOwner)
      return NextResponse.json({
        skipped: true,
        reason: "weekly plan already running",
        weekStart,
      });

    const reservation = await reserveEstimatedCost({
      jobId: `weekly-plan:${weekStart}`,
      kind: "weekly-plan",
      amountWon: config.estimatedWeeklyPlanCostWon,
      detail: { basis: "user-configured-estimate", mode: "automatic-resumable" },
    });
    if (!reservation.allowed)
      return NextResponse.json({
        skipped: true,
        reason: "monthly AI budget reached",
        budget: reservation,
      });

    runId = await startRun("weekly-plan");
    const settings = {
      categoryCount: config.categoryCount,
      keywordsPerCategory: config.keywordsPerCategory,
      articlesPerKeyword: config.articlesPerKeyword,
      dailyArticleLimit: config.dailyArticleLimit,
    };

    const [
      recentKeywords,
      recentContent,
      performanceGuidance,
      strategyGuidance,
    ] = await Promise.all([
      getRecentKeywords(),
      getRecentContentInventory(150),
      getPortfolioPerformanceGuidance(),
      getStrategyGuidance(),
    ]);

    let progress = await getWeeklyPlanningProgress(runKey);
    if (progress && !sameSettings(progress.settings, settings)) progress = null;

    let draft: any = progress?.draft || null;
    let sources: any[] = progress?.sources || [];
    let stageCalls = 0;

    if (!draft && stageCalls < MAX_STAGE_CALLS_PER_INVOCATION) {
      const categoryResult = await createCategoryStage(process.env.OPENAI_API_KEY, {
        categoryPortfolio: Object.entries(config.categoryBlogMap)
          .filter(([, blogId]) => Boolean(blogId))
          .map(([category]) => category),
        recentKeywords,
        recentContent,
        settings,
        performanceGuidance,
        strategyGuidance,
      });
      draft = categoryResult.draft;
      sources = mergeSources(sources, categoryResult.sources || []);
      stageCalls += 1;
      await saveWeeklyPlanningProgress({
        runKey,
        weekStart,
        mode: "automatic",
        settings,
        draft,
        sources,
        status: "running",
      });
    }

    while (draft && stageCalls < MAX_STAGE_CALLS_PER_INVOCATION) {
      const categoryNeedingKeywords = draft.categories.find(
        (category: any) =>
          !Array.isArray(category.keywords) || category.keywords.length === 0,
      );
      if (categoryNeedingKeywords) {
        const keywordResult = await createKeywordStage(process.env.OPENAI_API_KEY, {
          category: categoryNeedingKeywords,
          settings,
          recentKeywords,
          recentContent,
        });
        categoryNeedingKeywords.keywords = keywordResult.keywords;
        sources = mergeSources(sources, keywordResult.sources || []);
        stageCalls += 1;
        await saveWeeklyPlanningProgress({
          runKey,
          weekStart,
          mode: "automatic",
          settings,
          draft,
          sources,
          status: "running",
        });
        continue;
      }

      let angleTarget: { category: any; keyword: any } | null = null;
      for (const category of draft.categories) {
        for (const keyword of category.keywords || []) {
          if (
            !Array.isArray(keyword.angles) ||
            keyword.angles.length !== settings.articlesPerKeyword
          ) {
            angleTarget = { category, keyword };
            break;
          }
        }
        if (angleTarget) break;
      }

      if (angleTarget) {
        const angleResult = await createAngleStage(process.env.OPENAI_API_KEY, {
          category: angleTarget.category,
          keyword: angleTarget.keyword,
          settings,
        });
        angleTarget.keyword.angles = angleResult.angles;
        stageCalls += 1;
        await saveWeeklyPlanningProgress({
          runKey,
          weekStart,
          mode: "automatic",
          settings,
          draft,
          sources,
          status: "running",
        });
        continue;
      }

      break;
    }

    const incompleteCategories = (draft?.categories || []).filter(
      (category: any) =>
        !Array.isArray(category.keywords) ||
        category.keywords.length === 0 ||
        category.keywords.some(
          (keyword: any) =>
            !Array.isArray(keyword.angles) ||
            keyword.angles.length !== settings.articlesPerKeyword,
        ),
    ).length;

    if (incompleteCategories > 0) {
      const detail = {
        weekStart,
        resumed: Boolean(progress),
        stageCalls,
        incompleteCategories,
        status: "saved-for-resume",
      };
      if (runId) await finishRun(runId, "partial", detail);
      return NextResponse.json({ ok: true, partial: true, ...detail });
    }

    const plan = finalizeStagedPlan(draft, settings);
    const workspace = await persistWeeklyPlan(
      plan,
      sources,
      config.dailyArticleLimit,
    );
    await saveWeeklyPlanningProgress({
      runKey,
      weekStart,
      mode: "automatic",
      settings,
      draft,
      sources,
      status: "ready",
    });

    const categoryCount = plan.categories.length;
    const keywordCount = plan.categories.reduce(
      (sum: number, category: any) => sum + category.keywords.length,
      0,
    );
    const articleCount = plan.categories.reduce(
      (sum: number, category: any) =>
        sum +
        category.keywords.reduce(
          (keywordSum: number, keyword: any) =>
            keywordSum + keyword.angles.length,
          0,
        ),
      0,
    );
    const detail = {
      weekLabel: plan.weekLabel,
      categories: categoryCount,
      keywords: keywordCount,
      articles: articleCount,
      rejected: plan.qualityGate?.rejected?.length || 0,
      dailyLimit: config.dailyArticleLimit,
      resumed: Boolean(progress),
    };
    if (runId) await finishRun(runId, "success", detail);
    return NextResponse.json({
      ok: true,
      ...detail,
      tasks: workspace.tasks.length,
    });
  } catch (error: any) {
    if (runId) await finishRun(runId, "failed", { error: error.message, weekStart });
    return NextResponse.json(
      {
        error: error.message || "주간 자동 조사 실패",
        weekStart,
        resumable: true,
      },
      { status: error.message === "UNAUTHORIZED_CRON" ? 401 : 500 },
    );
  } finally {
    await releaseAutomationLock("weekly-plan", lockOwner);
  }
}
