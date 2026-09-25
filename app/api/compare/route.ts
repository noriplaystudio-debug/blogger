import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { generateWithModel, MODEL_OPTIONS, parseJson } from "@/lib/models";
import {
  DEFAULT_STYLE_GUIDE,
  REVIEW_SYSTEM,
  sanitizeArticleHtml,
  WRITING_SYSTEM,
} from "@/lib/editorial";

function plainText(value: string) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createBlogPreview(raw: string) {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/i, "");
  let html = sanitizeArticleHtml(cleaned);
  const heading = html.match(/<h2>([\s\S]*?)<\/h2>/i);
  const title = heading ? plainText(heading[1]) : "제목 형식을 확인하세요";
  if (heading && html.indexOf(heading[0]) < 120) {
    html = html.replace(heading[0], "").trim();
  }
  return { title, html };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = await getSession();
    const keys = {
      openai: session.apiKeys?.openai || process.env.OPENAI_API_KEY,
      anthropic: session.apiKeys?.anthropic || process.env.ANTHROPIC_API_KEY,
      google: session.apiKeys?.google || process.env.GEMINI_API_KEY,
    };
    const connected = MODEL_OPTIONS.filter((m) => Boolean(keys[m.provider]));
    if (connected.length < 2)
      return NextResponse.json(
        { error: "비교하려면 최소 2개 회사의 API 키가 필요합니다." },
        { status: 400 },
      );
    const mode = body.mode === "review" ? "review" : "write";
    const style = body.styleGuide || session.styleGuide || DEFAULT_STYLE_GUIDE;

    const outputs = await Promise.all(
      connected.map(async (option) => {
        try {
          const prompt =
            mode === "write"
              ? `키워드: ${body.keyword || "전기요금 절약 방법"}\n참고자료:\n${body.sources || "제공된 자료가 없으므로 변하지 않는 일반 원칙만 사용하고 구체적 수치와 최신 제도는 단정하지 않는다."}\n문체 가이드:\n${style}\n\n900~1200자 분량의 제목과 완성 본문을 작성하라. 첫 요소는 글 제목을 담은 h2 하나로 시작하고 이후에는 본문 HTML만 출력하라. 마크다운 코드 블록과 설명 문장은 넣지 마라.`
              : `다음 테스트 초안을 검수하라. 오류·근거 없음·과장·상투 표현을 찾아 수정하고 JSON으로 출력하라.\n초안:\n${body.draft || "요즘 모든 가정의 전기요금이 정확히 30% 올랐습니다. 저도 지난달 직접 확인했는데 에어컨을 무조건 26도로 설정하면 누구나 요금을 절반으로 줄일 수 있습니다. 오늘은 전기요금 절약법을 알아보겠습니다."}\n참고자료:\n${body.sources || "검증 가능한 근거자료가 제공되지 않음"}\nJSON: {\"errors\":[\"문제\"],\"score\":0,\"revised\":\"수정본\"}`;
          const text = await generateWithModel({
            model: option.id,
            keys,
            system: mode === "write" ? WRITING_SYSTEM : REVIEW_SYSTEM,
            prompt,
            json: mode === "review",
            maxTokens: mode === "write" ? 3500 : 2500,
          });
          const parsed = mode === "review" ? parseJson<any>(text) : null;
          return {
            model: option.id,
            label: option.label,
            ok: true,
            text,
            parsed,
            preview:
              mode === "write"
                ? createBlogPreview(text)
                : parsed?.revised
                  ? createBlogPreview(String(parsed.revised))
                  : null,
          };
        } catch (error: any) {
          return {
            model: option.id,
            label: option.label,
            ok: false,
            error: error?.message || "이 모델의 비교 요청에 실패했습니다.",
            text: "",
            parsed: null,
            preview: null,
          };
        }
      }),
    );
    const successes = outputs.filter((output) => output.ok);
    if (!successes.length)
      return NextResponse.json(
        {
          error: "연결된 모델의 비교 요청이 모두 실패했습니다.",
          outputs,
        },
        { status: 502 },
      );
    const anonymized = outputs.map((output, index) => ({
      id: String.fromCharCode(65 + index),
      ...output,
    }));
    return NextResponse.json({
      mode,
      outputs: anonymized,
      warning:
        successes.length < outputs.length
          ? "일부 모델은 실패했지만 성공한 비교 결과는 표시했습니다."
          : "",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "모델 비교에 실패했습니다." },
      { status: 500 },
    );
  }
}
