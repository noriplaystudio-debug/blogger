import { NextResponse } from "next/server";
import {
  getAutomationConfig,
  getOperationalStats,
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
  return {
    requested: Number(detail?.requested || 0),
    processed: Number(detail?.processed || 0),
    syncedDrafts: Number(detail?.syncedDrafts || 0),
    deferred: Number(detail?.deferred || 0),
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
    const [config, operational, runs, audit] = await Promise.all([
      getAutomationConfig(),
      getOperationalStats(),
      recentRuns(),
      recentAuditEvents(),
    ]);

    const latestDaily = runs.find((run: any) => run.kind === "daily-production") || null;
    const publicationAudit = audit
      .filter((event: any) =>
        ["post_published", "published_reused", "draft_created", "draft_reused", "draft_updated", "draft_recreated"].includes(event.action),
      )
      .slice(0, 10)
      .map((event: any) => ({
        action: event.action,
        createdAt: event.createdAt,
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
        },
        operational,
        latestDailyRun: latestDaily
          ? {
              status: latestDaily.status,
              startedAt: latestDaily.started_at,
              finishedAt: latestDaily.finished_at,
              detail: safeRunDetail(latestDaily.detail),
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
