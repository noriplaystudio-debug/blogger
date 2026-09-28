import { sanitizeArticleHtml } from "@/lib/editorial";

export const NAVER_WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    html: { type: "string" },
    labels: { type: "array", items: { type: "string" } },
    rewriteNotes: { type: "array", items: { type: "string" } },
  },
  required: ["title", "html", "labels", "rewriteNotes"],
} as Record<string, unknown>;

export const NAVER_WRITER_SYSTEM = `당신은 한국어 네이버 블로그 전문 편집자다.
원문의 사실·수치·날짜·출처를 임의로 바꾸거나 새로 만들지 말고, 같은 조사자료를 바탕으로 네이버 독자가 읽기 편한 별도 원고로 재작성한다.
문체는 딱딱한 합니다체보다 자연스러운 해요체를 기본으로 한다. 다만 과장된 체험담, 존재하지 않는 개인 경험, 확인되지 않은 추천은 만들지 않는다.
짧은 문단과 잦은 줄바꿈을 사용하고, 필요한 곳에만 📌 ✅ 💡 👉 ✔️ 같은 기호·이모티콘을 자연스럽게 사용한다. 같은 이모티콘을 연속해서 쓰거나 모든 문장 끝에 붙이지 않는다.
네이버 편집기에 안전한 HTML만 사용한다: h2, h3, p, ul, ol, li, strong, blockquote, a, table, thead, tbody, tr, th, td, br.
출처 링크는 원문에 있는 링크를 유지한다. 제목은 검색 질문을 직접 답하면서도 과장하지 않는다.
설명이나 Markdown 코드 블록 없이 지정된 JSON 하나만 반환한다.`;

export function sanitizeNaverTitle(value: string) {
  const title = String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 10 || title.length > 70)
    throw new Error("네이버 제목은 10~70자 범위여야 합니다.");
  return title;
}

export function sanitizeNaverHtml(value: string) {
  const html = sanitizeArticleHtml(String(value || ""))
    .replace(/<\/?>br>/gi, "<br>")
    .replace(/<\/p>\s*<p>/gi, "</p><p>")
    .trim();
  if (html.length < 120)
    throw new Error("네이버용 본문이 너무 짧습니다.");
  return html;
}

export function naverPrompt(article: any) {
  return `Blogger 원고를 네이버 블로그용으로 다시 작성한다.

카테고리: ${article.category || "미지정"}
키워드: ${article.keyword || "미지정"}
기존 제목: ${article.title || ""}
기존 본문 HTML:
${String(article.html || "").slice(0, 26000)}
출처:
${JSON.stringify(article.sources || []).slice(0, 10000)}

작성 규칙:
1. 핵심 사실과 출처 링크는 보존한다.
2. 네이버 독자가 모바일에서 읽기 좋게 문단을 짧게 나눈다.
3. 도입부는 “이게 궁금하셨다면…”처럼 자연스럽게 시작할 수 있지만 상투적인 인사말은 쓰지 않는다.
4. 중간중간 소제목, 체크리스트, 강조 문장을 사용한다.
5. 이모티콘·특수기호는 전체 글에서 3~10개 정도만 문맥에 맞게 사용한다.
6. 원문에 없는 개인 경험·방문 후기·가격·통계·결과를 만들지 않는다.
7. Blogger 글을 그대로 복사한 듯한 문장 순서와 표현을 피한다.
8. 마지막에는 독자가 확인하거나 실행할 다음 단계를 한 문단으로 정리한다.

JSON 형식:
{"title":"네이버용 제목","html":"완성 HTML","labels":["태그"],"rewriteNotes":["변환한 점"]}`;
}
