import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { assertCron } from "@/lib/cron";
import { refreshPerformanceLearning } from "@/lib/performance";
import {
  acquireAutomationLock,
  finishRun,
  getAutomationConfig,
  hasDatabase,
  mondayOfKoreaWeek,
  releaseAutomationLock,
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
    const config = await getAutomationConfig();
    if (!config.enabled)
      return NextResponse.json({
        skipped: true,
        reason: "automation disabled",
      });
    lockOwner = await acquireAutomationLock("weekly-performance-learning", 15);
    if (!lockOwner)
      return NextResponse.json({
        skipped: true,
        reason: "performance learning already running",
      });
    runId = await startRun("weekly-performance-learning");
    const reports = await refreshPerformanceLearning(
      `performance:${mondayOfKoreaWeek()}:${randomUUID()}`,
    );
    const detail = {
      blogs: reports.length,
      ready: reports.filter((item) => item.status === "ready").length,
      insufficient: reports.filter(
        (item) => item.status === "insufficient_data",
      ).length,
      budgetPaused: reports.filter((item) => item.status === "budget_paused")
        .length,
    };
    await finishRun(
      runId,
      reports.some((item) => ["error", "budget_paused"].includes(item.status))
        ? "partial"
        : "success",
      detail,
    );
    return NextResponse.json({ ok: true, ...detail });
  } catch (error: any) {
    if (runId) await finishRun(runId, "failed", { error: error.message });
    return NextResponse.json(
      { error: error.message || "주간 성과 학습 실패" },
      { status: error.message === "UNAUTHORIZED_CRON" ? 401 : 500 },
    );
  } finally {
    await releaseAutomationLock("weekly-performance-learning", lockOwner);
  }
}
