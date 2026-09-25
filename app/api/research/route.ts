import { NextRequest, NextResponse } from "next/server";
import { MODEL, extractCitations, openaiClient } from "@/lib/openai";
import { parseJsonArray } from "@/lib/models";

export async function POST(req: NextRequest) {
  try {
    const { category } = await req.json();
    if (!category?.trim())
      return NextResponse.json(
        { error: "카테고리를 입력하세요." },
        { status: 400 },
      );
    const client = openaiClient();
    const response = await client.responses.create({
      model: MODEL,
      tools: [{ type: "web_search" }],
      input: `오늘 기준으로 한국어 Google Blogger의 '${category}' 카테고리에서 쓸 인기 키워드를 발굴하라.

반드시 다음 순서로 조사한다.
1. 최근 30일~12개월의 검색 관심 신호, 계절성, 뉴스·제품 출시·행사 등 수요 발생 원인을 찾는다.
2. 검색결과에 반복 등장하는 실제 질문과 연관 표현을 찾는다.
3. 너무 넓은 단일 단어, 단순 사이트 이동 목적, 일시적 가십, 검색 의도가 불명확한 키워드는 제외한다.
4. 새 블로그가 유용한 답을 제공할 수 있는 구체적인 롱테일 키워드를 우선한다.
5. 최근 흐름을 상승·보합·하락·판단보류 중 하나로 분류하고, 근거가 약하면 반드시 판단보류로 쓴다.
6. 검색량 숫자를 확인하지 못했다면 만들지 않는다. 인기와 경쟁도는 공개 검색 신호를 바탕으로 한 추정이다.
7. 건강·법률·금융은 공공기관·공식 문서 등 1차 출처를 우선한다.

후보 10개를 만들고 추천점수 내림차순으로 정렬하라. 점수는 최근 수요 신호 35점, 검색 의도 명확성 25점, 새 블로그 공략 가능성 25점, 콘텐츠 지속성 15점으로 계산한다.

먼저 조사 요약과 판단 근거를 한국어로 작성하고 마지막에는 정확히 다음 표식과 JSON 배열을 출력하라.
KEYWORDS_JSON:
[{"keyword":"구체적인 검색어","intent":"정보형|비교형|구매형|문제해결형","angle":"상위 글과 차별화할 방향","competition":"낮음|보통|높음","trend":"상승|보합|하락|판단보류","trendReason":"최근 흐름 판단 근거를 짧게","score":85}]`,
    });
    const text = response.output_text;
    const marker = text.lastIndexOf("KEYWORDS_JSON:");
    const raw =
      marker >= 0 ? text.slice(marker + "KEYWORDS_JSON:".length).trim() : "[]";
    const keywords = parseJsonArray<any>(raw).sort(
      (a: any, b: any) => b.score - a.score,
    );
    if (!keywords.length)
      throw new Error(
        "키워드 후보를 구조화하지 못했습니다. 다시 시도해 주세요.",
      );
    return NextResponse.json({
      keywords,
      research: marker >= 0 ? text.slice(0, marker).trim() : text,
      sources: extractCitations(response),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "키워드 조사 오류" },
      { status: 500 },
    );
  }
}
