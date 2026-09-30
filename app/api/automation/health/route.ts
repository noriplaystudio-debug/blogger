import { NextResponse } from "next/server";
import {
  getAutomationConfig,
  getOperationalStats,
  getWorkspace,
  getMonthlyCostSummary,
  hasDatabase,
  recentAuditEvents,
  recentRuns,
} from "@/lib/store";

export const dynamic = "force-dynamic";

function koreaDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    time: `${pick("hour")}:${pick("minute")}:${pick("second")}`,
  };
}

function safeRunDetail(detail: any) {
  const results = Array.isArray(detail?.results) ? detail.results : [];
  const count = (key: string) =>
    Number.isFinite(Number(detail?.[key])) ? Number(detail[key]) : 0;
  return {
    requested: count("requested"),
    queued: count("queued"),
    queuedReady: count("queuedReady"),
    queuedProduction: count("queuedProduction"),
    dispatched: count("dispatched"),
    dispatchFailures: count("dispatchFailures"),
    workerFailures: count("workerFailures"),
    systemicFailures: count("systemicFailures"),
    sourceBlocked: count("sourceBlocked"),
    workerStates: detail?.workerStates && typeof detail.workerStates === "object"
      ? Object.fromEntries(
          Object.entries(detail.workerStates).map(([key, value]) => [key, Number(value) || 0]),
        )
      : {},
    publishedToday: count("publishedToday"),
    reserved: count("reserved"),
    recovered: count("recovered"),
    processed: count("processed"),
    syncedDrafts: count("syncedDrafts"),
    successful: count("successful"),
    deferred: count("deferred"),
    workerBypassConfigured:
      typeof detail?.workerBypassConfigured === "boolean"
        ? detail.workerBypassConfigured
        : null,
    resultStates: results.reduce((acc: Record<string, number>, item: any) => {
      const key = String(item?.state || "unknown");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
}

export async function GET() {
  if (!hasDatabase())
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL이 설정되지 않았습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );

  try {
    const [config, operational, workspace, runs, audit, monthlyCosts] = await Promise.all([
      getAutomationConfig(),
      getOperationalStats(),
      getWorkspace(),
      recentRuns(),
      recentAuditEvents(),
      getMonthlyCostSummary(),
    ]);

    const latestDaily =
      runs.find((run: any) => run.kind === "daily-production") || null;
    const latestWeekly =
      runs.find((run: any) =>
        ["weekly-plan", "weekly-plan-manual-step"].includes(run.kind),
      ) || null;
    const publicationAudit = audit
      .filter((event: any) =>
        ["post_published", "published_reused", "draft_created", "draft_reused", "draft_updated", "draft_recreated"].includes(event.action),
      )
      .slice(0, 10)
      .map((event: any) => ({
        action: event.action,
        createdAt: event.createdAt,
      }));

    const planCategories = Array.isArray(workspace.plan?.categories)
      ? workspace.plan.categories
      : [];
    const planKeywordCount = planCategories.reduce(
      (sum: number, category: any) =>
        sum + (Array.isArray(category.keywords) ? category.keywords.length : 0),
      0,
    );
    const planArticleCapacity = planCategories.reduce(
      (sum: number, category: any) =>
        sum +
        (Array.isArray(category.keywords)
          ? category.keywords.reduce(
              (keywordSum: number, keyword: any) =>
                keywordSum +
                (Array.isArray(keyword.angles) ? keyword.angles.length : 0),
              0,
            )
          : 0),
      0,
    );
    const weeklyTarget = config.dailyArticleLimit * 7;
    const workerRuns = runs
      .filter((run: any) => run.kind === "article-worker")
      .slice(0, 20);
    const workerSummary = workerRuns.reduce(
      (acc: Record<string, number>, run: any) => {
        const key = String(run.status || "unknown");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {},
    );
    const recentWorkerErrors = workerRuns
      .filter((run: any) => run.status === "failed" && run.detail?.error)
      .slice(0, 10)
      .map((run: any) => ({
        error: String(run.detail.error).slice(0, 300),
        systemic: Boolean(run.detail.systemic),
      }));

    const nowKst = koreaDateTimeParts();

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        korea: nowKst,
        automation: {
          enabled: config.enabled,
          autoPublish: config.autoPublish,
          dailyArticleLimit: config.dailyArticleLimit,
          primaryBlogName: process.env.PRIMARY_BLOGGER_NAME?.trim() || "장학짱",
          workerBypassConfigured: Boolean(
            process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim(),
          ),
        },
        operational,
        budget: {
          monthlyAiBudgetWon: config.monthlyAiBudgetWon,
          estimatedArticleCostWon: config.estimatedArticleCostWon,
          estimatedWeeklyPlanCostWon: config.estimatedWeeklyPlanCostWon,
          estimatedAnalysisCostWon: config.estimatedAnalysisCostWon,
          aiCostWon: monthlyCosts.aiCostWon,
          byKind: monthlyCosts.byKind,
          pausedByConfiguredLimit:
            config.pauseOnBudget &&
            config.monthlyAiBudgetWon > 0 &&
            monthlyCosts.aiCostWon + config.estimatedArticleCostWon >
              config.monthlyAiBudgetWon,
        },
        weeklyPlan: {
          categories: planCategories.length,
          keywords: planKeywordCount,
          articleCapacity: planArticleCapacity,
          target: weeklyTarget,
          deficit: Math.max(0, weeklyTarget - planArticleCapacity),
        },
        recentArticleWorkers: workerSummary,
        recentWorkerErrors,
        latestDailyRun: latestDaily
          ? {
              status: latestDaily.status,
              startedAt: latestDaily.started_at,
              finishedAt: latestDaily.finished_at,
              detail: safeRunDetail(latestDaily.detail),
            }
          : null,
        latestWeeklyRun: latestWeekly
          ? {
              kind: latestWeekly.kind,
              status: latestWeekly.status,
              startedAt: latestWeekly.started_at,
              finishedAt: latestWeekly.finished_at,
              phase: String(latestWeekly.detail?.phase || latestWeekly.detail?.status || ""),
            }
          : null,
        recentPublicationActivity: publicationAudit,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "운영 상태 조회 실패" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
