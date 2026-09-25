import { NextRequest, NextResponse } from "next/server";
import {
  getAutomationConfig,
  hasDatabase,
  saveAutomationConfig,
} from "@/lib/store";

export async function GET() {
  if (!hasDatabase())
    return NextResponse.json({ configured: false, enabled: false });
  try {
    return NextResponse.json({
      configured: true,
      ...(await getAutomationConfig()),
    });
  } catch (error: any) {
    return NextResponse.json(
      { configured: false, enabled: false, error: error.message },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!hasDatabase())
      return NextResponse.json(
        { error: "DATABASE_URL을 먼저 설정하세요." },
        { status: 400 },
      );
    const body = await req.json();
    const saved = await saveAutomationConfig({
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(body.categoryCount !== undefined
        ? { categoryCount: Number(body.categoryCount) }
        : {}),
      ...(body.keywordsPerCategory !== undefined
        ? { keywordsPerCategory: Number(body.keywordsPerCategory) }
        : {}),
      ...(body.articlesPerKeyword !== undefined
        ? { articlesPerKeyword: Number(body.articlesPerKeyword) }
        : {}),
      ...(body.dailyArticleLimit !== undefined
        ? { dailyArticleLimit: Number(body.dailyArticleLimit) }
        : {}),
      ...(typeof body.autoPublish === "boolean"
        ? { autoPublish: body.autoPublish }
        : {}),
      ...(body.writerModel ? { writerModel: body.writerModel } : {}),
      ...(body.reviewerModel ? { reviewerModel: body.reviewerModel } : {}),
      ...(typeof body.styleGuide === "string" && body.styleGuide.trim()
        ? { styleGuide: body.styleGuide.trim() }
        : {}),
      ...(body.categoryBlogMap
        ? { categoryBlogMap: body.categoryBlogMap }
        : {}),
      ...(body.categoryStyleMap
        ? { categoryStyleMap: body.categoryStyleMap }
        : {}),
      ...(body.revenueGoalMonthly !== undefined
        ? { revenueGoalMonthly: Number(body.revenueGoalMonthly) }
        : {}),
      ...(body.revenueGoalMonths !== undefined
        ? { revenueGoalMonths: Number(body.revenueGoalMonths) }
        : {}),
      ...(Array.isArray(body.revenueStreams)
        ? { revenueStreams: body.revenueStreams.map(String) }
        : {}),
      ...(body.estimatedArticleCostWon !== undefined
        ? { estimatedArticleCostWon: Number(body.estimatedArticleCostWon) }
        : {}),
      ...(body.estimatedWeeklyPlanCostWon !== undefined
        ? {
            estimatedWeeklyPlanCostWon: Number(body.estimatedWeeklyPlanCostWon),
          }
        : {}),
      ...(body.estimatedAnalysisCostWon !== undefined
        ? { estimatedAnalysisCostWon: Number(body.estimatedAnalysisCostWon) }
        : {}),
      ...(body.monthlyFixedCostWon !== undefined
        ? { monthlyFixedCostWon: Number(body.monthlyFixedCostWon) }
        : {}),
      ...(body.monthlyAiBudgetWon !== undefined
        ? { monthlyAiBudgetWon: Number(body.monthlyAiBudgetWon) }
        : {}),
      ...(typeof body.pauseOnBudget === "boolean"
        ? { pauseOnBudget: body.pauseOnBudget }
        : {}),
    });
    return NextResponse.json({ ok: true, ...saved });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "자동화 설정 저장 실패" },
      { status: 500 },
    );
  }
}
