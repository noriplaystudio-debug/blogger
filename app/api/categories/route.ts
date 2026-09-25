import { NextResponse } from "next/server";
import { MODEL, openaiClient } from "@/lib/openai";
import { parseJsonArray } from "@/lib/models";

export async function POST() {
  try {
    const response = await openaiClient().responses.create({
      model: MODEL,
      tools: [{ type: "web_search" }],
      input: `오늘 기준 한국 전체 사용자의 공개 검색 관심도를 조사해 Google Blogger 운영 카테고리 우선순위를 정하라. 특정 개인의 취향·직업·대화·검색기록은 절대 사용하지 않는다.

경제·재테크, 사회·정책, 연예·방송, 스포츠, IT·가전, 자동차, 건강, 육아·교육, 여행·지역, 생활정보·제품 추천을 기본 분류로 삼되 검색 흐름상 필요한 분야는 합치거나 추가할 수 있다.

단순 순간 검색량만 보지 말고 최근 30일~12개월 관심 신호, 상승 여부, 반복 검색 가능성, 광고·구매 의도, 새 블로그 경쟁 가능성, 사실확인 및 저작권 위험을 평가하라. 뉴스성 급등과 지속형 검색 수요를 구분하라. 정확한 수치를 확인할 수 없으면 만들지 말고 정성 등급을 사용한다.

운영 가치가 높은 카테고리 8개를 추천점수 내림차순으로 출력한다. 점수는 현재 수요 25점, 상승 신호 20점, 지속성 20점, 수익 가능성 20점, 새 블로그 공략 가능성 15점으로 계산하고 위험도가 높으면 감점한다.

먼저 시장 요약을 작성하고 마지막에는 정확히 아래 표식과 JSON 배열만 출력한다.
CATEGORIES_JSON:
[{"category":"분야명","reason":"추천 근거","demand":"높음|보통|낮음","trend":"상승|보합|하락|판단보류","longevity":"장기|계절형|단기","monetization":"높음|보통|낮음","risk":"높음|보통|낮음","score":82}]`,
    });
    const text = response.output_text;
    const marker = text.lastIndexOf("CATEGORIES_JSON:");
    const raw =
      marker >= 0
        ? text.slice(marker + "CATEGORIES_JSON:".length).trim()
        : "[]";
    const categories = parseJsonArray<any>(raw).sort(
      (a: any, b: any) => b.score - a.score,
    );
    if (!categories.length)
      throw new Error(
        "카테고리 결과를 구조화하지 못했습니다. 다시 시도해 주세요.",
      );
    return NextResponse.json({
      categories,
      summary: marker >= 0 ? text.slice(0, marker).trim() : text,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "카테고리 조사 오류" },
      { status: 500 },
    );
  }
}
