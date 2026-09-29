import { after, NextRequest, NextResponse } from "next/server";
import {
  getWeeklyPlanningProgress,
  hasDatabase,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!hasDatabase())
      return NextResponse.json({ error: "DATABASE_URL이 없습니다." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const runKey = String(body?.runKey || "").slice(0, 120);
    if (!runKey)
      return NextResponse.json({ error: "runKey가 없습니다." }, { status: 400 });

    const progress = await getWeeklyPlanningProgress(runKey);
    if (!progress)
      return NextResponse.json(
        { error: "저장된 주간 계획 실행을 찾지 못했습니다." },
        { status: 404 },
      );

    if (progress.status !== "running")
      return NextResponse.json({
        ok: true,
        skipped: true,
        status: progress.status,
      });

    const updatedAt = Date.parse(progress.updatedAt || "");
    const staleMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : Infinity;
    if (staleMs < 20_000)
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "worker recently active",
        staleMs,
      });

    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET이 없습니다.");
    const origin = new URL(req.url).origin;

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
      resumed: true,
      runKey,
      staleMs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "주간 계획 재개 실패" },
      { status: 500 },
    );
  }
}
