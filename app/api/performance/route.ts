import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { refreshPerformanceLearning } from "@/lib/performance";
import { getPerformanceReports, hasDatabase } from "@/lib/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!hasDatabase())
      return NextResponse.json({ configured: false, reports: [] });
    return NextResponse.json({
      configured: true,
      reports: await getPerformanceReports(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "성과 학습 조회 실패" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    if (!hasDatabase())
      return NextResponse.json(
        { error: "성과 이력을 저장할 DATABASE_URL이 필요합니다." },
        { status: 400 },
      );
    const reports = await refreshPerformanceLearning(`manual-${randomUUID()}`);
    return NextResponse.json({ ok: true, reports });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "성과 학습 실행 실패" },
      { status: 500 },
    );
  }
}
