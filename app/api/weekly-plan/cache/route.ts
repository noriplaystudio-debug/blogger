import { NextResponse } from "next/server";
import {
  getLocalAgentState,
  markLocalPlanningSearchReady,
} from "@/lib/local-state";
import { normalizePlanningSettings, parseWeeklyPlan } from "@/lib/planning";
import {
  getPlanningSearchSnapshot,
  hasDatabase,
  markPlanningSearchReady,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = hasDatabase()
      ? await getPlanningSearchSnapshot()
      : (await getLocalAgentState()).planningSearch || null;
    if (!snapshot)
      return NextResponse.json(
        { error: "저장된 카테고리·키워드 조사 결과가 없습니다." },
        { status: 404 },
      );
    const settings = normalizePlanningSettings(snapshot.settings);
    const recovered = !snapshot.plan;
    const plan =
      snapshot.plan || parseWeeklyPlan(snapshot.rawResponse, settings);
    if (recovered) {
      if (hasDatabase()) await markPlanningSearchReady(plan);
      else await markLocalPlanningSearchReady(plan);
    }
    return NextResponse.json({
      ...plan,
      sources: snapshot.sources || [],
      settings,
      capturedAt: snapshot.capturedAt,
      recovered,
      reused: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || "저장된 조사 결과를 복원하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
