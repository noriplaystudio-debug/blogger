import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { MODEL_OPTIONS, generateWithModel, providerFor } from "@/lib/models";
import { DEFAULT_STYLE_GUIDE } from "@/lib/editorial";

export async function GET() {
  try {
    const session = await getSession();
    return NextResponse.json(
      {
        connected: {
          openai: Boolean(
            session.apiKeys?.openai || process.env.OPENAI_API_KEY,
          ),
          anthropic: Boolean(
            session.apiKeys?.anthropic || process.env.ANTHROPIC_API_KEY,
          ),
          google: Boolean(
            session.apiKeys?.google || process.env.GEMINI_API_KEY,
          ),
        },
        writerModel: session.writerModel || "",
        reviewerModel: session.reviewerModel || "",
        styleGuide: session.styleGuide || DEFAULT_STYLE_GUIDE,
        models: MODEL_OPTIONS,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "설정을 불러오지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = await getSession();
    session.apiKeys = {
      openai:
        body.apiKeys?.openai?.trim() ||
        session.apiKeys?.openai ||
        process.env.OPENAI_API_KEY,
      anthropic:
        body.apiKeys?.anthropic?.trim() ||
        session.apiKeys?.anthropic ||
        process.env.ANTHROPIC_API_KEY,
      google:
        body.apiKeys?.google?.trim() ||
        session.apiKeys?.google ||
        process.env.GEMINI_API_KEY,
    };
    if (body.writerModel) {
      providerFor(body.writerModel);
      session.writerModel = body.writerModel;
    }
    if (body.reviewerModel) {
      providerFor(body.reviewerModel);
      session.reviewerModel = body.reviewerModel;
    }
    if (typeof body.styleGuide === "string" && body.styleGuide.trim()) {
      const styleGuide = body.styleGuide.trim();
      if (styleGuide.length > 1200 && styleGuide !== DEFAULT_STYLE_GUIDE)
        return NextResponse.json(
          {
            error:
              "사용자 편집 가이드는 최대 1,200자까지 저장할 수 있습니다. API 키와 Google 연결이 같은 보안 쿠키 용량을 사용하므로 핵심 규칙만 남겨 주세요.",
          },
          { status: 400 },
        );
      // 기본 가이드는 코드에서 다시 제공해 쿠키에 중복 저장하지 않는다.
      session.styleGuide =
        styleGuide === DEFAULT_STYLE_GUIDE ? undefined : styleGuide;
    }

    const keys = session.apiKeys;
    const requestedTests: string[] = body.testModels || [];
    const results: Record<string, string> = {};
    await Promise.all(
      requestedTests.map(async (model) => {
        try {
          await generateWithModel({
            model,
            keys,
            system: "연결 확인",
            prompt: "OK라고만 답하세요.",
            maxTokens: 12,
          });
          results[providerFor(model)] = "연결됨";
        } catch (error: any) {
          results[providerFor(model)] = error.message || "연결 실패";
        }
      }),
    );
    await session.save();
    return NextResponse.json({ ok: true, testResults: results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "설정을 저장하지 못했습니다." },
      { status: 500 },
    );
  }
}
