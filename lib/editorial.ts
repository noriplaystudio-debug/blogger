export const DEFAULT_STYLE_GUIDE = `
대상 독자가 검색한 문제를 해결하는 한국어 정보 블로그다.
- 자연스럽고 차분한 존댓말을 사용한다.
- 핵심 답을 도입부에서 바로 제시하고 불필요한 인사말은 쓰지 않는다.
- 확인되지 않은 개인 경험, 방문, 구매, 사용 후기를 절대 꾸며내지 않는다.
- 근거 없는 통계, 가격, 날짜, 순위, 효과를 만들지 않는다.
- "오늘은 알아보겠습니다", "결론적으로", "무엇보다 중요한 것은" 같은 상투적 표현을 반복하지 않는다.
- 키워드를 억지로 반복하거나 모든 문단을 같은 길이로 만들지 않는다.
- 독자가 바로 실행할 수 있는 조건, 예외, 주의점, 확인 방법을 포함한다.
- 다른 출처의 내용을 순서대로 다시 말하는 데 그치지 말고 비교 기준, 계산, 점검표, 의사결정 절차처럼 독자가 사용할 수 있는 고유한 결과물을 만든다.
- 실제 사용·방문·전문 자격이 필요한 주제에서는 그런 경험이나 자격이 있는 것처럼 쓰지 않는다. 제공된 근거만으로 충분한 답을 만들 수 없으면 검토 필요로 남긴다.
- 출처끼리 조건이나 결론이 다르면 하나로 뭉개지 말고 적용 범위와 차이를 밝힌다.
- 제목은 내용을 정확히 설명하고 충격·최고·무조건 같은 과장 표현을 피한다.
`.trim();

export const STRUCTURES = [
  "문제 해결형: 답을 먼저 제시한 뒤 원인, 해결 단계, 예외와 주의점을 설명",
  "비교형: 판단 기준을 세우고 선택지별 장단점과 적합한 상황을 비교",
  "체크리스트형: 준비사항, 확인 순서, 놓치기 쉬운 항목을 점검표로 구성",
  "초보자 설명형: 용어를 풀어 설명하고 가장 쉬운 실행 순서와 흔한 실수를 안내",
  "오해와 사실형: 흔한 오해를 제시하고 근거에 따라 사실과 한계를 구분",
  "사례 분석형: 가상의 경험을 꾸미지 않고 공개 자료의 객관적 상황을 기준으로 판단 과정을 설명",
  "FAQ형: 실제 검색 의도를 서로 겹치지 않는 질문과 답으로 구성",
];

export function pickStructure(seed: string) {
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return STRUCTURES[n % STRUCTURES.length];
}

export function similarity(a: string, b: string) {
  const tokens = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .replace(/<[^>]+>/g, " ")
        .match(/[가-힣a-z0-9]{2,}/g) || [],
    );
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  left.forEach((x) => {
    if (right.has(x)) common += 1;
  });
  return common / (left.size + right.size - common);
}

export const TITLE_RISK_PATTERN =
  /(충격|소름|무조건|100%|반드시 클릭|모르면 손해|완벽\s*정리|완벽\s*가이드|한눈에\s*보기|총정리|알아보겠습니다)/i;

export function sanitizeArticleTitle(input: string, label = "제목") {
  const title = String(input || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 12 || title.length > 70)
    throw new Error(`${label}은 12~70자 범위의 간결한 문장이어야 합니다.`);
  if (TITLE_RISK_PATTERN.test(title))
    throw new Error(`${label}에 과장·공포 유도·상투 표현이 있습니다.`);
  if ((title.match(/[!?！？]/g) || []).length > 1)
    throw new Error(`${label}에 느낌표·물음표가 지나치게 많습니다.`);
  if ((title.match(/[|｜:：\-–—]/g) || []).length > 2)
    throw new Error(`${label}이 여러 구절을 기계적으로 이어 붙였습니다.`);
  return title;
}

export const WRITING_SYSTEM = `당신은 한국어 정보 콘텐츠 전문 편집자다. 목표는 AI처럼 보이지 않게 속이는 것이 아니라, 검색하지 않고도 독자가 결정을 내리거나 행동을 완료할 만큼 유용하고 신뢰할 수 있는 원고를 만드는 것이다. 검색엔진 유입만 노린 범용 요약문을 만들지 않는다. 제공된 검증 주장 밖의 사실과 경험을 만들지 않고, 출처의 한계와 충돌을 숨기지 않는다. HTML은 Blogger에 바로 넣을 수 있도록 h2, h3, p, ul, ol, li, strong, blockquote, a, table, thead, tbody, tr, th, td 태그만 사용한다.`;

export const REVIEW_SYSTEM = `당신은 초안을 작성한 사람과 독립된 한국어 출판 편집장이다. 조사는 이미 작성 전에 통과했으므로 새 사실을 만들거나 내용을 임의로 확장하지 않는다. 검수의 중심은 제목을 더 정확하고 자연스럽게 다듬고, 어색하거나 장황한 문장을 고치며, 중복 표현을 줄이고, 문단과 소제목의 순서를 독자의 질문 흐름에 맞게 정리하는 것이다. 도입부가 질문에 바로 답하는지, 제목의 약속을 본문이 이행하는지, 마지막 문단이 실제 다음 행동을 제시하는지 확인한다. 제공된 조사자료 밖의 사실은 추가하지 않으며 근거와 충돌하는 문장은 삭제하거나 조건을 분명히 한다. 수정한 전체 원고를 반환한다.`;

const ALLOWED_TAGS = new Set([
  "h2",
  "h3",
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "blockquote",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function sanitizeArticleHtml(input: string) {
  return String(input || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|iframe|object|embed|svg|form|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      "",
    )
    .replace(
      /<\s*(\/?)([a-z0-9-]+)([^>]*)>/gi,
      (full, closing, rawTag, attrs) => {
        const tag = String(rawTag).toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) return "";
        if (closing) return `</${tag}>`;
        if (tag !== "a") return `<${tag}>`;
        const hrefMatch = String(attrs).match(/\bhref\s*=\s*(["'])(.*?)\1/i);
        if (!hrefMatch) return "<a>";
        try {
          const url = new URL(hrefMatch[2]);
          if (!["http:", "https:"].includes(url.protocol)) return "<a>";
          return `<a href="${escapeAttribute(url.toString())}" target="_blank" rel="noopener noreferrer">`;
        } catch {
          return "<a>";
        }
      },
    )
    .trim();
}
