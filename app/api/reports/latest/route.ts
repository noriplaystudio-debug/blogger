import { NextRequest, NextResponse } from "next/server";
import { isValidReportRequest, reportTokenConfigured } from "@/lib/report-auth";
import {
  getAutomationConfig,
  getMonthlyCostSummary,
  getOperationalStats,
  getPerformanceReports,
  getStrategyProgressStats,
  getWorkspace,
  hasDatabase,
  recentAuditEvents,
  recentRuns,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Read-only report endpoint for a scheduled runner. It never returns article
 * bodies, API keys, OAuth tokens, or editing instructions.
 */
export async function GET(req: NextRequest) {
  if (!reportTokenConfigured())
    return NextResponse.json(
      { error: "REPORT_ACCESS_TOKEN이 설정되지 않았습니다.", code: "REPORT_AUTH_NOT_CONFIGURED" },
      { status: 503 },
    );
  if (!isValidReportRequest(req))
    return NextResponse.json(
      { error: "예약 보고 인증이 필요합니다.", code: "REPORT_AUTH_REQUIRED", loginUrl: "/login" },
      { status: 401 },
    );
  if (!hasDatabase())
    return NextResponse.json(
      { error: "DATABASE_URL이 설정되지 않았습니다.", code: "REPORT_DATABASE_REQUIRED" },
      { status: 503 },
    );
  try {
    const [config, workspace, runs, operational, costs, progress, performance, audit] =
      await Promise.all([
        getAutomationConfig(),
        getWorkspace(),
        recentRuns(),
        getOperationalStats(),
        getMonthlyCostSummary(),
        getStrategyProgressStats(),
        getPerformanceReports(),
        recentAuditEvents(),
      ]);
    const jobs = workspace.tasks.map((task: any) => ({
      id: task.id,
      category: task.category,
      keyword: task.keyword,
      title: task.article?.title || task.angle?.titleIdea || "",
      state: task.state,
      blogId: task.blogId,
      postId: task.postId,
      error: task.error,
      attempts: task.attempts,
      scheduledDate: task.scheduledDate,
    }));
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        automation: {
          enabled: config.enabled,
          autoPublish: config.autoPublish,
          dailyArticleLimit: config.dailyArticleLimit,
          revenueGoalMonthly: config.revenueGoalMonthly,
          revenueGoalMonths: config.revenueGoalMonths,
        },
        operational,
        progress,
        costs,
        plan: workspace.plan
          ? { weekLabel: workspace.plan.weekLabel, categories: workspace.plan.categories?.map((category: any) => ({ name: category.name, keywords: category.keywords?.map((keyword: any) => keyword.keyword) })) }
          : null,
        jobs,
        performance,
        runs,
        audit,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "예약 보고 생성 실패", code: "REPORT_GENERATION_FAILED" },
      { status: 500 },
    );
  }
}
