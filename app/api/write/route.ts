import { NextRequest, NextResponse } from "next/server";
import { MODEL, openaiClient } from "@/lib/openai";
import { parseJson } from "@/lib/models";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const client = openaiClient();
    const response = await client.responses.create({
      model: MODEL,
      input: `당신은 한국어 Blogger 전문 편집자다. 사용자의 실제 경험을 꾸며내지 말고, 검색 근거에 없는 숫자나 사실을 만들지 마라. 자연스럽고 구체적인 존댓말로 작성하며 키워드를 억지로 반복하지 마라. HTML은 Blogger에 바로 넣을 수 있게 h2, h3, p, ul, li, strong, blockquote, a 태그만 사용한다. 참고 URL은 해당 주장 가까이에 링크한다. 여러 주제 블로그이므로 카테고리 라벨을 명확히 한다. 건강·법률·금융은 일반 정보임을 밝히고 전문가 상담이 필요한 조건을 포함한다. 최근 상승 신호는 주제 선정 근거일 뿐 사실처럼 과장하거나 본문에 검색량을 만들어 넣지 마라.\n\n카테고리: ${body.category}\n핵심 키워드: ${body.keyword}\n키워드 분석: ${JSON.stringify(body.keywordAnalysis)}\n조사 메모: ${body.research}\n출처: ${JSON.stringify(body.sources)}\n\nJSON만 출력하라: {"title":"검색 의도에 맞는 제목","metaDescription":"150자 이내 설명","labels":["3~6개"],"html":"충분히 유용한 완성 HTML 본문","checks":["사용자가 직접 확인해야 할 사실 2~5개"],"warning":"민감 주제 주의문 또는 빈 문자열"}`,
    });
    return NextResponse.json(parseJson(response.output_text));
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "글 작성 오류" },
      { status: 500 },
    );
  }
}
