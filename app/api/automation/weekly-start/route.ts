import { after, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getAutomationConfig,
  getCurrentWeekPlan,
  hasDatabase,
  mondayOfKoreaWeek,
  reserveEstimatedCost,
  saveAutomationConfig,
  saveWeeklyPlanningProgress,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!hasDatabase())
      return NextResponse.json({ error: "DATABASE_URL이 없습니다." }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const current = await getAutomationConfig();
    const settings = {
      categoryCount: Number(body.categoryCount ?? current.categoryCount),
      keywordsPerCategory: Number(
        body.keywordsPerCategory ?? current.keywordsPerCategory,
      ),
      articlesPerKeyword: Number(
        body.articlesPerKeyword ?? current.articlesPerKeyword,
      ),
      dailyArticleLimit: Number(
        body.dailyArticleLimit ?? current.dailyArticleLimit,
      ),
    };
    await saveAutomationConfig(settings);
    const weekStart = mondayOfKoreaWeek();
    const currentWeek = await getCurrentWeekPlan();
    const existingPlan = currentWeek?.plan;
    const existingCategories = Array.isArray(existingPlan?.categories)
      ? existingPlan.categories
      : [];
    const existingArticleCapacity = existingCategories.reduce(
      (sum: number, category: any) =>
        sum +
        (Array.isArray(category?.keywords)
          ? category.keywords.reduce(
              (keywordSum: number, keyword: any) =>
                keywordSum +
                (Array.isArray(keyword?.angles) && keyword.angles.length
                  ? keyword.angles.length
                  : Number(
                      keyword?.articleCountOverride ||
                        settings.articlesPerKeyword,
                    )),
              0,
            )
          : 0),
      0,
    );
    const weeklyArticleTarget = settings.dailyArticleLimit * 7;
    const canResumeExisting =
      existingCategories.length > 0 &&
      existingArticleCapacity < weeklyArticleTarget;

    if (
      existingCategories.length >= settings.categoryCount &&
      existingArticleCapacity >= weeklyArticleTarget
    )
      return NextResponse.json({
        ok: true,
        status: "ready",
        alreadyComplete: true,
        existingCategoryCount: existingCategories.length,
        existingArticleCapacity,
        weeklyArticleTarget,
      });

    const runKey = `manual:${randomUUID()}`;
    const reservation = await reserveEstimatedCost({
      jobId: `manual-weekly-plan:${runKey}`,
      kind: "weekly-plan",
      amountWon: current.estimatedWeeklyPlanCostWon,
      detail: { basis: "user-configured-estimate", mode: "manual-background" },
    });
    if (!reservation.allowed)
      return NextResponse.json(
        { error: "월 AI 예산 한도로 주간 조사를 시작하지 않았습니다." },
        { status: 429 },
      );

    await saveWeeklyPlanningProgress({
      runKey,
      weekStart,
      mode: "manual",
      settings,
      draft: canResumeExisting
        ? {
            ...existingPlan,
            categories: existingCategories,
            resumedFromExistingPlan: true,
          }
        : null,
      sources: canResumeExisting ? currentWeek?.sources || [] : [],
      status: "running",
    });

    const origin = new URL(req.url).origin;
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET이 없습니다.");
    after(async () => {
      await fetch(
        `${origin}/api/cron/weekly-manual-worker?runKey=${encodeURIComponent(runKey)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}` },
          cache: "no-store",
        },
      ).catch(() => {});
    });

    return NextResponse.json({
      ok: true,
      runKey,
      status: "running",
      resumedExistingPlan: canResumeExisting,
      existingCategoryCount: canResumeExisting ? existingCategories.length : 0,
      existingArticleCapacity: canResumeExisting ? existingArticleCapacity : 0,
      weeklyArticleTarget,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "주간 계획 시작 실패" },
      { status: 500 },
    );
  }
}
