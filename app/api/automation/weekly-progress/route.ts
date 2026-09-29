import { NextRequest, NextResponse } from "next/server";
import { getWeeklyPlanningProgress, hasDatabase } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!hasDatabase())
      return NextResponse.json({ error: "DATABASE_URL이 없습니다." }, { status: 400 });
    const runKey = String(req.nextUrl.searchParams.get("runKey") || "").slice(0, 120);
    if (!runKey)
      return NextResponse.json({ error: "runKey가 없습니다." }, { status: 400 });
    const progress = await getWeeklyPlanningProgress(runKey);
    if (!progress)
      return NextResponse.json({ error: "실행 상태를 찾지 못했습니다." }, { status: 404 });
    const categories = Array.isArray(progress.draft?.categories)
      ? progress.draft.categories
      : [];
    const keywordCount = categories.reduce(
      (sum: number, category: any) =>
        sum + (Array.isArray(category.keywords) ? category.keywords.length : 0),
      0,
    );
    const completedAngles = categories.reduce(
      (sum: number, category: any) =>
        sum +
        (category.keywords || []).filter(
          (keyword: any) =>
            Array.isArray(keyword.angles) &&
            keyword.angles.length === Number(progress.settings?.articlesPerKeyword),
        ).length,
      0,
    );
    return NextResponse.json({
      ok: true,
      runKey,
      status: progress.status,
      weekStart: progress.weekStart,
      categoryCount: categories.length,
      keywordCount,
      completedAngles,
      expectedAngles:
        keywordCount > 0 ? keywordCount : Number(progress.settings?.categoryCount || 0) * Number(progress.settings?.keywordsPerCategory || 0),
      updatedAt: progress.updatedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "주간 계획 상태 조회 실패" },
      { status: 500 },
    );
  }
}
