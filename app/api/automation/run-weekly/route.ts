import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Dashboard-only manual trigger for the weekly planning automation.
 * middleware.ts protects this POST with the authenticated dashboard session;
 * CRON_SECRET remains server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret)
      return NextResponse.json(
        { error: "CRON_SECRET이 설정되지 않았습니다." },
        { status: 500 },
      );

    const target = new URL("/api/cron/weekly", req.url);
    const response = await fetch(target, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || "주간 계획 응답을 읽지 못했습니다." };
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "주간 계획 수동 실행에 실패했습니다." },
      { status: 500 },
    );
  }
}
