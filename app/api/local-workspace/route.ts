import { NextRequest, NextResponse } from "next/server";
import { getLocalAgentState, saveLocalWorkspace } from "@/lib/local-state";
import { hasDatabase } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (hasDatabase())
      return NextResponse.json({ workspace: null, databaseManaged: true });
    const state = await getLocalAgentState();
    return NextResponse.json({
      workspace: state.workspace || null,
      savedAt: state.savedAt,
      databaseManaged: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "저장된 작업을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (hasDatabase())
      return NextResponse.json({ saved: false, databaseManaged: true });
    const body = await req.json();
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, "utf8") > 20 * 1024 * 1024)
      return NextResponse.json(
        { error: "저장할 로컬 작업 데이터가 너무 큽니다." },
        { status: 413 },
      );
    const current = await getLocalAgentState();
    const workspace = {
      workflow: body?.workflow,
      plan: body?.plan || null,
      planningRun: body?.planningRun || current.workspace?.planningRun || null,
      tasks: Array.isArray(body?.tasks) ? body.tasks : [],
      blogMap:
        body?.blogMap && typeof body.blogMap === "object" ? body.blogMap : {},
      styleMap:
        body?.styleMap && typeof body.styleMap === "object"
          ? body.styleMap
          : {},
      savedAt: new Date().toISOString(),
    };
    await saveLocalWorkspace(workspace);
    return NextResponse.json({ saved: true, savedAt: workspace.savedAt });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "현재 작업을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    if (hasDatabase())
      return NextResponse.json({ cleared: false, databaseManaged: true });
    const current = await getLocalAgentState();
    await saveLocalWorkspace({
      ...(current.workspace || {}),
      planningRun: null,
      savedAt: new Date().toISOString(),
    });
    return NextResponse.json({ cleared: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "진행 중 계획을 지우지 못했습니다." },
      { status: 500 },
    );
  }
}
