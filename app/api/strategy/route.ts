import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { refreshRevenueStrategy } from "@/lib/strategy";
import { getSession } from "@/lib/session";
import {
  getAutomationConfig,
  getLatestStrategyReport,
  hasDatabase,
  reserveEstimatedCost,
} from "@/lib/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!hasDatabase())
      return NextResponse.json({ configured: false, report: null });
    const [config, report] = await Promise.all([
      getAutomationConfig(),
      getLatestStrategyReport(),
    ]);
    return NextResponse.json({ configured: true, config, report });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "수익 전략 조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    if (!hasDatabase())
      return NextResponse.json(
        { error: "수익 사령탑에는 DATABASE_URL이 필요합니다." },
        { status: 400 },
      );
    const session = await getSession();
    const apiKey = session.apiKeys?.openai || process.env.OPENAI_API_KEY;
    const config = await getAutomationConfig();
    if (apiKey) {
      const reservation = await reserveEstimatedCost({
        jobId: `manual-strategy:${randomUUID()}`,
        kind: "revenue-strategy",
        amountWon: config.estimatedAnalysisCostWon,
        detail: { basis: "user-configured-estimate", mode: "manual" },
      });
      if (!reservation.allowed)
        return NextResponse.json(
          {
            error:
              "월 AI 예산 한도로 전략 분석을 시작하지 않았습니다. 예산을 조정한 뒤 다시 시도하세요.",
            budget: reservation,
          },
          { status: 429 },
        );
    }
    return NextResponse.json({
      ok: true,
      report: await refreshRevenueStrategy(apiKey),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "수익 전략 갱신 실패" },
      { status: 500 },
    );
  }
}
