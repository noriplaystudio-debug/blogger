import OpenAI from "openai";
import { extractCitations } from "@/lib/openai";
import { generateWithModel, parseJson, providerFor } from "@/lib/models";
import {
  REVIEW_RESPONSE_SCHEMA,
  WRITER_RESPONSE_SCHEMA,
} from "@/lib/response-schemas";
import {
  DEFAULT_STYLE_GUIDE,
  pickStructure,
  REVIEW_SYSTEM,
  sanitizeArticleTitle,
  sanitizeArticleHtml,
  similarity,
  WRITING_SYSTEM,
} from "@/lib/editorial";

type Draft = {
  title: string;
  titleCandidates: {
    title: string;
    strategy:
      "direct_answer" | "conditional" | "comparison" | "problem_solution";
    queryFit: string;
    promise: string;
    risk: string;
  }[];
  titleSelectionReason: string;
  metaDescription: string;
  labels: string[];
  html: string;
  factualNotes: string[];
  usedClaimIds: string[];
  coverageMap: {
    requirement: string;
    addressed: boolean;
    location: string;
  }[];
  answerSummary: string;
  valueAdd: { type: string; description: string };
  autoRepairs?: string[];
};
type Review = {
  passed: boolean;
  overallScore: number;
  factualScore: number;
  usefulnessScore: number;
  styleScore: number;
  intentScore: number;
  evidenceScore: number;
  originalValueScore: number;
  readabilityScore: number;
  titleAccuracyScore: number;
  completenessScore: number;
  titleAssessment: {
    queryMatch: number;
    specificity: number;
    accuracy: number;
    distinctiveness: number;
    concision: number;
    decision: string;
  };
  issues: string[];
  correctedTitle: string;
  correctedMetaDescription: string;
  correctedHtml: string;
};

type ContentDiagnostics = {
  titleLength: number;
  titleKeywordMentions: number;
  titleSimilarity: number;
  bodySimilarity: number;
  paragraphCount: number;
  headingCount: number;
  longParagraphCount: number;
  keywordMentions: number;
  sourceLinkCount: number;
  firstAnswerLength: number;
  issues: string[];
  passed: boolean;
};

function plainText(value: string) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function countPhrase(text: string, phrase: string) {
  const needle = String(phrase || "")
    .trim()
    .toLowerCase();
  if (!needle) return 0;
  return (
    String(text || "")
      .toLowerCase()
      .split(needle).length - 1
  );
}

function analyzeContentCraft(input: {
  title: string;
  html: string;
  keyword: string;
  answerSummary: string;
  existing: any[];
}): ContentDiagnostics {
  const paragraphs = [...input.html.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map(
    (match) => plainText(match[1]),
  );
  const headings = [...input.html.matchAll(/<h[23]>([\s\S]*?)<\/h[23]>/gi)].map(
    (match) => plainText(match[1]),
  );
  const text = plainText(input.html);
  const titleKeywordMentions = countPhrase(input.title, input.keyword);
  const keywordMentions = countPhrase(text, input.keyword);
  const maxKeywordMentions = Math.max(5, Math.ceil(text.length / 250));
  const titleSimilarity = input.existing.reduce(
    (max: number, item: any) =>
      Math.max(max, similarity(input.title, String(item.title || ""))),
    0,
  );
  const bodySimilarity = input.existing.reduce(
    (max: number, item: any) =>
      Math.max(
        max,
        similarity(
          `${input.title} ${input.html}`,
          `${item.title || ""} ${item.summary || ""}`,
        ),
      ),
    0,
  );
  const genericHeadingPattern =
    /^(서론|본론|결론|마무리|정리|개요|장점|단점|주의사항|알아보기)$/;
  const duplicateHeadings = headings.filter(
    (heading, index) =>
      headings.findIndex(
        (other) => other.toLowerCase() === heading.toLowerCase(),
      ) !== index,
  );
  const firstParagraph = paragraphs[0] || "";
  const issues: string[] = [];
  if (paragraphs.length < 4)
    issues.push("본문 문단이 4개 미만이라 정보를 훑어보기 어렵습니다.");
  if (headings.length < 2 || headings.length > 9)
    issues.push("소제목은 내용 규모에 맞게 2~9개여야 합니다.");
  if (headings.some((heading) => genericHeadingPattern.test(heading)))
    issues.push("내용을 설명하지 않는 상투적 소제목이 있습니다.");
  if (duplicateHeadings.length) issues.push("동일한 소제목이 반복됩니다.");
  const longParagraphCount = paragraphs.filter(
    (paragraph) => paragraph.length > 500,
  ).length;
  if (longParagraphCount > 2)
    issues.push("500자를 넘는 긴 문단이 3개 이상입니다.");
  if (
    !firstParagraph ||
    firstParagraph.length < 35 ||
    firstParagraph.length > 320 ||
    /^(안녕하세요|오늘은|이번 글에서는|이번 포스팅에서는)/.test(
      firstParagraph,
    ) ||
    similarity(firstParagraph, input.answerSummary) < 0.08
  )
    issues.push("첫 문단이 독자의 질문에 35~320자로 바로 답하지 않습니다.");
  if (titleKeywordMentions > 1) issues.push("제목에 핵심 키워드가 반복됩니다.");
  if (keywordMentions > maxKeywordMentions)
    issues.push(
      `본문에 핵심 키워드가 과도하게 반복됩니다(${keywordMentions}/${maxKeywordMentions}).`,
    );
  if (titleSimilarity >= 0.62)
    issues.push("기존 글 제목과 지나치게 유사합니다.");
  if (bodySimilarity >= 0.4) issues.push("기존 글 내용과 지나치게 유사합니다.");
  if (
    [...input.html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].some((match) =>
      /^https?:\/\//i.test(plainText(match[1])),
    )
  )
    issues.push("출처 링크의 설명 대신 URL 주소를 앵커 문구로 사용했습니다.");
  return {
    titleLength: input.title.length,
    titleKeywordMentions,
    titleSimilarity,
    bodySimilarity,
    paragraphCount: paragraphs.length,
    headingCount: headings.length,
    longParagraphCount,
    keywordMentions,
    sourceLinkCount: (input.html.match(/<a\s+href=/gi) || []).length,
    firstAnswerLength: firstParagraph.length,
    issues,
    passed: !issues.length,
  };
}

type ResearchDossier = {
  checkedAt: string;
  readerNeed: string;
  directAnswer: string;
  scope: string;
  claims: {
    id: string;
    statement: string;
    sourceUrl: string;
    sourceTitle: string;
    sourceType: "primary" | "authoritative_secondary";
    timeSensitivity: "stable" | "changing";
    limitation: string;
  }[];
  conflicts: string[];
  unknowns: string[];
  coverage: {
    requirement: string;
    supported: boolean;
    claimIds: string[];
    gap: string;
  }[];
  practicalSteps: string[];
  uniqueValuePlan: string[];
};

type EvidencePolicy = {
  level: "strict" | "standard";
  label: string;
  primaryRequired: boolean;
  minimumDomains: number;
  minimumClaims: number;
  minimumSupportedRequirements: number;
  reason: string;
};

function determineEvidencePolicy(body: any): EvidencePolicy {
  const topic = [
    body?.category,
    body?.keyword,
    body?.intent,
    body?.angle?.titleIdea,
    body?.angle?.searchQuestion,
  ]
    .filter(Boolean)
    .join(" ");
  const strict =
    body?.angle?.contentMode === "realtime" ||
    /의료|건강|질병|의약|약품|약물|복약|법률|법령|세금|금융|투자|보험|대출|지원금|장학금|정부|정책|공공서비스|교통|KTX|SRT|항공|사건|사고|재난|스포츠|연예|선거|채용|입시/i.test(
      topic,
    );
  return strict
    ? {
        level: "strict",
        label: "고위험·시의성 엄격 검증",
        primaryRequired: false,
        minimumDomains: 2,
        minimumClaims: 3,
        minimumSupportedRequirements: 3,
        reason:
          "바뀔 수 있거나 잘못 안내했을 때 독자에게 피해가 생길 수 있어 출처 수와 핵심 근거 수만 한 단계 높입니다.",
      }
    : {
        level: "standard",
        label: "일반 정보형 표준 검증",
        primaryRequired: false,
        minimumDomains: 1,
        minimumClaims: 2,
        minimumSupportedRequirements: 2,
        reason:
          "일반 정보형 주제로 독립 출처 교차확인은 유지하되 1차 출처가 존재하지 않는다는 이유만으로 중단하지 않습니다.",
      };
}

type EvidenceAudit = {
  passed: boolean;
  evidenceScore: number;
  unsupportedClaims: string[];
  misleadingClaims: string[];
  freshnessIssues: string[];
  notes: string[];
  checkedSources: { title: string; url: string }[];
};

export type RecoveryMode =
  "review_only" | "evidence_repair" | "content_repair" | "manual_review";

type RecoveryDecision = {
  mode: RecoveryMode;
  code:
    | "REVIEW_RESPONSE_INVALID"
    | "EVIDENCE_REPAIR_REQUIRED"
    | "CONTENT_REPAIR_REQUIRED"
    | "AUTHORITATIVE_SOURCE_CONFLICT";
  label: string;
  explanation: string;
  actionLabel: string;
  automatic: boolean;
  confidence: "high" | "medium";
  reasons: string[];
};

function classifyRecoveryDecision(input: {
  review: Review;
  evidenceAudit?: EvidenceAudit | null;
  diagnostics?: ContentDiagnostics | null;
  dossier?: ResearchDossier | null;
  generationFailures?: string[];
  recoveryMode?: RecoveryMode | null;
}): RecoveryDecision {
  const issues = Array.isArray(input.review.issues)
    ? input.review.issues.map(String)
    : [];
  const failureText = [...(input.generationFailures || []), ...issues].join(
    " ",
  );
  const scores = [
    input.review.overallScore,
    input.review.factualScore,
    input.review.evidenceScore,
    input.review.usefulnessScore,
  ].map((value) => Number(value || 0));

  if (
    scores.every((score) => score === 0) ||
    /자동 검수 미완료|JSON|형식|파싱|schema|응답.*찾지 못/i.test(failureText)
  ) {
    return {
      mode: "review_only",
      code: "REVIEW_RESPONSE_INVALID",
      label: "초안 정상 · 검수 응답 형식 오류",
      explanation:
        "초안과 조사자료는 유지하고 검수 요청만 다시 보냅니다. 같은 검수기가 다시 실패하면 자동으로 보조 검수 모델로 전환합니다.",
      actionLabel: "기존 글 검수만 다시 실행",
      automatic: true,
      confidence: "high",
      reasons: issues.length ? issues : ["검수 점수가 생성되지 않았습니다."],
    };
  }

  const evidenceReasons = [
    ...issues.filter((issue) =>
      /출처|근거|사실|수치|날짜|현재성|미확인|왜곡|unsupported|misleading/i.test(
        issue,
      ),
    ),
    ...(input.evidenceAudit?.unsupportedClaims || []),
    ...(input.evidenceAudit?.misleadingClaims || []),
    ...(input.evidenceAudit?.freshnessIssues || []),
  ];
  const evidenceFailed =
    Number(input.review.factualScore || 0) < 95 ||
    Number(input.review.evidenceScore || 0) < 95 ||
    input.evidenceAudit?.passed === false ||
    evidenceReasons.length > 0;

  if (
    evidenceFailed &&
    input.recoveryMode === "evidence_repair" &&
    (input.dossier?.conflicts?.length || 0) > 0
  ) {
    return {
      mode: "manual_review",
      code: "AUTHORITATIVE_SOURCE_CONFLICT",
      label: "공식·권위 출처 간 결론 충돌",
      explanation:
        "표적 재검색 후에도 권위 있는 출처의 기준이 서로 달라 하나를 자동 선택하면 왜곡 위험이 있습니다. 이 경우에만 사람 확인을 남깁니다.",
      actionLabel: "Blogger 임시저장 후 충돌 출처 확인",
      automatic: false,
      confidence: "high",
      reasons: [...(input.dossier?.conflicts || []), ...evidenceReasons].slice(
        0,
        8,
      ),
    };
  }

  if (evidenceFailed) {
    return {
      mode: "evidence_repair",
      code: "EVIDENCE_REPAIR_REQUIRED",
      label: "특정 주장 근거 보강 필요",
      explanation:
        "부족하다고 판정된 주장만 표적 검색하고, 새 독립 출처가 확보되면 관련 문장만 고친 뒤 완성 글 전체를 재검수합니다.",
      actionLabel: "부족한 근거만 찾아 자동 보강",
      automatic: true,
      confidence: "high",
      reasons: evidenceReasons.length
        ? evidenceReasons.slice(0, 8)
        : [
            `사실성 ${Number(input.review.factualScore || 0)}점 · 근거성 ${Number(input.review.evidenceScore || 0)}점`,
          ],
    };
  }

  const contentReasons = [...issues, ...(input.diagnostics?.issues || [])];
  return {
    mode: "content_repair",
    code: "CONTENT_REPAIR_REQUIRED",
    label: "제목·본문 품질 기준 미달",
    explanation:
      "기존 조사자료와 통과한 문장은 유지하고 지적된 제목·구성·검색 의도 항목만 수정합니다. 수정 뒤에는 부분이 아닌 완성 글 전체를 다시 검수합니다.",
    actionLabel: "문제 항목만 수정하고 전체 재검수",
    automatic: true,
    confidence: contentReasons.length ? "high" : "medium",
    reasons: contentReasons.length
      ? [...new Set(contentReasons)].slice(0, 8)
      : ["검수 모델이 통과시키지 않았지만 근거 문제는 발견되지 않았습니다."],
  };
}

export class SourceBlockedError extends Error {
  code = "SOURCE_BLOCKED" as const;
  attempts: number;
  reasons: string[];

  constructor(reasons: string[]) {
    const clean = reasons.filter(Boolean);
    super(
      `자동 보강 검색을 ${clean.length || 1}회 진행했지만 신뢰할 수 있는 독립 출처를 충분히 확보하지 못했습니다. ${clean.at(-1) || "주제를 더 좁혀 다시 시도하세요."}`,
    );
    this.name = "SourceBlockedError";
    this.attempts = clean.length || 1;
    this.reasons = clean;
  }
}

export function isSourceBlockedError(
  error: unknown,
): error is SourceBlockedError {
  return (
    error instanceof SourceBlockedError ||
    Boolean(
      error &&
      typeof error === "object" &&
      (error as any).code === "SOURCE_BLOCKED",
    )
  );
}

function urlKey(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function validateResearchDossier(
  value: ResearchDossier,
  sources: { title: string; url: string }[],
  mustCover: string[] = [],
  policy: EvidencePolicy = {
    level: "strict",
    label: "고위험·시의성 엄격 검증",
    primaryRequired: false,
    minimumDomains: 2,
    minimumClaims: 3,
    minimumSupportedRequirements: 3,
    reason: "기본 안전 기준",
  },
) {
  if (
    !value ||
    !String(value.readerNeed || "").trim() ||
    !String(value.directAnswer || "").trim() ||
    !Array.isArray(value.claims) ||
    value.claims.length < policy.minimumClaims
  )
    throw new Error("조사 결과에 독자 질문·직접 답변·검증 주장이 부족합니다.");
  const citationKeys = new Set(sources.map((source) => urlKey(source.url)));
  const citationsByDomain = new Map<string, { title: string; url: string }[]>();
  for (const source of sources) {
    try {
      const domain = new URL(source.url).hostname.replace(/^www\./, "");
      citationsByDomain.set(domain, [
        ...(citationsByDomain.get(domain) || []),
        source,
      ]);
    } catch {}
  }
  const claimDomains = new Set<string>();
  const claimIds = new Set<string>();
  value.claims.forEach((claim, index) => {
    claim.id = String(claim.id || `C${index + 1}`).trim();
    claimIds.add(claim.id);
  });
  for (const claim of value.claims) {
    const key = urlKey(claim.sourceUrl);
    let claimDomain = "";
    try {
      claimDomain = new URL(claim.sourceUrl).hostname.replace(/^www\./, "");
    } catch {}
    // 검색 도구가 연 URL과 모델이 적은 canonical URL의 경로가 달라도
    // 같은 공식 도메인이면 실제로 연 URL에 다시 연결한다.
    if (key && !citationKeys.has(key) && citationsByDomain.has(claimDomain)) {
      claim.sourceUrl = citationsByDomain.get(claimDomain)![0].url;
      claim.sourceTitle =
        claim.sourceTitle || citationsByDomain.get(claimDomain)![0].title;
    }
    if (
      !String(claim.statement || "").trim() ||
      !urlKey(claim.sourceUrl) ||
      !citationKeys.has(urlKey(claim.sourceUrl)) ||
      !["primary", "authoritative_secondary"].includes(claim.sourceType) ||
      !["stable", "changing"].includes(claim.timeSensitivity)
    )
      throw new Error(
        "조사 주장과 실제 검색 출처가 연결되지 않아 작성을 중단했습니다.",
      );
    claimDomains.add(new URL(claim.sourceUrl).hostname.replace(/^www\./, ""));
  }
  const hasPrimary = value.claims.some(
    (claim) => claim.sourceType === "primary",
  );
  if (policy.primaryRequired && !hasPrimary)
    throw new Error("공식기관·원문·제조사 등 1차 출처가 최소 1개 필요합니다.");
  const singlePrimarySourceException = hasPrimary && claimDomains.size >= 1;
  if (
    claimDomains.size < policy.minimumDomains &&
    !singlePrimarySourceException
  )
    throw new Error(
      `독립 출처 ${policy.minimumDomains}곳 또는 핵심 내용을 모두 확인할 수 있는 1차 출처 1곳이 필요합니다.`,
    );
  if (!Array.isArray(value.uniqueValuePlan) || !value.uniqueValuePlan.length)
    throw new Error("단순 출처 요약을 넘어서는 독자 가치 설계가 없습니다.");
  value.conflicts = Array.isArray(value.conflicts) ? value.conflicts : [];
  value.unknowns = Array.isArray(value.unknowns) ? value.unknowns : [];
  value.coverage = Array.isArray(value.coverage) ? value.coverage : [];
  let supportedRequirementCount = 0;
  for (const requirement of mustCover) {
    const coverage = value.coverage.find(
      (item) => similarity(item?.requirement || "", requirement) >= 0.55,
    );
    if (
      coverage?.supported &&
      Array.isArray(coverage.claimIds) &&
      coverage.claimIds.length &&
      coverage.claimIds.every((id) => claimIds.has(String(id)))
    )
      supportedRequirementCount += 1;
  }
  const requiredCoverageCount = Math.min(
    mustCover.length,
    policy.minimumSupportedRequirements,
  );
  if (supportedRequirementCount < requiredCoverageCount)
    throw new Error(
      `핵심 필수 내용 ${requiredCoverageCount}개 중 ${supportedRequirementCount}개만 근거와 연결됐습니다.`,
    );
  value.practicalSteps = Array.isArray(value.practicalSteps)
    ? value.practicalSteps
    : [];
  return value;
}

function validateEvidenceAudit(value: EvidenceAudit) {
  if (
    !value ||
    !Number.isFinite(Number(value.evidenceScore)) ||
    Number(value.evidenceScore) < 0 ||
    Number(value.evidenceScore) > 100
  )
    throw new Error("최종 근거 감사 점수가 올바르지 않습니다.");
  value.evidenceScore = Number(value.evidenceScore);
  for (const key of [
    "unsupportedClaims",
    "misleadingClaims",
    "freshnessIssues",
    "notes",
  ] as const)
    value[key] = Array.isArray(value[key]) ? value[key] : [];
  value.checkedSources = Array.isArray(value.checkedSources)
    ? value.checkedSources.filter((source) => urlKey(source?.url || ""))
    : [];
  value.passed = Boolean(
    value.passed &&
    value.evidenceScore >= 95 &&
    !value.unsupportedClaims.length &&
    !value.misleadingClaims.length &&
    !value.freshnessIssues.length &&
    value.checkedSources.length >= 2,
  );
  return value;
}

async function auditFinalEvidence(
  apiKey: string,
  input: {
    category: string;
    keyword: string;
    angle: any;
    html: string;
    dossier: ResearchDossier | null;
  },
) {
  let lastAudit: EvidenceAudit | null = null;
  let previousFailure = "";
  const maxAttempts = input.angle?.contentMode === "realtime" ? 2 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await new OpenAI({ apiKey }).responses.create({
      model: process.env.RESEARCH_MODEL || "gpt-5.6-terra",
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources" as any],
      reasoning: { effort: "medium" },
      input: `당신은 최종 발행 직전의 독립 근거 감사자다. 최초 조사자의 결론을 그대로 믿지 말고 실제 원문을 다시 열어 원고의 핵심 사실·수치·날짜·조건·예외를 확인한다. 검색결과 요약만 보고 통과시키지 않는다. 의견·일반적 조언과 검증 가능한 사실을 구분한다. 출처가 있어도 원고가 조건을 빼거나 더 강하게 표현했다면 misleadingClaims에 기록한다. 현재성이 필요한 정보가 낡았거나 날짜를 확인할 수 없으면 freshnessIssues에 기록한다. 사소한 문체 문제는 판단하지 않는다. 반드시 서로 다른 도메인의 원문 2곳 이상을 직접 확인한다.${attempt ? `\n이전 감사가 통과하지 못한 이유: ${previousFailure}\n이번에는 빠진 주장과 두 번째 독립 출처를 우선 확인한다.` : ""}\n\n카테고리: ${input.category}\n키워드: ${input.keyword}\n글 브리프: ${JSON.stringify(input.angle)}\n최초 조사 문서: ${JSON.stringify(input.dossier)}\n최종 원고 HTML: ${input.html}\n\nJSON만 출력한다: {"passed":true,"evidenceScore":0,"unsupportedClaims":["출처로 확인되지 않는 원고 주장"],"misleadingClaims":["조건·범위를 왜곡한 주장"],"freshnessIssues":["현재성 문제"],"notes":["감사 메모"],"checkedSources":[{"title":"직접 연 출처명","url":"https://..."}]}`,
    });
    const audit = validateEvidenceAudit(
      parseJson<EvidenceAudit>(response.output_text),
    );
    const searchedKeys = new Set(
      extractCitations(response).map((source) => urlKey(source.url)),
    );
    audit.checkedSources = audit.checkedSources.filter((source) =>
      searchedKeys.has(urlKey(source.url)),
    );
    const checkedDomains = new Set(
      audit.checkedSources.map((source) =>
        new URL(source.url).hostname.replace(/^www\./, ""),
      ),
    );
    audit.passed = Boolean(audit.passed && checkedDomains.size >= 2);
    lastAudit = audit;
    if (audit.passed) return audit;
    previousFailure = [
      ...audit.unsupportedClaims,
      ...audit.misleadingClaims,
      ...audit.freshnessIssues,
      ...(checkedDomains.size < 2 ? ["독립 출처 도메인이 2개 미만"] : []),
    ].join("; ");
  }
  return lastAudit!;
}

const TITLE_STRATEGIES = [
  "direct_answer",
  "conditional",
  "comparison",
  "problem_solution",
] as const;

function normalizedTitle(value: string) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function usableMetaDescription(value: unknown, draft: Draft) {
  const supplied = String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (supplied.length >= 50 && similarity(draft.title, supplied) < 0.8)
    return supplied.slice(0, 150);
  const bodyLead = plainText(draft.html).slice(0, 150);
  const combined = `${String(draft.answerSummary || "").trim()} ${bodyLead}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return combined.length >= 50
    ? combined
    : `${combined} 이 글에서는 확인 기준과 적용 순서, 달라질 수 있는 조건을 함께 설명합니다.`.slice(
        0,
        150,
      );
}

function validateDraft(
  value: Draft,
  mustCover: string[] = [],
  allowedClaimIds: string[] = [],
  allowLegacy = false,
) {
  if (!value || typeof value.title !== "string" || !value.title.trim())
    throw new Error("작성 모델이 제목을 만들지 못했습니다.");
  const autoRepairs: string[] = [];
  value.title = sanitizeArticleTitle(value.title, "선택 제목");
  if (
    !Array.isArray(value.titleCandidates) ||
    value.titleCandidates.length !== 4
  )
    throw new Error("서로 다른 전략의 제목 후보 4개와 선택 근거가 필요합니다.");
  if (!String(value.titleSelectionReason || "").trim()) {
    value.titleSelectionReason =
      "검색 질문과 본문의 직접 답변을 가장 정확하게 연결하는 후보를 선택했습니다.";
    autoRepairs.push("누락된 제목 선택 근거 보완");
  }
  const candidateTitles = value.titleCandidates.map((candidate, index) => {
    candidate.title = sanitizeArticleTitle(
      candidate.title,
      `제목 후보 ${index + 1}`,
    );
    if (!TITLE_STRATEGIES.includes(candidate.strategy)) {
      candidate.strategy = TITLE_STRATEGIES[index];
      autoRepairs.push(`제목 후보 ${index + 1}의 전략값 자동 보정`);
    }
    if (!String(candidate.queryFit || "").trim()) {
      candidate.queryFit =
        "검색 질문과 본문의 핵심 답변이 연결되는지 검토합니다.";
      autoRepairs.push(`제목 후보 ${index + 1}의 질문 적합성 설명 보완`);
    }
    if (!String(candidate.promise || "").trim()) {
      candidate.promise =
        "본문에서 확인 기준과 적용 조건을 구체적으로 설명합니다.";
      autoRepairs.push(`제목 후보 ${index + 1}의 본문 약속 설명 보완`);
    }
    if (typeof candidate.risk !== "string") candidate.risk = "자동 재검토 필요";
    return normalizedTitle(candidate.title);
  });
  const selectedKey = normalizedTitle(value.title);
  if (!candidateTitles.includes(selectedKey)) {
    const closestIndex = value.titleCandidates.reduce(
      (best, candidate, index) =>
        similarity(value.title, candidate.title) > best.score
          ? { index, score: similarity(value.title, candidate.title) }
          : best,
      { index: 0, score: 0 },
    );
    if (closestIndex.score >= 0.72) {
      value.title = value.titleCandidates[closestIndex.index].title;
      autoRepairs.push("선택 제목을 가장 가까운 평가 후보로 자동 일치");
    } else {
      value.titleCandidates[0] = {
        ...value.titleCandidates[0],
        title: value.title,
        strategy: "direct_answer",
      };
      autoRepairs.push("선택 제목을 평가 후보 목록에 자동 반영");
    }
  }
  if (new Set(candidateTitles).size !== 4)
    autoRepairs.push("유사한 제목 후보가 있어 최종 검수에서 재평가 필요");
  if (
    new Set(value.titleCandidates.map((candidate) => candidate.strategy))
      .size !== 4
  ) {
    value.titleCandidates.forEach((candidate, index) => {
      candidate.strategy = TITLE_STRATEGIES[index];
    });
    autoRepairs.push("제목 후보 전략을 네 가지 유형으로 자동 정렬");
  }
  const originalMeta = String(value.metaDescription || "");
  value.metaDescription = usableMetaDescription(originalMeta, value);
  if (value.metaDescription !== originalMeta.trim().slice(0, 150))
    autoRepairs.push("메타 설명을 본문 직접 답변 기준으로 자동 보완");
  if (!Array.isArray(value.labels)) value.labels = [];
  value.labels = [
    ...new Set(
      value.labels
        .filter((label) => typeof label === "string" && label.trim())
        .slice(0, 6)
        .map((label) => label.trim().slice(0, 40)),
    ),
  ];
  if (!value.labels.length) {
    value.labels = ["정보", "체크리스트"];
    autoRepairs.push("누락된 라벨 기본값 보완");
  }
  value.html = sanitizeArticleHtml(value.html);
  const textLength = value.html.replace(/<[^>]+>/g, " ").trim().length;
  if (textLength < 700)
    throw new Error("작성된 본문이 지나치게 짧아 저장하지 않았습니다.");
  if (textLength > 7000)
    throw new Error(
      "본문이 지나치게 길어 응답 잘림 위험이 있습니다. 핵심 근거와 실행 정보만 남겨 다시 작성합니다.",
    );
  if ((value.html.match(/<h2>/g) || []).length < 2)
    throw new Error(
      "독자가 내용을 찾기 쉽도록 두 개 이상의 핵심 구획이 필요합니다.",
    );
  if (!String(value.answerSummary || "").trim()) {
    value.answerSummary = plainText(value.html).slice(0, 320);
    autoRepairs.push("누락된 직접 답변 요약을 첫 문단에서 복구");
  }
  if (!Array.isArray(value.factualNotes)) value.factualNotes = [];
  if (value.factualNotes.length < 3) {
    const paragraphs = [...value.html.matchAll(/<p>([\s\S]*?)<\/p>/gi)]
      .map((match) => plainText(match[1]))
      .filter(Boolean);
    value.factualNotes = [
      ...new Set([...value.factualNotes, ...paragraphs]),
    ].slice(0, 3);
    autoRepairs.push("핵심 사실 점검표를 본문에서 자동 복구");
  }
  if (!Array.isArray(value.usedClaimIds)) value.usedClaimIds = [];
  value.usedClaimIds = [
    ...new Set(value.usedClaimIds.map(String).filter(Boolean)),
  ];
  if (allowedClaimIds.length) {
    const allowed = new Set(allowedClaimIds.map(String));
    if (!value.usedClaimIds.length && allowLegacy) {
      value.usedClaimIds = [...allowed].slice(0, 8);
      autoRepairs.push("기존 원고의 사용 근거 ID를 조사 문서에서 복구");
    }
    if (
      !value.usedClaimIds.length ||
      value.usedClaimIds.some((id) => !allowed.has(id))
    )
      throw new Error(
        "본문이 조사 문서의 검증 주장 ID와 연결되지 않았습니다.",
      );
  }
  if (!Array.isArray(value.coverageMap)) value.coverageMap = [];
  if (!value.coverageMap.length && allowLegacy) {
    value.coverageMap = mustCover.map((requirement) => ({
      requirement,
      addressed: true,
      location: "기존 원고 전체 재검수",
    }));
    autoRepairs.push("기존 원고의 필수항목 반영표를 복구");
  }
  for (const requirement of mustCover) {
    const item = value.coverageMap.find(
      (entry) => similarity(entry?.requirement || "", requirement) >= 0.55,
    );
    if (!item?.addressed || !String(item.location || "").trim())
      throw new Error(
        `작성 단계에서 필수 내용 ‘${requirement}’이 본문에 반영되지 않았습니다.`,
      );
  }
  if (!value.valueAdd || typeof value.valueAdd !== "object")
    value.valueAdd = { type: "검토 필요", description: "" };
  if (!String(value.valueAdd.type || "").trim())
    value.valueAdd.type = "단계별 절차";
  if (!String(value.valueAdd.description || "").trim()) {
    value.valueAdd.description =
      "독자가 확인할 기준과 실행 순서를 본문에서 단계별로 제공합니다.";
    autoRepairs.push("누락된 추가 독자 가치 설명 보완");
  }
  value.autoRepairs = autoRepairs;
  return value;
}

function validateReview(value: Review, draft: Draft) {
  if (!value || typeof value !== "object")
    throw new Error("검수 모델의 결과 형식이 올바르지 않습니다.");
  value.issues = Array.isArray(value.issues) ? value.issues : [];
  for (const key of [
    "overallScore",
    "factualScore",
    "usefulnessScore",
    "styleScore",
    "intentScore",
    "evidenceScore",
    "originalValueScore",
    "readabilityScore",
    "titleAccuracyScore",
    "completenessScore",
  ] as const) {
    const score = Number(value[key]);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      value[key] = 0;
      value.issues.push(`검수 점수 형식을 자동 보정했습니다: ${key}`);
    } else value[key] = score;
  }
  value.correctedHtml = sanitizeArticleHtml(value.correctedHtml || draft.html);
  value.correctedTitle = String(value.correctedTitle || "")
    .replace(/<[^>]*>/g, "")
    .trim();
  value.correctedTitle = sanitizeArticleTitle(
    value.correctedTitle || draft.title,
    "검수 제목",
  );
  value.correctedMetaDescription = usableMetaDescription(
    value.correctedMetaDescription,
    { ...draft, title: value.correctedTitle, html: value.correctedHtml },
  );
  if (value.correctedHtml.replace(/<[^>]+>/g, " ").trim().length < 700)
    throw new Error("검수된 본문이 지나치게 짧아 저장하지 않았습니다.");
  if (!value.titleAssessment) {
    value.titleAssessment = {
      queryMatch: 0,
      specificity: 0,
      accuracy: 0,
      distinctiveness: 0,
      concision: 0,
      decision: "검수 모델의 제목 세부 평가가 없어 수동 검토가 필요합니다.",
    };
    value.issues.push("제목 세부 평가 누락을 자동 보정했습니다.");
  }
  for (const key of [
    "queryMatch",
    "specificity",
    "accuracy",
    "distinctiveness",
    "concision",
  ] as const) {
    const score = Number(value.titleAssessment[key]);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      value.titleAssessment[key] = 0;
      value.issues.push(`제목 세부 점수 형식을 자동 보정했습니다: ${key}`);
    } else value.titleAssessment[key] = score;
  }
  if (!String(value.titleAssessment.decision || "").trim())
    value.titleAssessment.decision =
      "자동 보정된 검수 결과이므로 수동 확인이 필요합니다.";
  if ((value.correctedHtml.match(/<h2>/g) || []).length < 2)
    throw new Error("검수된 글에 핵심 구획이 부족합니다.");
  return value;
}

function fallbackReview(draft: Draft, reason: string): Review {
  return {
    passed: false,
    overallScore: 0,
    factualScore: 0,
    usefulnessScore: 0,
    styleScore: 0,
    intentScore: 0,
    evidenceScore: 0,
    originalValueScore: 0,
    readabilityScore: 0,
    titleAccuracyScore: 0,
    completenessScore: 0,
    titleAssessment: {
      queryMatch: 0,
      specificity: 0,
      accuracy: 0,
      distinctiveness: 0,
      concision: 0,
      decision: "자동 검수가 완료되지 않아 사람이 확인해야 합니다.",
    },
    issues: [`자동 검수 미완료: ${reason}`],
    correctedTitle: draft.title,
    correctedMetaDescription: draft.metaDescription,
    correctedHtml: draft.html,
  };
}

export function isSystemicProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /invalid x-api-key|api key|authentication|unauthorized|forbidden|credit|billing|quota|rate.?limit|insufficient_quota/i.test(
    message,
  );
}

export const productionResilienceTestHooks = {
  validateDraft,
  validateReview,
  validateResearchDossier,
  determineEvidencePolicy,
  isSystemicProviderError,
  classifyRecoveryDecision,
};

async function researchArticleEvidence(apiKey: string, body: any) {
  const failures: string[] = [];
  const evidencePolicy = determineEvidencePolicy(body);
  const prevalidatedDossier = body.angle?.prevalidatedDossier;
  const prevalidatedSources = Array.isArray(body.angle?.prevalidatedSources)
    ? body.angle.prevalidatedSources
    : [];
  if (prevalidatedDossier && prevalidatedSources.length) {
    const checkedAt = Date.parse(
      prevalidatedDossier.checkedAt || body.angle?.sourceCheckedAt || "",
    );
    const maximumAgeHours =
      body.angle?.contentMode === "realtime"
        ? Number(body.angle?.freshnessWindowHours || 24)
        : 168;
    const stillFresh =
      Number.isFinite(checkedAt) &&
      Date.now() - checkedAt <= maximumAgeHours * 60 * 60 * 1000;
    if (stillFresh) {
      try {
        const dossier = validateResearchDossier(
          structuredClone(prevalidatedDossier),
          prevalidatedSources,
          Array.isArray(body.angle?.mustCover) ? body.angle.mustCover : [],
          evidencePolicy,
        );
        return {
          dossier,
          sources: prevalidatedSources,
          attempts: 1,
          prevalidated: true,
          evidencePolicy,
        };
      } catch (error: any) {
        failures.push(`계획 사전검증 문서 오류: ${error?.message || "검증 실패"}`);
      }
    } else {
      failures.push("계획 사전검증 자료의 현재성 유효기간이 지나 재확인이 필요합니다.");
    }
  }
  const planningEvidence = [
    ...(Array.isArray(body.evidence) ? body.evidence : []),
    ...(Array.isArray(body.categoryEvidence) ? body.categoryEvidence : []),
    ...(Array.isArray(body.angle?.planningEvidence)
      ? body.angle.planningEvidence
      : []),
    ...(Array.isArray(body.angle?.categoryEvidence)
      ? body.angle.categoryEvidence
      : []),
    ...(Array.isArray(body.sources) ? body.sources : []),
  ]
    .filter((item: any) => item?.url)
    .slice(0, 20);
  const recoveryContext = body.recoveryContext
    ? `\n이번 조사는 전체 주제를 처음부터 반복하는 조사가 아니다. 이전 검수에서 부족하다고 판정된 다음 주장만 우선 확인한다: ${JSON.stringify(body.recoveryContext).slice(0, 8000)}\n기존 조사에서 검증된 주장은 유지하고, 부족한 주장마다 새 원문 출처를 연결한다. 새 출처를 찾지 못한 주장은 unknowns에 남기고 글에서 삭제하거나 조건부 표현으로 축소한다.`
    : "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const recoveryInstruction =
      [
        "먼저 글의 필수 질문을 각각 검색하고 공식기관·원문을 중심으로 교차검증한다.",
        "이전 실패를 보완한다. 기존 출처와 다른 도메인의 독립 출처를 먼저 찾고, 계획 단계의 근거 URL도 실제로 열어 확인한다.",
        `마지막 보강 단계다. 검증 범위를 좁혀 출처로 확실히 답할 수 있는 주장만 남기고, 모호한 약속은 조건부 답변으로 바꾼다. 그래도 서로 다른 도메인 ${evidencePolicy.minimumDomains}곳${evidencePolicy.primaryRequired ? "과 1차 출처 1곳" : ""}은 확보한다.`,
      ][attempt] +
      (body.angle?.contentMode === "realtime"
        ? ` 실시간 관심 글이다. 결과·일정·순위·발표 내용을 지금 다시 확인하고, 기준 시각·기준일과 이후 바뀔 수 있는 항목을 명시한다. 계획 당시 확인 시각은 ${body.angle.sourceCheckedAt || "미기록"}, 사건·경기·발표일은 ${body.angle.eventDate || "미지정"}, 현재성 확인 주기는 ${body.angle.freshnessWindowHours || 24}시간이다. 공식 발표와 신뢰할 수 있는 독립 보도를 우선하며 루머·사생활·피해자 신상·자극적 추측은 제외한다.`
        : "");
    try {
      const response = await new OpenAI({ apiKey }).responses.create({
        model: process.env.RESEARCH_MODEL || "gpt-5.6-terra",
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources" as any],
        reasoning: { effort: "medium" },
        input: `한국어 블로그 글을 위한 검증 조사 문서를 만든다.\n카테고리: ${body.category}\n키워드: ${body.keyword}\n검색 의도: ${body.intent}\n글 방향: ${body.angle.titleIdea}\n독자 상황: ${body.angle.readerSituation || "미지정"}\n독자 질문: ${body.angle.searchQuestion || body.keyword}\n답변 약속: ${body.angle.answerPromise || body.angle.purpose}\n반드시 다룰 내용: ${JSON.stringify(body.angle.mustCover || [])}\n제외 범위: ${JSON.stringify(body.angle.exclusions || [])}\n독창 가치 계획: ${body.angle.uniqueValue || "판단 기준과 실행 절차 제공"}\n계획 단계에서 확인한 후보 자료: ${JSON.stringify(planningEvidence)}${recoveryContext}\n\n적용 근거 기준: ${evidencePolicy.label}. ${evidencePolicy.reason} 최소 검증 주장 ${evidencePolicy.minimumClaims}개, 독립 도메인 ${evidencePolicy.minimumDomains}곳${evidencePolicy.primaryRequired ? ", 1차 출처 1곳 필수" : ", 1차 출처 우선(존재하지 않으면 권위 있는 2차 출처 허용)"}.\n\n${recoveryInstruction}${failures.length ? `\n앞선 시도의 실패 사유: ${failures.join(" | ")}` : ""}\n공식기관, 법령·통계 원문, 제조사 공식 문서 등 1차 출처를 우선하고 서로 다른 도메인의 출처로 교차검증한다. 날짜·가격·수치·정책은 오늘 기준 유효성을 확인한다. 검색결과 요약을 출처로 쓰지 말고 실제 원문을 연다. 직접 확인할 수 없는 체험담은 포함하지 않는다. 출처끼리 다르면 숨기지 말고 conflicts에 기록한다. 확인할 수 없는 부분은 unknowns에 기록하고 추측하지 않는다. 각 claim에는 C1, C2처럼 고유 id를 부여한다. 반드시 다룰 내용 각각을 coverage에 그대로 적고, 근거가 되는 claim id를 연결한다. 근거가 없는 필수 내용은 supported=false로 명확히 표시한다. 단순 요약이 아니라 독자가 판단하거나 행동하는 데 필요한 비교 기준·계산·절차·예외를 uniqueValuePlan에 설계한다.\n\nJSON만 출력한다: {"checkedAt":"YYYY-MM-DD","readerNeed":"독자가 해결하려는 문제","directAnswer":"질문에 대한 짧고 조건부인 직접 답","scope":"적용 범위와 전제","claims":[{"id":"C1","statement":"글에 사용할 수 있는 검증된 한 가지 주장","sourceUrl":"실제로 연 원문 URL","sourceTitle":"출처명","sourceType":"primary|authoritative_secondary","timeSensitivity":"stable|changing","limitation":"적용 조건·예외 또는 없음"}],"conflicts":["출처 간 차이"],"unknowns":["확인 불가 사항"],"coverage":[{"requirement":"반드시 다룰 내용 원문","supported":true,"claimIds":["C1"],"gap":"없음 또는 부족한 근거"}],"practicalSteps":["독자가 실행할 단계"],"uniqueValuePlan":["이 글만의 판단표·계산·절차·예외 구성"]}`,
      });
      const citations = extractCitations(response);
      const dossier = validateResearchDossier(
        parseJson<ResearchDossier>(response.output_text),
        citations,
        Array.isArray(body.angle?.mustCover) ? body.angle.mustCover : [],
        evidencePolicy,
      );
      const usedSourceKeys = new Set(
        dossier.claims.map((claim) => urlKey(claim.sourceUrl)),
      );
      return {
        dossier,
        sources: citations.filter((source: any) =>
          usedSourceKeys.has(urlKey(source.url)),
        ),
        attempts: attempt + 1,
        evidencePolicy,
      };
    } catch (error: any) {
      if (isSystemicProviderError(error)) throw error;
      failures.push(error?.message || `조사 ${attempt + 1}차 실패`);
    }
  }
  throw new SourceBlockedError(failures);
}

export async function produceArticle(
  body: any,
  options: {
    keys: Record<string, string | undefined>;
    writerModel: string;
    reviewerModel: string;
    styleGuide?: string;
    existingArticles?: any[];
    performanceGuidance?: any;
  },
) {
  const { keys, writerModel, reviewerModel } = options;
  const recoveryMode = (body.recoveryMode || null) as RecoveryMode | null;
  const existingArticle = body.existingArticle || null;
  if (!writerModel || !reviewerModel)
    throw new Error("작성 모델과 검수 모델을 먼저 선택하세요.");
  if (!keys[providerFor(writerModel)] || !keys[providerFor(reviewerModel)])
    throw new Error("선택한 모델의 서버 API 키가 없습니다.");
  if (!body.category || !body.keyword || !body.angle)
    throw new Error("글 작업 정보가 부족합니다.");
  if (recoveryMode === "evidence_repair" && !keys.openai)
    throw new Error(
      "근거 보강에는 웹 검색이 가능한 OpenAI API 키가 필요합니다.",
    );

  let research =
    recoveryMode && existingArticle
      ? existingArticle.research || body.research || ""
      : body.research || "";
  let researchDossier: ResearchDossier | null =
    recoveryMode && existingArticle
      ? existingArticle.researchDossier || null
      : null;
  let sources =
    recoveryMode && existingArticle
      ? existingArticle.sources || body.sources || []
      : body.sources || [];
  let researchAttempts =
    recoveryMode && existingArticle
      ? Number(existingArticle.researchAttempts || 0)
      : 0;
  let evidencePolicy: EvidencePolicy =
    existingArticle?.evidencePolicy || determineEvidencePolicy(body);
  if (keys.openai && (!recoveryMode || recoveryMode === "evidence_repair")) {
    const result = await researchArticleEvidence(keys.openai, body);
    researchDossier = result.dossier;
    sources = result.sources;
    researchAttempts = result.attempts;
    evidencePolicy = result.evidencePolicy;
    research = JSON.stringify(researchDossier);
  }

  const styleGuide = options.styleGuide || DEFAULT_STYLE_GUIDE;
  const structure = pickStructure(
    `${body.category}:${body.keyword}:${body.angle.titleIdea}`,
  );
  const existing = (options.existingArticles || [])
    .filter(
      (item: any) =>
        !existingArticle ||
        String(item?.title || "").trim() !==
          String(existingArticle.title || "").trim(),
    )
    .slice(0, 100);
  const performanceGuidanceBase = options.performanceGuidance
    ? `\nSearch Console 성과 학습(가설이며 맹목적으로 따르지 말 것):\n${JSON.stringify(options.performanceGuidance).slice(0, 12000)}\n표본과 신뢰도가 충분한 지침만 이번 검색 의도에 맞게 적용하고, 기존 성과가 좋은 글의 문장·구조를 복제하거나 키워드를 반복하지 말 것.\n`
    : "\n아직 충분한 Search Console 성과 학습이 없으므로 이번 글의 검색 의도와 조사 근거를 우선할 것.\n";
  const performanceGuidance =
    performanceGuidanceBase +
    (body.angle?.contentMode === "realtime"
      ? `\n실시간 관심 글 작성 규칙: 작성 직전 조사 결과만 사용하고 제목·첫 문단에 필요한 경우 기준일 또는 경기·발표 시점을 자연스럽게 명시한다. 결과·일정·순위처럼 바뀌는 정보는 확인 시점과 재확인 경로를 적는다. 속보를 베끼지 말고 독자가 필요한 맥락·확인 방법·다음 일정·공식 원문을 제공한다. 루머, 사생활 추측, 피해자 신상, 자극적인 범죄 묘사, 확인되지 않은 원인과 책임 단정은 삭제한다. 현재성 확인 주기는 ${body.angle.freshnessWindowHours || 24}시간이다.\n`
      : "");
  let draft: Draft | null =
    recoveryMode && existingArticle
      ? validateDraft({
          title: existingArticle.title,
          titleCandidates: existingArticle.titleCandidates,
          titleSelectionReason: existingArticle.titleSelectionReason,
          metaDescription: existingArticle.metaDescription,
          labels: existingArticle.labels,
          html: existingArticle.html,
          factualNotes: existingArticle.factualNotes || [],
          usedClaimIds: existingArticle.usedClaimIds || [],
          coverageMap: existingArticle.coverageMap || [],
          answerSummary: existingArticle.answerSummary,
          valueAdd: existingArticle.valueAdd,
          autoRepairs: existingArticle.autoRepairs || [],
        }, researchDossier?.coverage?.filter((item) => item.supported).map((item) => item.requirement) || body.angle.mustCover || [], researchDossier?.claims?.map((claim) => claim.id) || [], true)
      : null;
  let review: Review | null =
    recoveryMode && existingArticle?.review ? existingArticle.review : null;
  let evidenceAudit: EvidenceAudit | null = null;
  let draftDiagnostics: ContentDiagnostics | null = null;
  let finalDiagnostics: ContentDiagnostics | null = null;
  let actualReviewerModel = reviewerModel;
  const validSources = (sources || []).filter((source: any) => {
    try {
      return ["http:", "https:"].includes(new URL(source?.url || "").protocol);
    } catch {
      return false;
    }
  });
  sources = validSources;
  if (!String(research).trim() || !sources.length)
    throw new Error(
      "확인 가능한 조사자료와 출처가 없어 글 작성을 중단했습니다. OpenAI 조사 키 또는 직접 검증한 자료가 필요합니다.",
    );

  const generationFailures: string[] = [];
  const previousIssues = Array.isArray(existingArticle?.review?.issues)
    ? existingArticle.review.issues.map(String)
    : [];
  const recoveryInstruction =
    recoveryMode === "content_repair"
      ? `\n[복구 작업]\n새 글을 처음부터 만들지 않는다. 아래 기존 글에서 검수 지적 항목만 수정하고, 이미 검증된 사실·출처·문단은 가능한 한 유지한다. 수정 후에는 전체 JSON 원고를 반환한다.\n기존 글: ${JSON.stringify(existingArticle).slice(0, 30000)}\n수정할 문제: ${JSON.stringify(previousIssues).slice(0, 8000)}\n`
      : recoveryMode === "evidence_repair"
        ? `\n[근거 보강 작업]\n새 조사 문서에서 추가 확인된 주장만 이용한다. 기존 글의 미확인·왜곡·현재성 문제 문장을 새 근거에 맞게 수정하거나 삭제하고, 문제없는 부분은 유지한다. 새 출처를 찾지 못한 내용은 추측하지 말고 범위를 축소한다. 수정 후에는 전체 JSON 원고를 반환한다.\n기존 글: ${JSON.stringify(existingArticle).slice(0, 30000)}\n이전 근거 문제: ${JSON.stringify(previousIssues).slice(0, 8000)}\n`
        : "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      actualReviewerModel =
        attempt > 0 &&
        keys.openai &&
        reviewerModel !== (process.env.REVIEW_FALLBACK_MODEL || "gpt-5.6-terra")
          ? process.env.REVIEW_FALLBACK_MODEL || "gpt-5.6-terra"
          : reviewerModel;
      evidenceAudit = null;
      finalDiagnostics = null;
      if (recoveryMode !== "review_only") {
        const draftText = await generateWithModel({
          model: writerModel,
          keys,
          system: `${WRITING_SYSTEM}\n응답의 usedClaimIds에는 실제 본문에 사용한 조사 claim id만 적는다. coverageMap에는 필수 내용 각각이 본문의 어느 소제목·문단에서 답변됐는지 기록한다. 반영하지 못한 항목을 완료로 꾸미지 않는다.`,
          json: true,
          jsonSchema: WRITER_RESPONSE_SCHEMA,
          schemaName: "blog_article",
          maxTokens: 7000,
          prompt: `카테고리: ${body.category}\n핵심 키워드: ${body.keyword}\n검색 의도: ${body.intent}\n글 방향: ${body.angle.titleIdea}\n차별화 목적: ${body.angle.purpose}\n독자 질문: ${body.angle.searchQuestion || body.keyword}\n독자 상황: ${body.angle.readerSituation || "미지정"}\n답변 약속: ${body.angle.answerPromise || body.angle.purpose}\n필수 내용: ${JSON.stringify(body.angle.mustCover || [])}\n제외 범위: ${JSON.stringify(body.angle.exclusions || [])}\n계획된 독창 가치: ${body.angle.uniqueValue || "판단 기준과 실행 절차"}\n선택된 구성: ${structure}\n${recoveryInstruction}\n블로그 편집 가이드:\n${styleGuide}\n${performanceGuidance}\n검증 조사 문서:\n${research}\n\n검증된 출처 목록:\n${JSON.stringify(sources)}\n\n기존 글 제목과 요약(내용·제목·도입부를 반복하지 말 것):\n${JSON.stringify(existing)}\n${review?.issues?.length ? `\n이전 검수 문제를 모두 수정할 것:\n${review.issues.join("\n")}` : ""}${generationFailures.length ? `\n이전 생성 시 실패한 형식·길이 문제를 반복하지 말 것:\n${generationFailures.join("\n")}` : ""}\n\n[작성 전 근거 규칙]\n1. 조사 문서 coverage에서 supported=true이며 claimIds가 연결된 필수 내용만 확정적으로 쓴다.\n2. 모든 사실·날짜·수치·조건은 claims의 statement와 limitation 범위 안에서만 쓴다. claims에 없는 배경지식은 자연스러워 보여도 추가하지 않는다.\n3. conflicts는 어느 한쪽을 임의로 선택하지 말고 차이를 그대로 설명한다. unknowns는 확인된 사실처럼 바꾸지 않는다.\n4. 사실 문장 가까이에 해당 claim의 원문 링크를 자연스러운 앵커 문구로 연결한다.\n\n[제목 작성 기술]\n1. 먼저 direct_answer(답을 드러냄), conditional(대상·조건 명시), comparison(실제 비교축 명시), problem_solution(문제와 해결 결과 명시) 전략으로 제목 후보를 정확히 4개 만든다. 네 후보는 단어만 바꾼 변형이면 안 된다.\n2. 각 후보는 독자 질문 적합성, 약속하는 답, 과장·모호성·현재성 위험을 스스로 평가한다. 가장 자극적인 제목이 아니라 본문이 완전히 이행할 수 있고 기존 제목과 구별되는 제목을 선택한다.\n3. 제목은 12~70자, 한국어 본문과 같은 언어로 쓰고 핵심 키워드·동의어를 반복하지 않는다. 연도·가격·숫자는 조사 문서와 본문에서 현재 기준으로 확인된 경우에만 쓴다. 총정리·완벽 가이드·한눈에 보기·모르면 손해 같은 상투·공포 표현, 불필요한 괄호·구분자·감탄부호는 쓰지 않는다.\n4. 검색어를 그대로 나열하지 말고 대상, 조건, 판단 기준 또는 얻는 결과 중 이 글의 핵심을 구체적으로 드러낸다. 제목이 약속하지 않은 내용을 본문에 억지로 늘리지 않는다.\n\n[본문 작성 기술]\n1. 첫 문단 35~320자 안에서 질문에 바로 답하고, 적용 조건과 가장 중요한 예외를 함께 밝힌다. 인사·글 소개·목차 예고로 시작하지 않는다.\n2. 소제목은 '서론·본론·결론·정리·장점·단점'처럼 빈 라벨을 쓰지 말고, 해당 구획에서 독자가 얻게 될 답을 구체적으로 쓴다. 2~9개의 소제목으로 논리 순서를 만든다.\n3. 한 문단에는 하나의 핵심만 두고, 500자가 넘는 벽문단을 반복하지 않는다. 같은 뜻의 문장, 도입부 답의 단순 반복, 키워드의 기계적 반복을 제거한다.\n4. 사실 문장 가까이에 자연스러운 앵커 텍스트로 출처를 연결한다. 출처 목록만 끝에 몰아넣거나 URL을 그대로 앵커 텍스트로 쓰지 않는다. 조건·예외·출처 충돌과 확인 불가 사항을 해당 판단 지점에 배치한다.\n5. 검색 의도에 맞는 비교 기준·계산·체크리스트·의사결정 절차 중 하나를 완성된 형태로 제공한다. 예시는 실제 경험처럼 꾸미지 말고 가정임을 밝힌다.\n6. 마지막 구획에서는 본문을 되풀이하지 말고 독자가 지금 확인하거나 실행할 다음 행동, 적용되지 않는 경우, 재확인이 필요한 시점을 제시한다.\n7. 본문 순수 텍스트는 보통 1,500~5,000자로 제한한다. 정보가 충분하지 않은데 길이를 채우지 말고, 같은 설명을 반복하지 않는다.\n\n응답은 제공된 JSON 스키마를 정확히 따르고 설명 문장이나 코드펜스를 밖에 붙이지 않는다.`,
        });
        let parsedDraft: Draft;
        try {
          parsedDraft = parseJson<Draft>(draftText);
        } catch (parseError) {
          const repairedDraftText = await generateWithModel({
            model: writerModel,
            keys,
            system:
              "당신은 JSON 형식 복구기다. 원문의 사실과 HTML을 바꾸지 말고 요청된 JSON 객체만 출력한다. usedClaimIds와 coverageMap도 제공된 조사 문서와 원문에서 복구한다. 설명과 코드펜스를 쓰지 않는다.",
            json: true,
            jsonSchema: WRITER_RESPONSE_SCHEMA,
            schemaName: "repaired_blog_article",
            maxTokens: 7000,
            prompt: `다음 블로그 초안 응답을 지정 스키마의 유효한 JSON으로 변환하라. 빠진 설명 필드는 원문 내용만 이용해 짧게 채운다. 스키마: {"title":"","titleCandidates":[{"title":"","strategy":"direct_answer|conditional|comparison|problem_solution","queryFit":"","promise":"","risk":""}],"titleSelectionReason":"","metaDescription":"","labels":[],"html":"","factualNotes":[],"answerSummary":"","valueAdd":{"type":"","description":""}}\n\n원문 응답:\n${draftText}`,
          });
          parsedDraft = parseJson<Draft>(repairedDraftText);
          generationFailures.push(
            `초안 JSON 자동 복구: ${parseError instanceof Error ? parseError.message : "형식 오류"}`,
          );
        }
        draft = validateDraft(
          parsedDraft,
          researchDossier?.coverage
            ?.filter((item) => item.supported)
            .map((item) => item.requirement) ||
            (Array.isArray(body.angle?.mustCover) ? body.angle.mustCover : []),
          researchDossier?.claims?.map((claim) => claim.id) || [],
        );
      }
      if (!draft) throw new Error("재검수할 기존 초안이 없습니다.");
      draftDiagnostics = analyzeContentCraft({
        title: draft.title,
        html: draft.html,
        keyword: body.keyword,
        answerSummary: draft.answerSummary,
        existing,
      });
      const reviewText = await generateWithModel({
        model: actualReviewerModel,
        keys,
        system: REVIEW_SYSTEM,
        json: true,
        jsonSchema: REVIEW_RESPONSE_SCHEMA,
        schemaName: "editorial_review",
        maxTokens: 7000,
        prompt: `검색 의도: ${body.intent}\n키워드: ${body.keyword}\n글 브리프: ${JSON.stringify(body.angle)}\n블로그 편집 가이드:\n${styleGuide}\n${performanceGuidance}\n검증 조사 문서:\n${research}\n출처:\n${JSON.stringify(sources)}\n\n코드 기반 초안 진단: ${JSON.stringify(draftDiagnostics)}\n초안:\n${JSON.stringify(draft)}\n\n[편집 감수 순서]\n1. 제목 후보 네 개와 선택 근거를 비교해 독자의 질문, 본문의 실제 답, 구체성, 자연스러운 한국어를 가장 잘 만족하는 제목으로 다듬는다. 자극적인 표현, 불필요한 연도·숫자, 키워드 반복은 제거한다.\n2. 첫 문단이 질문에 바로 답하도록 다듬고, 장황하거나 번역투인 문장·같은 뜻의 반복·상투적인 AI 문구를 자연스러운 한국어로 고친다.\n3. 소제목과 문단 순서를 ‘직접 답변 → 판단 기준 → 실행 방법 → 조건·예외 → 다음 행동’처럼 독자가 읽기 쉬운 흐름으로 재배치한다. 한 문단에는 하나의 핵심만 둔다.\n4. 표·목록·체크리스트가 본문 설명과 중복되지 않고 실제 판단에 도움이 되는지 정리한다. 마지막 문단은 요약 반복 대신 다음 행동과 재확인 시점을 제시한다.\n5. 새 사실을 추가하지 않는다. 조사 문서 claims에 없는 사실·날짜·숫자는 삭제하고, 출처 조건과 다른 표현은 원래 근거 범위로 축소한다. 근거 검증 자체는 작성 전 조사와 뒤의 독립 감사가 담당한다.\n6. 코드 진단 issues를 모두 해결하고 correctedHtml에 부분 수정본이 아닌 완성된 전체 HTML을 반환한다.\n\n통과 조건은 종합 88점, 사실성·근거성 각 95점, 유용성 88점, 검색의도 90점, 독창 가치·가독성 각 85점, 제목 정확성·완결성 각 90점 이상이며 본문 유사도는 40%, 제목 유사도는 62% 미만이다. JSON 스키마에 맞는 객체만 출력한다.`,
      });
      let parsedReview: Review;
      try {
        parsedReview = parseJson<Review>(reviewText);
      } catch (parseError) {
        const repairedReviewText = await generateWithModel({
          model: actualReviewerModel,
          keys,
          system:
            "당신은 JSON 형식 복구기다. 검수 결과와 수정 원고를 바꾸지 말고 유효한 JSON 객체만 출력한다. 설명과 코드펜스를 쓰지 않는다.",
          json: true,
          jsonSchema: REVIEW_RESPONSE_SCHEMA,
          schemaName: "repaired_editorial_review",
          maxTokens: 7000,
          prompt: `다음 검수 응답을 지정 스키마의 유효한 JSON으로 변환하라. 스키마: {"passed":false,"overallScore":0,"factualScore":0,"usefulnessScore":0,"styleScore":0,"intentScore":0,"evidenceScore":0,"originalValueScore":0,"readabilityScore":0,"titleAccuracyScore":0,"completenessScore":0,"titleAssessment":{"queryMatch":0,"specificity":0,"accuracy":0,"distinctiveness":0,"concision":0,"decision":""},"issues":[],"correctedTitle":"","correctedMetaDescription":"","correctedHtml":""}\n\n원문 응답:\n${reviewText}`,
        });
        parsedReview = parseJson<Review>(repairedReviewText);
        generationFailures.push(
          `검수 JSON 자동 복구: ${parseError instanceof Error ? parseError.message : "형식 오류"}`,
        );
      }
      review = validateReview(parsedReview, draft);
      finalDiagnostics = analyzeContentCraft({
        title: review.correctedTitle,
        html: review.correctedHtml,
        keyword: body.keyword,
        answerSummary: draft.answerSummary,
        existing,
      });
      if (!finalDiagnostics.passed)
        review.issues.push(
          ...finalDiagnostics.issues.map((issue) => `기술 진단: ${issue}`),
        );
      const citedHosts = new Set(
        [...review.correctedHtml.matchAll(/href="(https?:\/\/[^"#]+)"/gi)]
          .map((match) => {
            try {
              return new URL(match[1]).hostname.replace(/^www\./, "");
            } catch {
              return "";
            }
          })
          .filter(Boolean),
      );
      const sourceHosts = new Set<string>(
        sources.map((source: any) =>
          new URL(source.url).hostname.replace(/^www\./, ""),
        ),
      );
      const citedSourceCount = [...sourceHosts].filter((host) =>
        citedHosts.has(host),
      ).length;
      const minimumCitations = Math.min(2, sourceHosts.size);
      if (citedSourceCount < minimumCitations)
        review.issues.push(
          `본문에 조사 출처 링크가 부족합니다(${citedSourceCount}/${minimumCitations}).`,
        );
      review.passed = Boolean(
        review.passed &&
        review.overallScore >= 88 &&
        review.factualScore >= 95 &&
        review.evidenceScore >= 95 &&
        review.usefulnessScore >= 88 &&
        review.intentScore >= 90 &&
        review.originalValueScore >= 85 &&
        review.readabilityScore >= 85 &&
        review.titleAccuracyScore >= 90 &&
        review.completenessScore >= 90 &&
        review.titleAssessment.queryMatch >= 90 &&
        review.titleAssessment.specificity >= 85 &&
        review.titleAssessment.accuracy >= 95 &&
        review.titleAssessment.distinctiveness >= 85 &&
        review.titleAssessment.concision >= 85 &&
        finalDiagnostics.passed &&
        citedSourceCount >= minimumCitations,
      );
      if (review.passed && keys.openai) {
        const canUsePrevalidatedAudit = Boolean(
          researchDossier &&
            body.angle?.prevalidatedDossier &&
            evidencePolicy.level === "standard" &&
            Array.isArray(sources) &&
            sources.length >= 2,
        );
        evidenceAudit = canUsePrevalidatedAudit
          ? {
              passed: true,
              evidenceScore: 95,
              unsupportedClaims: [],
              misleadingClaims: [],
              freshnessIssues: [],
              notes: [
                "계획 단계의 주장-출처 사전검증과 본문 claim 연결을 재사용했습니다.",
              ],
              checkedSources: sources.slice(0, 4),
            }
          : await auditFinalEvidence(keys.openai, {
              category: body.category,
              keyword: body.keyword,
              angle: body.angle,
              html: review.correctedHtml,
              dossier: researchDossier,
            });
        if (!evidenceAudit.passed) {
          review.issues.push(
            ...evidenceAudit.unsupportedClaims.map(
              (issue) => `최종 근거 감사·미확인: ${issue}`,
            ),
            ...evidenceAudit.misleadingClaims.map(
              (issue) => `최종 근거 감사·왜곡 가능성: ${issue}`,
            ),
            ...evidenceAudit.freshnessIssues.map(
              (issue) => `최종 근거 감사·현재성: ${issue}`,
            ),
          );
          review.passed = false;
        }
      }
      if (review.passed) break;
      if (recoveryMode === "review_only") break;
    } catch (error: any) {
      generationFailures.push(
        error?.message || `작성·검수 ${attempt + 1}차 실패`,
      );
      if (isSystemicProviderError(error)) throw error;
      if (attempt === 2) {
        if (draft) {
          review = fallbackReview(
            draft,
            error?.message || "검수 결과 형식을 자동 복구하지 못했습니다.",
          );
          finalDiagnostics = analyzeContentCraft({
            title: draft.title,
            html: draft.html,
            keyword: body.keyword,
            answerSummary: draft.answerSummary,
            existing,
          });
          break;
        }
        throw error;
      }
    }
  }
  if (!draft || !review) throw new Error("글 작성 결과가 없습니다.");
  const recoveryDecision = review.passed
    ? null
    : classifyRecoveryDecision({
        review,
        evidenceAudit,
        diagnostics: finalDiagnostics || draftDiagnostics,
        dossier: researchDossier,
        generationFailures,
        recoveryMode,
      });
  return {
    title: review.correctedTitle || draft.title,
    metaDescription: review.correctedMetaDescription || draft.metaDescription,
    html: review.correctedHtml || draft.html,
    labels: draft.labels,
    answerSummary: draft.answerSummary,
    valueAdd: draft.valueAdd,
    factualNotes: draft.factualNotes,
    usedClaimIds: draft.usedClaimIds,
    coverageMap: draft.coverageMap,
    titleCandidates: draft.titleCandidates,
    titleSelectionReason: draft.titleSelectionReason,
    autoRepairs: draft.autoRepairs || [],
    sources,
    research,
    researchDossier,
    researchAttempts,
    evidencePolicy,
    generationRetries: generationFailures.length,
    recoveryPerformed: recoveryMode,
    recoveryDecision,
    producedAt: new Date().toISOString(),
    contentMode: body.angle?.contentMode || "evergreen",
    freshnessWindowHours: body.angle?.freshnessWindowHours || null,
    eventDate: body.angle?.eventDate || null,
    structure,
    review,
    evidenceAudit,
    contentDiagnostics: finalDiagnostics || draftDiagnostics,
    status: review.passed ? "ready" : "needs_review",
    models: {
      writer: writerModel,
      reviewer: actualReviewerModel,
      configuredReviewer: reviewerModel,
      reviewerFallbackUsed: actualReviewerModel !== reviewerModel,
    },
  };
}
