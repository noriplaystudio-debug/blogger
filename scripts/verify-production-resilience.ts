import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productionResilienceTestHooks } from "../lib/production";

const paragraph =
  "공식 자료를 기준으로 적용 조건과 확인 시점을 구분하고, 실제 이용 전에는 운영기관의 최신 안내를 다시 확인해야 합니다. ".repeat(
    4,
  );
const html = `<p>${paragraph}</p><h2>신청 전에 확인할 조건</h2><p>${paragraph}</p><p>${paragraph}</p><h2>실행 순서와 예외</h2><p>${paragraph}</p>`;
const draft: any = {
  title: "2026 추석 열차 예약대기 신청 기준과 확인 순서",
  titleCandidates: [
    {
      title: "2026 추석 열차 예약대기, 신청 기준과 확인 순서",
      strategy: "direct_answer",
      queryFit: "질문에 직접 답합니다.",
      promise: "기준과 순서를 설명합니다.",
      risk: "없음",
    },
    {
      title: "추석 열차를 이용하려는 사람의 예약대기 확인법",
      strategy: "conditional",
      queryFit: "대상을 밝힙니다.",
      promise: "확인법을 설명합니다.",
      risk: "없음",
    },
    {
      title: "KTX와 SRT 예약대기 확인 경로 비교",
      strategy: "comparison",
      queryFit: "경로를 비교합니다.",
      promise: "차이를 설명합니다.",
      risk: "없음",
    },
    {
      title: "매진 뒤 좌석을 확인하는 예약대기 활용 방법",
      strategy: "problem_solution",
      queryFit: "문제를 해결합니다.",
      promise: "활용법을 설명합니다.",
      risk: "없음",
    },
  ],
  titleSelectionReason: "",
  metaDescription: "짧음",
  labels: [],
  html,
  factualNotes: [],
  usedClaimIds: [],
  coverageMap: [],
  answerSummary: "",
  valueAdd: null,
};

const repaired = productionResilienceTestHooks.validateDraft(draft);
assert.equal(
  repaired.title.replace(/[^\p{L}\p{N}]/gu, ""),
  repaired.titleCandidates[0].title.replace(/[^\p{L}\p{N}]/gu, ""),
);
assert.ok(repaired.metaDescription.length >= 50);
assert.ok(repaired.labels.length > 0);
assert.ok(repaired.factualNotes.length >= 1);
assert.ok(repaired.autoRepairs?.length);

const review = productionResilienceTestHooks.validateReview(
  {
    passed: false,
    issues: [],
    correctedTitle: "",
    correctedMetaDescription: "",
    correctedHtml: "",
  } as any,
  repaired,
);
assert.equal(review.correctedTitle, repaired.title);
assert.equal(review.correctedHtml, repaired.html);
assert.equal(review.overallScore, 0);
assert.ok(review.titleAssessment.decision);
assert.equal(
  productionResilienceTestHooks.isSystemicProviderError(
    new Error("invalid x-api-key"),
  ),
  true,
);
const formatDecision = productionResilienceTestHooks.classifyRecoveryDecision({
  review,
  generationFailures: ["AI 응답의 JSON 형식을 자동 복구하지 못했습니다"],
});
assert.equal(formatDecision.mode, "review_only");
assert.equal(formatDecision.automatic, true);

const scoredReview: any = {
  ...review,
  overallScore: 90,
  factualScore: 80,
  evidenceScore: 70,
  usefulnessScore: 92,
  intentScore: 93,
  originalValueScore: 90,
  readabilityScore: 90,
  titleAccuracyScore: 92,
  completenessScore: 92,
  issues: ["최종 근거 감사·미확인: 신청 날짜"],
};
const evidenceDecision = productionResilienceTestHooks.classifyRecoveryDecision(
  {
    review: scoredReview,
  },
);
assert.equal(evidenceDecision.mode, "evidence_repair");
assert.equal(evidenceDecision.automatic, true);

const contentDecision = productionResilienceTestHooks.classifyRecoveryDecision({
  review: {
    ...scoredReview,
    factualScore: 98,
    evidenceScore: 98,
    intentScore: 70,
    issues: ["첫 문단이 검색 질문에 직접 답하지 않습니다."],
  },
});
assert.equal(contentDecision.mode, "content_repair");

const conflictDecision = productionResilienceTestHooks.classifyRecoveryDecision(
  {
    review: scoredReview,
    recoveryMode: "evidence_repair",
    dossier: { conflicts: ["공식기관 두 곳의 적용일이 다릅니다."] } as any,
  },
);
assert.equal(conflictDecision.mode, "manual_review");
assert.equal(conflictDecision.automatic, false);

const researchSources = [
  { title: "공식 원문", url: "https://official.example/rule" },
  { title: "독립 자료", url: "https://independent.example/check" },
];
const researchDossier: any = {
  checkedAt: "2026-09-24",
  readerNeed: "신청 조건 확인",
  directAnswer: "공식 조건을 먼저 확인해야 합니다.",
  scope: "국내 신청자",
  claims: [
    {
      id: "C1",
      statement: "공식 신청 조건",
      sourceUrl: researchSources[0].url,
      sourceTitle: researchSources[0].title,
      sourceType: "primary",
      timeSensitivity: "changing",
      limitation: "기준일 확인 필요",
    },
    {
      id: "C2",
      statement: "독립 확인 내용",
      sourceUrl: researchSources[1].url,
      sourceTitle: researchSources[1].title,
      sourceType: "authoritative_secondary",
      timeSensitivity: "changing",
      limitation: "없음",
    },
    {
      id: "C3",
      statement: "실행 순서",
      sourceUrl: researchSources[0].url,
      sourceTitle: researchSources[0].title,
      sourceType: "primary",
      timeSensitivity: "stable",
      limitation: "없음",
    },
  ],
  conflicts: [],
  unknowns: [],
  coverage: [
    {
      requirement: "신청 조건",
      supported: true,
      claimIds: ["C1", "C2"],
      gap: "없음",
    },
  ],
  practicalSteps: ["공식 페이지 확인"],
  uniqueValuePlan: ["조건별 체크리스트"],
};
assert.doesNotThrow(() =>
  productionResilienceTestHooks.validateResearchDossier(
    structuredClone(researchDossier),
    researchSources,
    ["신청 조건"],
  ),
);
const missingCoverage = structuredClone(researchDossier);
missingCoverage.coverage = [];
assert.throws(() =>
  productionResilienceTestHooks.validateResearchDossier(
    missingCoverage,
    researchSources,
    ["신청 조건"],
  ),
);
const standardPolicy =
  productionResilienceTestHooks.determineEvidencePolicy({
    category: "생활 정리",
    keyword: "옷장 정리 순서",
    angle: { contentMode: "evergreen" },
  });
assert.equal(standardPolicy.level, "standard");
const standardDossier = structuredClone(researchDossier);
standardDossier.claims = standardDossier.claims.map((claim: any) => ({
  ...claim,
  sourceType: "authoritative_secondary" as const,
}));
assert.doesNotThrow(() =>
  productionResilienceTestHooks.validateResearchDossier(
    standardDossier,
    researchSources,
    ["신청 조건"],
    standardPolicy,
  ),
);
const strictPolicy =
  productionResilienceTestHooks.determineEvidencePolicy({
    category: "교통",
    keyword: "KTX 일정",
    angle: { contentMode: "realtime" },
  });
assert.equal(strictPolicy.level, "strict");
assert.doesNotThrow(() =>
  productionResilienceTestHooks.validateResearchDossier(
    structuredClone(standardDossier),
    researchSources,
    ["신청 조건"],
    strictPolicy,
  ),
);
const oneDomainStrict = structuredClone(standardDossier);
oneDomainStrict.claims = oneDomainStrict.claims.map((claim: any) => ({
  ...claim,
  sourceUrl: researchSources[0].url,
  sourceTitle: researchSources[0].title,
}));
assert.throws(() =>
  productionResilienceTestHooks.validateResearchDossier(
    oneDomainStrict,
    researchSources,
    ["신청 조건"],
    strictPolicy,
  ),
);
const onePrimaryDomainStrict = structuredClone(oneDomainStrict);
onePrimaryDomainStrict.claims = onePrimaryDomainStrict.claims.map(
  (claim: any) => ({ ...claim, sourceType: "primary" as const }),
);
assert.doesNotThrow(() =>
  productionResilienceTestHooks.validateResearchDossier(
    onePrimaryDomainStrict,
    researchSources,
    ["신청 조건"],
    strictPolicy,
  ),
);
const productionSource = readFileSync(
  new URL("../lib/production.ts", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../app/page.tsx", import.meta.url),
  "utf8",
);
assert.ok(productionSource.includes("reviewerFallbackUsed"));
assert.ok(productionSource.includes("REVIEW_FALLBACK_MODEL"));
assert.ok(pageSource.includes("초안 생성 완료 · 자동 검수 재시도 필요"));
assert.ok(pageSource.includes("produceReplacementForBlocked"));
assert.ok(pageSource.includes("다른 글 방향·다음 키워드로 대체"));
assert.ok(pageSource.includes("검토 필요 글도 Blogger 임시저장"));
assert.ok(pageSource.includes("existingArticle"));
assert.ok(pageSource.includes("recoveryContext"));
assert.ok(productionSource.includes('recoveryMode !== "review_only"'));
assert.ok(productionSource.includes("classifyRecoveryDecision"));
assert.ok(productionSource.includes("WRITER_RESPONSE_SCHEMA"));
assert.ok(productionSource.includes("REVIEW_RESPONSE_SCHEMA"));
assert.ok(productionSource.includes("coverage"));
const dailySource = readFileSync(
  new URL("../app/api/cron/daily/route.ts", import.meta.url),
  "utf8",
);
assert.ok(dailySource.includes("replacement_reserve_released"));
assert.ok(dailySource.includes("completedSlots"));

console.log("PASS  글 생성 자동 복구 회귀 검사");
