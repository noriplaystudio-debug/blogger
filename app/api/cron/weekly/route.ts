import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { assertCron } from "@/lib/cron";
import { createWeeklyPlanStaged } from "@/lib/planning";
import {
  acquireAutomationLock,
  finishRun,
  getAutomationConfig,
  getPortfolioPerformanceGuidance,
  getRecentContentInventory,
  getRecentKeywords,
  getStrategyGuidance,
  hasDatabase,
  mondayOfKoreaWeek,
  persistWeeklyPlan,
  releaseAutomationLock,
  reserveEstimatedCost,
  startRun,
} from "@/lib/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let runId: number | undefined;
  let lockOwner: string | null = null;
  try {
    assertCron(req);
    if (!hasDatabase()) throw new Error("DATABASE_URL이 없습니다.");
    if (!process.env.OPENAI_API_KEY)
      throw new Error("OPENAI_API_KEY가 없습니다.");
    const config = await getAutomationConfig();
    if (!config.enabled)
      return NextResponse.json({
        skipped: true,
        reason: "automation disabled",
      });
    lockOwner = await acquireAutomationLock("weekly-plan", 15);
    if (!lockOwner)
      return NextResponse.json({
        skipped: true,
        reason: "weekly plan already running",
      });
    const reservation = await reserveEstimatedCost({
      jobId: `weekly-plan:${mondayOfKoreaWeek()}:${randomUUID()}`,
      kind: "weekly-plan",
      amountWon: config.estimatedWeeklyPlanCostWon,
      detail: { basis: "user-configured-estimate", mode: "automatic" },
    });
    if (!reservation.allowed)
      return NextResponse.json({
        skipped: true,
        reason: "monthly AI budget reached",
        budget: reservation,
      });
    runId = await startRun("weekly-plan");
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
    const settings = {
      categoryCount: config.categoryCount,
      keywordsPerCategory: config.keywordsPerCategory,
      articlesPerKeyword: config.articlesPerKeyword,
      dailyArticleLimit: config.dailyArticleLimit,
    };
    const { plan, sources } = await createWeeklyPlanStaged(
      process.env.OPENAI_API_KEY,
      {
        categoryPortfolio: Object.entries(config.categoryBlogMap)
          .filter(([, blogId]) => Boolean(blogId))
          .map(([category]) => category),
        recentKeywords,
        recentContent,
        settings,
        performanceGuidance,
        strategyGuidance,
      },
    );
    const workspace = await persistWeeklyPlan(
      plan,
      sources,
      config.dailyArticleLimit,
    );
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
    };
    await finishRun(runId, "success", detail);
    return NextResponse.json({
      ok: true,
      ...detail,
      tasks: workspace.tasks.length,
    });
  } catch (error: any) {
    if (runId) await finishRun(runId, "failed", { error: error.message });
    return NextResponse.json(
      { error: error.message || "주간 자동 조사 실패" },
      { status: error.message === "UNAUTHORIZED_CRON" ? 401 : 500 },
    );
  } finally {
    await releaseAutomationLock("weekly-plan", lockOwner);
  }
}
