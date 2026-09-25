import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { assertCron } from "@/lib/cron";
import { refreshRevenueStrategy } from "@/lib/strategy";
import {
  acquireAutomationLock,
  finishRun,
  getAutomationConfig,
  hasDatabase,
  mondayOfKoreaWeek,
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
    const config = await getAutomationConfig();
    if (!config.enabled)
      return NextResponse.json({
        skipped: true,
        reason: "automation disabled",
      });
    lockOwner = await acquireAutomationLock("revenue-strategy", 15);
    if (!lockOwner)
      return NextResponse.json({
        skipped: true,
        reason: "revenue strategy already running",
      });
    if (process.env.OPENAI_API_KEY) {
      const reservation = await reserveEstimatedCost({
        jobId: `strategy:${mondayOfKoreaWeek()}:${randomUUID()}`,
        kind: "revenue-strategy",
        amountWon: config.estimatedAnalysisCostWon,
        detail: { basis: "user-configured-estimate", mode: "automatic" },
      });
      if (!reservation.allowed)
        return NextResponse.json({
          skipped: true,
          reason: "monthly AI budget reached",
          budget: reservation,
        });
    }
    runId = await startRun("revenue-strategy");
    const report = await refreshRevenueStrategy();
    await finishRun(runId, "success", {
      status: report.status,
      trajectory: report.trajectory,
    });
    return NextResponse.json({ ok: true, report });
  } catch (error: any) {
    if (runId) await finishRun(runId, "failed", { error: error.message });
    return NextResponse.json(
      { error: error.message || "수익 전략 자동 갱신 실패" },
      { status: error.message === "UNAUTHORIZED_CRON" ? 401 : 500 },
    );
  } finally {
    await releaseAutomationLock("revenue-strategy", lockOwner);
  }
}
