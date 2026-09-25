import OpenAI from "openai";
import { extractCitations } from "@/lib/openai";
import { parseJson } from "@/lib/models";

export const PLANNING_LIMITS = {
  categories: 5,
  keywordsPerCategory: 5,
  anglesPerKeyword: 2,
  automaticArticlesPerDay: 7,
};

export type PlanningSettings = {
  categoryCount: number;
  keywordsPerCategory: number;
  articlesPerKeyword: number;
  dailyArticleLimit: number;
};

export const DEFAULT_PLANNING_SETTINGS: PlanningSettings = {
  categoryCount: 5,
  keywordsPerCategory: 5,
  articlesPerKeyword: 2,
  dailyArticleLimit: 7,
};

export function normalizePlanningSettings(
  input: Partial<PlanningSettings> = {},
): PlanningSettings {
  const settings = { ...DEFAULT_PLANNING_SETTINGS, ...input };
  const limits = [
    ["categoryCount", settings.categoryCount, 1, 20],
    ["keywordsPerCategory", settings.keywordsPerCategory, 1, 20],
    ["articlesPerKeyword", settings.articlesPerKeyword, 1, 5],
    ["dailyArticleLimit", settings.dailyArticleLimit, 1, 20],
  ] as const;
  for (const [name, value, min, max] of limits)
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${name} 값은 ${min}~${max} 사이의 정수여야 합니다.`);
  return settings;
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function score(value: unknown, label: string) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 100)
    throw new Error(`${label} 점수가 올바르지 않습니다.`);
  return result;
}

function weightedScore(
  scores: Record<string, unknown>,
  weights: Record<string, number>,
  label: string,
) {
  return Math.round(
    Object.entries(weights).reduce(
      (sum, [key, weight]) =>
        sum + score(scores?.[key], `${label}.${key}`) * weight,
      0,
    ),
  );
}

function phraseSimilarity(a: string, b: string) {
  const grams = (value: string) => {
    const clean = normalized(value);
    if (clean.length <= 3) return new Set([clean]);
    return new Set(
      Array.from({ length: clean.length - 2 }, (_, index) =>
        clean.slice(index, index + 3),
      ),
    );
  };
  const left = grams(a);
  const right = grams(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  left.forEach((item) => right.has(item) && (common += 1));
  return common / (left.size + right.size - common);
}

function curatePlan(plan: any, settings: PlanningSettings) {
  if (!plan || !Array.isArray(plan.categories))
    throw new Error("카테고리 조사 결과가 없습니다.");
  const rejected: { type: string; name: string; reason: string }[] = [];
  const usedKeywords: string[] = [];
  const eligibleCategories = plan.categories
    .map((category: any) => {
      const contentMode =
        category.contentMode === "realtime" ? "realtime" : "evergreen";
      const categoryScore = weightedScore(
        category.scores,
        contentMode === "realtime"
          ? {
              demand: 0.22,
              momentum: 0.25,
              durability: 0.05,
              accessibility: 0.13,
              adSafety: 0.15,
              sourceability: 0.2,
            }
          : {
              demand: 0.2,
              momentum: 0.1,
              durability: 0.2,
              accessibility: 0.15,
              adSafety: 0.15,
              sourceability: 0.2,
            },
        category.name || "카테고리",
      );
      const categoryGate =
        contentMode === "realtime"
          ? categoryScore >= 62 &&
            score(category.scores?.demand, "demand") >= 60 &&
            score(category.scores?.momentum, "momentum") >= 70 &&
            score(category.scores?.adSafety, "adSafety") >= 80 &&
            score(category.scores?.sourceability, "sourceability") >= 70
          : categoryScore >= 60 &&
            score(category.scores?.durability, "durability") >= 55 &&
            score(category.scores?.adSafety, "adSafety") >= 75 &&
            score(category.scores?.sourceability, "sourceability") >= 60;
      if (!categoryGate) {
        rejected.push({
          type: "category",
          name: category.name || "이름 없음",
          reason:
            contentMode === "realtime"
              ? "실시간 수요·상승세·광고 안전성·출처 확보 기준 미달"
              : "지속성·광고 안전성·출처 확보 품질 기준 미달",
        });
        return null;
      }
      const keywords = (
        Array.isArray(category.keywords) ? category.keywords : []
      )
        .map((keyword: any) => ({
          ...keyword,
          contentMode,
          priorityScore: weightedScore(
            keyword.scores,
            contentMode === "realtime"
              ? {
                  demand: 0.2,
                  momentum: 0.24,
                  durability: 0.04,
                  competitionOpportunity: 0.12,
                  sourceability: 0.18,
                  uniqueValue: 0.12,
                  topicalFit: 0.1,
                }
              : {
                  demand: 0.18,
                  momentum: 0.1,
                  durability: 0.15,
                  competitionOpportunity: 0.15,
                  sourceability: 0.15,
                  uniqueValue: 0.17,
                  topicalFit: 0.1,
                },
            keyword.keyword || "키워드",
          ),
        }))
        .sort((a: any, b: any) => b.priorityScore - a.priorityScore)
        .filter((keyword: any) => {
          const sourceDomains = evidenceDomains(keyword.evidence);
          const gatePassed =
            contentMode === "realtime"
              ? keyword.priorityScore >= 62 &&
                score(keyword.scores?.demand, "keyword.demand") >= 60 &&
                score(keyword.scores?.momentum, "keyword.momentum") >= 70 &&
                score(keyword.scores?.sourceability, "keyword.sourceability") >=
                  70 &&
                score(keyword.scores?.uniqueValue, "keyword.uniqueValue") >=
                  55 &&
                score(keyword.scores?.topicalFit, "keyword.topicalFit") >= 70 &&
                sourceDomains.size >= 2 &&
                keyword.confidence !== "낮음"
              : keyword.priorityScore >= 62 &&
                score(keyword.scores?.durability, "keyword.durability") >= 50 &&
                score(keyword.scores?.sourceability, "keyword.sourceability") >=
                  60 &&
                score(keyword.scores?.uniqueValue, "keyword.uniqueValue") >=
                  60 &&
                score(keyword.scores?.topicalFit, "keyword.topicalFit") >= 70 &&
                sourceDomains.size >= 2 &&
                keyword.confidence !== "낮음";
          const overlaps = usedKeywords.some(
            (used) => phraseSimilarity(used, keyword.keyword || "") >= 0.72,
          );
          if (!gatePassed || overlaps) {
            rejected.push({
              type: "keyword",
              name: keyword.keyword || "이름 없음",
              reason: overlaps
                ? "기존 선정 키워드와 검색 의도가 지나치게 유사함"
                : sourceDomains.size < 2
                  ? "작성 전 교차검증에 필요한 서로 다른 출처 2곳을 확보하지 못함"
                  : contentMode === "realtime"
                    ? "실시간 수요·상승세·출처·독창 가치 기준 미달"
                    : "수요·지속성·출처·독창 가치 품질 기준 미달",
            });
            return false;
          }
          usedKeywords.push(keyword.keyword);
          return true;
        })
        .slice(0, settings.keywordsPerCategory);
      if (!keywords.length) {
        rejected.push({
          type: "category",
          name: category.name || "이름 없음",
          reason: "발행 가능한 품질의 키워드가 없음",
        });
        return null;
      }
      return {
        ...category,
        contentMode,
        priorityScore: categoryScore,
        keywords,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.priorityScore - a.priorityScore);
  const realtimeTarget = Math.min(
    settings.categoryCount,
    Math.max(1, Math.ceil(settings.categoryCount * 0.4)),
  );
  const realtime = eligibleCategories.filter(
    (category: any) => category.contentMode === "realtime",
  );
  const evergreen = eligibleCategories.filter(
    (category: any) => category.contentMode === "evergreen",
  );
  const selectedRealtime = realtime.slice(0, realtimeTarget);
  const categories = [
    ...selectedRealtime,
    ...evergreen.slice(0, settings.categoryCount - selectedRealtime.length),
    ...realtime.slice(selectedRealtime.length),
  ]
    .slice(0, settings.categoryCount)
    .sort(
      (a: any, b: any) =>
        Number(b.contentMode === "realtime") -
          Number(a.contentMode === "realtime") ||
        b.priorityScore - a.priorityScore,
    );
  if (!categories.length)
    throw new Error(
      "이번 조사에서는 품질 기준을 통과한 주제가 없습니다. 낮은 품질의 글을 억지로 만들지 않았습니다.",
    );
  return {
    ...plan,
    categories,
    qualityGate: {
      requestedCategories: settings.categoryCount,
      selectedCategories: categories.length,
      requestedKeywordsPerCategory: settings.keywordsPerCategory,
      selectedKeywords: categories.reduce(
        (sum: number, category: any) => sum + category.keywords.length,
        0,
      ),
      realtimeTarget,
      selectedRealtimeCategories: categories.filter(
        (category: any) => category.contentMode === "realtime",
      ).length,
      rejected,
      rule: "카테고리의 약 40%(최소 1개)는 검증 가능한 사건·연예·스포츠 등 실시간 관심 트랙으로 우선 배정하고, 나머지는 장기 검색형으로 구성함. 각 트랙의 수요·현재성·광고 안전성·출처 기준 미달 항목은 발행하지 않음",
    },
  };
}

function evidenceDomains(evidence: any[]) {
  const domains = new Set<string>();
  for (const item of evidence || []) {
    try {
      const url = new URL(item?.url || "");
      if (!["http:", "https:"].includes(url.protocol)) continue;
      domains.add(url.hostname.replace(/^www\./, ""));
    } catch {}
  }
  return domains;
}

export function validatePlan(
  plan: any,
  settings: PlanningSettings = DEFAULT_PLANNING_SETTINGS,
) {
  if (
    !plan ||
    !Array.isArray(plan.categories) ||
    !plan.categories.length ||
    plan.categories.length > settings.categoryCount
  )
    throw new Error(`카테고리는 1~${settings.categoryCount}개여야 합니다.`);
  const categories = new Set<string>();
  const keywords = new Set<string>();
  const previousCategoryScore: Record<string, number> = {
    realtime: Infinity,
    evergreen: Infinity,
  };
  let seenEvergreen = false;
  for (const category of plan.categories) {
    const categoryKey = normalized(category.name || "");
    if (!categoryKey || categories.has(categoryKey))
      throw new Error("카테고리 이름이 비어 있거나 중복됩니다.");
    categories.add(categoryKey);
    if (!["realtime", "evergreen"].includes(category.contentMode))
      throw new Error(`${category.name}: 콘텐츠 트랙 구분이 없습니다.`);
    if (category.contentMode === "evergreen") seenEvergreen = true;
    if (category.contentMode === "realtime" && seenEvergreen)
      throw new Error(
        "실시간 관심 카테고리는 빠른 발행을 위해 앞에 배치해야 합니다.",
      );
    if (
      !String(category.audience || "").trim() ||
      !String(category.sitePurpose || "").trim()
    )
      throw new Error(
        `${category.name}: 블로그의 특정 독자와 핵심 목적이 정의되지 않았습니다.`,
      );
    if (
      !Number.isFinite(category.priorityScore) ||
      category.priorityScore < 0 ||
      category.priorityScore > 100
    )
      throw new Error(`${category.name}: 우선순위 점수가 올바르지 않습니다.`);
    if (category.priorityScore > previousCategoryScore[category.contentMode])
      throw new Error(
        "같은 콘텐츠 트랙의 카테고리가 우선순위 점수 내림차순이 아닙니다.",
      );
    previousCategoryScore[category.contentMode] = category.priorityScore;
    if (!["상승", "보합", "판단보류"].includes(category.trend))
      throw new Error(`${category.name}: 추세 판정이 올바르지 않습니다.`);
    if (!["높음", "중간", "낮음"].includes(category.confidence))
      throw new Error(`${category.name}: 근거 신뢰도가 없습니다.`);
    if (
      !Array.isArray(category.evidence) ||
      !evidenceDomains(category.evidence).size
    )
      throw new Error(`${category.name}: 확인 가능한 근거 링크가 없습니다.`);
    if (
      category.trend === "상승" &&
      category.confidence === "높음" &&
      evidenceDomains(category.evidence).size < 2
    )
      throw new Error(
        `${category.name}: 상승·높음 판정에는 서로 다른 출처 2개가 필요합니다.`,
      );
    if (
      !Array.isArray(category.keywords) ||
      !category.keywords.length ||
      category.keywords.length > settings.keywordsPerCategory
    )
      throw new Error(
        `${category.name}: 키워드는 1~${settings.keywordsPerCategory}개여야 합니다.`,
      );
    let previousKeywordScore = Infinity;
    for (const keyword of category.keywords) {
      const keywordKey = normalized(keyword.keyword || "");
      if (!keywordKey || keywords.has(keywordKey))
        throw new Error(
          `키워드가 비어 있거나 중복됩니다: ${keyword.keyword || "(없음)"}`,
        );
      keywords.add(keywordKey);
      if (keyword.contentMode !== category.contentMode)
        throw new Error(
          `${keyword.keyword}: 키워드와 카테고리의 콘텐츠 트랙이 다릅니다.`,
        );
      if (keyword.contentMode === "realtime") {
        if (![6, 24, 72, 168].includes(Number(keyword.freshnessWindowHours)))
          throw new Error(
            `${keyword.keyword}: 실시간 글의 현재성 확인 주기가 올바르지 않습니다.`,
          );
        if (!Number.isFinite(Date.parse(keyword.sourceCheckedAt || "")))
          throw new Error(
            `${keyword.keyword}: 실시간 출처 확인 시각이 없습니다.`,
          );
      }
      if (
        !Number.isFinite(keyword.priorityScore) ||
        keyword.priorityScore < 0 ||
        keyword.priorityScore > 100
      )
        throw new Error(
          `${keyword.keyword}: 우선순위 점수가 올바르지 않습니다.`,
        );
      if (keyword.priorityScore > previousKeywordScore)
        throw new Error(
          `${category.name}: 키워드가 우선순위 내림차순이 아닙니다.`,
        );
      previousKeywordScore = keyword.priorityScore;
      if (
        !Array.isArray(keyword.angles) ||
        keyword.angles.length !== settings.articlesPerKeyword
      )
        throw new Error(
          `${keyword.keyword}: 글 방향이 정확히 ${settings.articlesPerKeyword}개가 아닙니다.`,
        );
      if (evidenceDomains(keyword.evidence).size < 2)
        throw new Error(
          `${keyword.keyword}: 첫 작성 성공률을 위해 서로 다른 근거 도메인 2개가 필요합니다.`,
        );
      const angleNames = keyword.angles.map((angle: any) =>
        normalized(angle?.titleIdea || ""),
      );
      if (
        angleNames.some((name: string) => !name) ||
        new Set(angleNames).size !== angleNames.length
      )
        throw new Error(
          `${keyword.keyword}: 글 방향이 비어 있거나 중복됩니다.`,
        );
      for (const angle of keyword.angles) {
        if (
          !String(angle.searchQuestion || "").trim() ||
          !String(angle.readerSituation || "").trim() ||
          !String(angle.answerPromise || "").trim() ||
          !String(angle.uniqueValue || "").trim() ||
          !Array.isArray(angle.mustCover) ||
          angle.mustCover.length < 3 ||
          !Array.isArray(angle.exclusions)
        )
          throw new Error(
            `${keyword.keyword}: 독자 질문·상황·답변 약속·필수 항목을 포함한 글 브리프가 부족합니다.`,
          );
      }
      if (
        !keyword.confidence ||
        !["높음", "중간", "낮음"].includes(keyword.confidence)
      )
        throw new Error(`${keyword.keyword}: 근거 신뢰도가 없습니다.`);
      if (
        !["기둥글", "하위질문", "비교", "실행", "문제해결"].includes(
          keyword.clusterRole,
        )
      )
        throw new Error(`${keyword.keyword}: 콘텐츠 클러스터 역할이 없습니다.`);
      if (!["상승", "보합", "판단보류"].includes(keyword.trend))
        throw new Error(`${keyword.keyword}: 추세 판정이 올바르지 않습니다.`);
      const domains = evidenceDomains(keyword.evidence);
      if (!domains.size)
        throw new Error(
          `${keyword.keyword}: 확인 가능한 근거 링크가 없습니다.`,
        );
      if (
        keyword.trend === "상승" &&
        keyword.confidence === "높음" &&
        domains.size < 2
      )
        throw new Error(
          `${keyword.keyword}: 상승·높음 판정에는 서로 다른 출처 2개가 필요합니다.`,
        );
    }
  }
  return plan;
}

function validEvidence(value: any[]) {
  return Array.isArray(value) && evidenceDomains(value).size >= 2;
}

function assignSharedBlogGroups(categories: any[]) {
  const count = categories.length;
  if (!count) return categories;
  const desiredGroups = Math.max(1, Math.ceil(count / 4));
  const proposedGroups = new Map<string, any[]>();
  for (const category of categories) {
    const key = normalized(category.blogGroupId || category.blogGroup || "");
    if (!key) continue;
    const group = proposedGroups.get(key) || [];
    group.push(category);
    proposedGroups.set(key, group);
  }
  const proposed = [...proposedGroups.values()];
  const proposedIsUsable =
    proposed.length === desiredGroups &&
    proposed.every(
      (group) => group.length >= (count === 1 ? 1 : 2) && group.length <= 4,
    );
  const groups: any[][] = proposedIsUsable
    ? proposed
    : Array.from({ length: desiredGroups }, () => []);
  if (!proposedIsUsable)
    categories.forEach((category, index) =>
      groups[index % desiredGroups].push(category),
    );
  const neutralNames = [
    "오늘의 똑똑이",
    "알쓸 똑똑이",
    "한눈에 똑똑이",
    "매일 똑똑이",
    "정보 똑똑이",
  ];
  groups.forEach((group, index) => {
    const groupId = `smart-guide-${index + 1}`;
    const groupCategories = group.map((category) => category.name);
    const suggestedBlogName = neutralNames[index % neutralNames.length];
    const suggestedBlogDescription = `${groupCategories.join(" · ")} 등 일상에서 자주 찾는 정보를 쉽고 정확하게 정리합니다.`;
    const baseAddress = `smart-guide-${index + 1}`;
    group.forEach((category) => {
      category.blogGroupId = groupId;
      category.blogGroupCategories = groupCategories;
      category.suggestedBlogName = suggestedBlogName;
      category.suggestedBlogDescription = suggestedBlogDescription;
      category.suggestedBlogAddresses = [
        `${baseAddress}-kr`,
        `${baseAddress}-daily`,
        `${baseAddress}-note`,
      ];
    });
  });
  return categories;
}

function urlDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function validPreflightClaims(value: any[], sources: any[]) {
  if (!Array.isArray(value) || value.length < 3) return false;
  const openedDomains = new Set(
    (sources || []).map((source: any) => urlDomain(source?.url)).filter(Boolean),
  );
  const claimDomains = new Set<string>();
  let hasPrimary = false;
  for (const claim of value) {
    const domain = urlDomain(claim?.sourceUrl);
    if (
      !String(claim?.id || "").trim() ||
      !String(claim?.statement || "").trim() ||
      !domain ||
      !openedDomains.has(domain) ||
      !["primary", "authoritative_secondary"].includes(claim?.sourceType) ||
      !["stable", "changing"].includes(claim?.timeSensitivity)
    )
      return false;
    claimDomains.add(domain);
    if (claim.sourceType === "primary") hasPrimary = true;
  }
  return claimDomains.size >= 2 || hasPrimary;
}

export async function createCategoryStage(
  apiKey: string,
  context: {
    categoryPortfolio?: string[];
    recentKeywords?: string[];
    recentContent?: any[];
    settings?: PlanningSettings;
    performanceGuidance?: any[];
    strategyGuidance?: any;
  } = {},
) {
  const settings = normalizePlanningSettings(context.settings);
  const realtimeTarget = Math.min(
    settings.categoryCount,
    Math.max(1, Math.ceil(settings.categoryCount * 0.4)),
  );
  const response = await new OpenAI({ apiKey }).responses.create({
    model: process.env.RESEARCH_MODEL || "gpt-5.6-terra",
    tools: [{ type: "web_search" }],
    include: ["web_search_call.action.sources" as any],
    reasoning: { effort: "high" },
    max_output_tokens: 9000,
    input: `오늘 기준 한국의 공개 검색 관심 신호를 조사해 Google Blogger 카테고리 후보만 선정한다. 아직 키워드나 글 방향은 만들지 않는다.

요청 카테고리: 최대 ${settings.categoryCount}개. 내부적으로 최소 ${settings.categoryCount * 2}개 후보를 검토하고 최종 후보만 출력한다. 카테고리 수가 1개여도 실시간 관심형을 먼저 검토하며, 전체의 약 40%(최소 ${realtimeTarget}개)는 realtime으로 우선 선정한다. realtime은 사건·방송·공연·영화·음악·스포츠 일정·결과·기록·공식 발표처럼 1시간~7일 동안 관심이 집중되는 주제다. evergreen은 3개월 이상 반복 검색될 문제다.

블로그 수를 늘리지 않도록 독자 목적이 비슷한 카테고리를 3~4개씩 같은 blogGroupId로 묶는다. 전체 수량상 불가피할 때만 2개 묶음을 허용한다. 서로 완전히 무관한 주제는 한 묶음에 넣지 않는다. 블로그 이름은 특정 카테고리에 종속되지 않는 '오늘의 똑똑이', '알쓸 똑똑이' 같은 중립적인 브랜드형 이름으로 제안한다. 같은 blogGroupId의 카테고리는 추천 이름·소개·주소 후보가 모두 같아야 한다.

실시간이라고 배제하지 않는다. 단, 연예인 사생활·루머·확인되지 않은 열애설, 피해자 신상·잔혹 묘사·사건 자극화, 정치 선동, 고위험 의료·법률·투자 추천, 성인·도박·불법·혐오·저작권 침해는 제외한다. 연예는 공식 작품·방송·공연·차트·수상 정보, 스포츠는 공식 일정·결과·기록·규정·공개 발표, 사건은 공공기관 발표·교통·안전·서비스 변경·후속 절차처럼 검증 가능한 정보만 다룬다.

Google Trends·자동완성·관련 검색어·최근 보도량·공식 자료를 교차 확인하되 자동완성 순서를 검색량으로 주장하지 않는다. 각 최종 카테고리는 서로 다른 도메인의 실제 원문 URL 2개 이상을 evidence에 넣는다. 사용자 개인 검색 기록은 사용하지 않는다.

현재 운영 카테고리: ${JSON.stringify((context.categoryPortfolio || []).slice(0, 20))}
최근 사용 키워드·글은 그대로 반복하지 않고 빈틈을 찾는 참고로만 쓴다: ${JSON.stringify({ keywords: (context.recentKeywords || []).slice(0, 100), content: (context.recentContent || []).slice(0, 100) }).slice(0, 10000)}
성과 참고: ${JSON.stringify(context.performanceGuidance || []).slice(0, 8000)}
수익 전략 참고: ${JSON.stringify(context.strategyGuidance || {}).slice(0, 6000)}

JSON만 출력한다: {"weekLabel":"YYYY-MM-DD 시작 주간","marketSummary":"조사 결과와 한계","methodNote":"공개 관심 신호 기반임을 설명","categories":[{"name":"카테고리","contentMode":"evergreen|realtime","audience":"특정 독자","sitePurpose":"반복 해결할 문제","blogGroupId":"shared-group-1","suggestedBlogName":"중립적인 브랜드 이름","suggestedBlogDescription":"묶인 카테고리를 포괄하는 한 줄 소개","suggestedBlogAddresses":["address-one","address-two","address-three"],"reason":"선정 근거","trend":"상승|보합|판단보류","confidence":"높음|중간","scores":{"demand":0,"momentum":0,"durability":0,"accessibility":0,"adSafety":0,"sourceability":0},"evidence":[{"signal":"관찰 신호","period":"1시간|24시간|7일|30일|12개월","url":"https://..."}]}]}`,
  });
  const value = parseJson<any>(response.output_text);
  if (
    !value?.weekLabel ||
    !Array.isArray(value.categories) ||
    !value.categories.length ||
    value.categories.length > settings.categoryCount
  )
    throw new Error("카테고리 단계 결과의 수량 또는 형식이 올바르지 않습니다.");
  assignSharedBlogGroups(value.categories);
  const seen = new Set<string>();
  for (const category of value.categories) {
    const key = normalized(category?.name || "");
    if (!key || seen.has(key))
      throw new Error("카테고리 단계에 빈 이름 또는 중복 이름이 있습니다.");
    seen.add(key);
    if (!["evergreen", "realtime"].includes(category.contentMode))
      throw new Error(`${category.name}: 콘텐츠 트랙이 없습니다.`);
    for (const scoreName of [
      "demand",
      "momentum",
      "durability",
      "accessibility",
      "adSafety",
      "sourceability",
    ])
      score(category.scores?.[scoreName], `${category.name}.${scoreName}`);
    if (!validEvidence(category.evidence))
      throw new Error(`${category.name}: 독립 근거 출처가 2곳 미만입니다.`);
    category.keywords = [];
  }
  if (
    !value.categories.some(
      (category: any) => category.contentMode === "realtime",
    )
  )
    throw new Error("실시간 관심 카테고리를 확보하지 못했습니다.");
  return {
    draft: value,
    sources: extractCitations(response),
    settings,
  };
}

export async function createKeywordStage(
  apiKey: string,
  input: {
    category: any;
    settings: PlanningSettings;
    recentKeywords?: string[];
    recentContent?: any[];
  },
) {
  const settings = normalizePlanningSettings(input.settings);
  const category = input.category;
  const candidatePoolSize = Math.min(
    30,
    Math.max(settings.keywordsPerCategory * 3, settings.keywordsPerCategory + 4),
  );
  const response = await new OpenAI({ apiKey }).responses.create({
    model: process.env.RESEARCH_MODEL || "gpt-5.6-terra",
    tools: [{ type: "web_search" }],
    include: ["web_search_call.action.sources" as any],
    reasoning: { effort: "high" },
    max_output_tokens: 10000,
    input: `다음 Google Blogger 카테고리에서 이번 주에 작성할 키워드만 조사한다. 글 방향은 아직 만들지 않는다.

카테고리: ${JSON.stringify(category)}
최종 필요 키워드 수는 ${settings.keywordsPerCategory}개다. 이번 응답에는 후보를 최대 ${candidatePoolSize}개까지 출력한다. 서버가 근거 사전검증을 통과한 후보만 골라 최종 수량을 채운다. 각 키워드는 실제 독자 질문이어야 하며 서로 검색 의도가 겹치지 않아야 한다.

카테고리가 realtime이면 짧은 유효기간 때문에 제외하지 말고 수요·상승세·공식 출처·광고 안전성으로 평가한다. freshnessWindowHours는 6·24·72·168 중 하나로 정하고 eventDate와 현재 sourceCheckedAt을 기록한다. 행사·경기·시상식이 아직 끝나지 않았다면 수상작·우승·최종 결과·최종 순위처럼 미래 사실을 전제한 키워드를 선정하지 말고 일정·후보·현재 순위·관전 포인트처럼 현재 확인 가능한 질문으로 자동 전환한다. evergreen이면 반복 검색 가능성과 실행 가치를 우선한다.

각 키워드는 서로 다른 도메인의 실제 원문 URL 2개 이상을 evidence에 넣고 가능하면 1차 자료를 포함한다. URL만 수집하지 말고 실제 원문을 열어 글에 사용할 수 있는 검증 주장 3개 이상을 verifiedClaims에 넣는다. 각 주장은 실제로 연 원문 URL, 출처 유형, 현재성, 적용 한계를 포함해야 한다. 공식 원문 한 곳이 핵심 내용을 모두 제공하면 단일 도메인도 허용하지만 sourceType은 primary여야 한다. 루머·사생활·피해자 신상·자극적 추측·확인되지 않은 책임 단정은 제외한다. 검색량·CPC 숫자를 추정하지 않는다.

최근 사용 키워드(최근 80개): ${JSON.stringify((input.recentKeywords || []).slice(0, 80))}
최근 콘텐츠(최근 100개 요약): ${JSON.stringify((input.recentContent || []).slice(0, 100)).slice(0, 7000)}

JSON만 출력한다: {"keywords":[{"keyword":"구체적 검색어","contentMode":"${category.contentMode}","freshnessWindowHours":24,"eventDate":"YYYY-MM-DD 또는 해당 없음","sourceCheckedAt":"ISO-8601 시각","intent":"정보형|비교형|문제해결형|구매형","clusterRole":"기둥글|하위질문|비교|실행|문제해결","trend":"상승|보합|판단보류","confidence":"높음|중간","scores":{"demand":0,"momentum":0,"durability":0,"competitionOpportunity":0,"sourceability":0,"uniqueValue":0,"topicalFit":0},"reason":"근거와 한계","directAnswer":"현재 근거로 가능한 직접 답","evidence":[{"signal":"관찰 신호","period":"1시간|24시간|7일|30일|12개월","url":"https://..."}],"verifiedClaims":[{"id":"C1","statement":"검증된 한 가지 주장","sourceUrl":"https://실제로-연-원문","sourceTitle":"출처명","sourceType":"primary|authoritative_secondary","timeSensitivity":"stable|changing","limitation":"적용 조건·예외 또는 없음"}],"practicalSteps":["독자가 실행할 단계"],"uniqueValuePlan":["비교표·계산·절차·예외 구성"]}]}`,
  });
  const value = parseJson<any>(response.output_text);
  if (!Array.isArray(value?.keywords) || !value.keywords.length)
    throw new Error(`${category.name}: 키워드 단계 결과가 올바르지 않습니다.`);
  const openedSources = extractCitations(response);
  const seen = new Set<string>();
  const eligible: any[] = [];
  for (const keyword of value.keywords.slice(0, candidatePoolSize)) {
    const key = normalized(keyword?.keyword || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keyword.contentMode = category.contentMode;
    keyword.angles = [];
    if (!validEvidence(keyword.evidence)) continue;
    if (!validPreflightClaims(keyword.verifiedClaims, openedSources)) continue;
    if (!String(keyword.directAnswer || "").trim()) continue;
    if (!Array.isArray(keyword.uniqueValuePlan) || !keyword.uniqueValuePlan.length)
      continue;
    if (
      category.contentMode === "realtime" &&
      (![6, 24, 72, 168].includes(Number(keyword.freshnessWindowHours)) ||
        !Number.isFinite(Date.parse(keyword.sourceCheckedAt || "")))
    )
      continue;
    const usedDomains = new Set(
      keyword.verifiedClaims.map((claim: any) => urlDomain(claim.sourceUrl)),
    );
    keyword.verifiedSources = openedSources.filter((source: any) =>
      usedDomains.has(urlDomain(source?.url)),
    );
    eligible.push(keyword);
  }
  eligible.sort(
    (a, b) =>
      Number(b.scores?.sourceability || 0) -
        Number(a.scores?.sourceability || 0) ||
      Number(b.scores?.demand || 0) - Number(a.scores?.demand || 0),
  );
  const selected = eligible.slice(0, settings.keywordsPerCategory);
  if (!selected.length)
    throw new Error(
      `${category.name}: 주장 단위 사전검증을 통과한 키워드가 없습니다. 글 대기열은 만들지 않았습니다.`,
    );
  return { keywords: selected, sources: openedSources };
}

export async function createAngleStage(
  apiKey: string,
  input: {
    category: any;
    keyword: any;
    settings: PlanningSettings;
  },
) {
  const settings = normalizePlanningSettings(input.settings);
  const response = await new OpenAI({ apiKey }).responses.create({
    model: process.env.RESEARCH_MODEL || "gpt-5.6-terra",
    reasoning: { effort: "medium" },
    max_output_tokens: Math.min(
      12000,
      4000 + 1600 * settings.articlesPerKeyword,
    ),
    text: { format: { type: "json_object" } },
    input: `이미 조사와 출처 확인을 마친 키워드로 서로 중복되지 않는 글 방향 ${settings.articlesPerKeyword}개를 만든다. 웹 검색은 다시 하지 않고 제공된 근거만 사용한다.

카테고리: ${JSON.stringify(input.category)}
키워드: ${JSON.stringify(input.keyword)}

각 글은 독자 상황·검색 질문·답변 약속·구성·고유 가치가 실제로 달라야 한다. 제목만 바꾼 중복 글을 만들지 않는다. realtime이면 확인 기준일·다음 일정·공식 재확인 경로를 mustCover에 포함하고 루머나 추측을 제외한다. eventDate가 현재보다 뒤이거나 행사가 진행 중이면 확정되지 않은 수상작·우승·최종 결과를 약속하지 말고 일정·후보·현재까지의 결과로 제목과 답변 약속을 바꾼다. 근거로 답할 수 없는 방향은 만들지 않는다.

각 글 방향의 mustCover는 verifiedClaims로 실제 답할 수 있는 내용만 선택한다. evidenceCoverage에는 mustCover 문구를 그대로 반복하고 이를 뒷받침하는 claimIds를 연결한다. 연결할 수 없는 방향은 출력하지 않는다.

JSON만 출력한다: {"angles":[{"titleIdea":"과장 없는 제목 방향","purpose":"다른 글과의 차별화","searchQuestion":"독자의 구체적 질문","readerSituation":"이 답이 필요한 상황","answerPromise":"읽고 나면 할 수 있는 판단 또는 행동","mustCover":["필수 답 1","필수 답 2","필수 답 3"],"evidenceCoverage":[{"requirement":"필수 답 1","claimIds":["C1"]}],"exclusions":["다루지 않을 범위"],"uniqueValue":"기준표·계산·절차·예외 등 고유 가치"}]}`,
  });
  let candidates: any[] = [];
  try {
    const value = parseJson<any>(response.output_text);
    candidates = Array.isArray(value)
      ? value
      : Array.isArray(value?.angles)
        ? value.angles
        : [];
  } catch {
    candidates = [];
  }

  const keyword = String(input.keyword.keyword || "검색 주제").trim();
  const fallbackAngles = [
    {
      suffix: "핵심 일정·조건과 공식 확인 방법",
      purpose: "현재 기준 핵심 일정과 적용 조건을 빠르게 확인하게 한다.",
      question: `${keyword}의 정확한 일정과 적용 조건은 무엇인가?`,
      situation: "검색 직후 일정과 자격·적용 조건을 확인하려는 독자",
      promise: "공식 자료를 기준으로 일정·조건·확인 경로를 구분할 수 있다.",
      mustCover: ["기준일과 핵심 일정", "대상과 적용 조건", "공식 재확인 경로"],
      value: "일정·조건·공식 링크를 한눈에 보는 요약표",
    },
    {
      suffix: "신청·이용 순서와 실패할 때 대처법",
      purpose: "실행 순서와 막히는 지점의 해결 방법을 단계별로 안내한다.",
      question: `${keyword}는 어떤 순서로 진행하고 실패하면 어떻게 대처해야 하나?`,
      situation: "직접 신청하거나 서비스를 이용하려는 독자",
      promise:
        "준비부터 완료 확인까지 순서대로 실행하고 오류에 대처할 수 있다.",
      mustCover: [
        "사전 준비사항",
        "단계별 실행 순서",
        "실패·지연 시 대처 방법",
      ],
      value: "실행 체크리스트와 오류별 대처표",
    },
    {
      suffix: "대상별 예외·주의사항 체크리스트",
      purpose: "일반 안내에서 놓치기 쉬운 대상별 예외와 주의사항을 정리한다.",
      question: `${keyword}에서 내 상황에 따라 달라지는 예외와 주의점은 무엇인가?`,
      situation:
        "기본 안내는 확인했지만 자신의 상황에 적용되는지 판단하려는 독자",
      promise: "대상별 예외를 확인하고 잘못된 신청이나 판단을 피할 수 있다.",
      mustCover: ["대상별 차이", "적용되지 않는 경우", "실수하기 쉬운 항목"],
      value: "대상별 예외와 주의사항 비교표",
    },
    {
      suffix: "선택지 비교와 상황별 판단 기준",
      purpose: "가능한 선택지를 같은 기준으로 비교해 상황별 결정을 돕는다.",
      question: `${keyword}와 관련된 선택지 중 내 상황에는 무엇이 적합한가?`,
      situation: "둘 이상의 방법이나 조건을 비교하는 독자",
      promise: "비용·시간·조건·위험을 기준으로 적합한 선택지를 고를 수 있다.",
      mustCover: ["선택지별 조건", "비용·시간 비교", "상황별 추천 기준"],
      value: "동일 기준으로 정리한 선택지 비교표",
    },
    {
      suffix: "변경사항 재확인 시점과 자주 묻는 질문",
      purpose: "정보가 바뀔 수 있는 시점과 반복 질문을 공식 근거로 정리한다.",
      question: `${keyword} 정보는 언제 다시 확인해야 하고 무엇이 자주 바뀌는가?`,
      situation: "이전에 본 정보가 현재도 유효한지 확인하려는 독자",
      promise:
        "변경 가능 항목과 재확인 시점을 알고 최신 정보를 확인할 수 있다.",
      mustCover: ["변경 가능 항목", "재확인할 시점", "공식 문의·확인 경로"],
      value: "변경 감시 항목과 FAQ 체크리스트",
    },
  ];
  const names = new Set<string>();
  const angles: any[] = [];
  const verifiedClaims = Array.isArray(input.keyword.verifiedClaims)
    ? input.keyword.verifiedClaims
    : [];
  const verifiedClaimIds = new Set(
    verifiedClaims.map((claim: any) => String(claim.id)),
  );
  for (const candidate of candidates) {
    if (angles.length >= settings.articlesPerKeyword) break;
    const name = normalized(candidate?.titleIdea || "");
    if (!name || names.has(name)) continue;
    names.add(name);
    const fallback = fallbackAngles[angles.length];
    const mustCover = Array.isArray(candidate.mustCover)
      ? candidate.mustCover.map(String).filter(Boolean).slice(0, 8)
      : [];
    for (const item of fallback.mustCover)
      if (mustCover.length < 3 && !mustCover.includes(item))
        mustCover.push(item);
    const rawCoverage = Array.isArray(candidate.evidenceCoverage)
      ? candidate.evidenceCoverage
      : [];
    const coverage = mustCover.map((requirement: string) => {
      const item = rawCoverage.find(
        (entry: any) => normalized(entry?.requirement || "") === normalized(requirement),
      );
      const claimIds = Array.isArray(item?.claimIds)
        ? item.claimIds.map(String).filter((id: string) => verifiedClaimIds.has(id))
        : [];
      return { requirement, supported: claimIds.length > 0, claimIds, gap: claimIds.length ? "없음" : "근거 연결 없음" };
    });
    if (coverage.some((item: any) => !item.supported)) continue;
    angles.push({
      titleIdea: String(candidate.titleIdea).trim(),
      purpose: String(candidate.purpose || fallback.purpose).trim(),
      searchQuestion: String(
        candidate.searchQuestion || fallback.question,
      ).trim(),
      readerSituation: String(
        candidate.readerSituation || fallback.situation,
      ).trim(),
      answerPromise: String(candidate.answerPromise || fallback.promise).trim(),
      mustCover,
      evidenceCoverage: coverage,
      exclusions: Array.isArray(candidate.exclusions)
        ? candidate.exclusions.map(String).filter(Boolean).slice(0, 8)
        : ["공식 근거로 확인되지 않은 추측과 개인 경험 일반화"],
      uniqueValue: String(candidate.uniqueValue || fallback.value).trim(),
      prevalidatedDossier: {
        checkedAt: input.keyword.sourceCheckedAt || new Date().toISOString(),
        readerNeed: String(candidate.searchQuestion || fallback.question).trim(),
        directAnswer: String(input.keyword.directAnswer).trim(),
        scope: `${input.category.name} · ${input.keyword.keyword}`,
        claims: verifiedClaims,
        conflicts: [],
        unknowns: [],
        coverage,
        practicalSteps: Array.isArray(input.keyword.practicalSteps) ? input.keyword.practicalSteps : [],
        uniqueValuePlan: Array.isArray(input.keyword.uniqueValuePlan) ? input.keyword.uniqueValuePlan : [String(candidate.uniqueValue || fallback.value)],
      },
      prevalidatedSources: input.keyword.verifiedSources || [],
    });
  }
  for (const fallback of fallbackAngles) {
    if (angles.length >= settings.articlesPerKeyword) break;
    if (verifiedClaims.length < 3) break;
    let titleIdea = `${keyword}: ${fallback.suffix}`;
    if (names.has(normalized(titleIdea)))
      titleIdea = `${titleIdea} ${angles.length + 1}`;
    names.add(normalized(titleIdea));
    const mustCover = verifiedClaims.slice(0, 3).map((claim: any) => claim.statement);
    const coverage = mustCover.map((requirement: string, index: number) => ({
      requirement,
      supported: true,
      claimIds: [String(verifiedClaims[index].id)],
      gap: "없음",
    }));
    angles.push({
      titleIdea,
      purpose: fallback.purpose,
      searchQuestion: fallback.question,
      readerSituation: fallback.situation,
      answerPromise: fallback.promise,
      mustCover,
      evidenceCoverage: coverage,
      exclusions: ["공식 근거로 확인되지 않은 추측과 개인 경험 일반화"],
      uniqueValue: fallback.value,
      prevalidatedDossier: {
        checkedAt: input.keyword.sourceCheckedAt || new Date().toISOString(),
        readerNeed: fallback.question,
        directAnswer: String(input.keyword.directAnswer).trim(),
        scope: `${input.category.name} · ${input.keyword.keyword}`,
        claims: verifiedClaims,
        conflicts: [],
        unknowns: [],
        coverage,
        practicalSteps: Array.isArray(input.keyword.practicalSteps) ? input.keyword.practicalSteps : [],
        uniqueValuePlan: Array.isArray(input.keyword.uniqueValuePlan) ? input.keyword.uniqueValuePlan : [fallback.value],
      },
      prevalidatedSources: input.keyword.verifiedSources || [],
    });
  }
  return {
    angles: angles.slice(0, settings.articlesPerKeyword),
    adjusted: candidates.length !== settings.articlesPerKeyword,
  };
}

export function finalizeStagedPlan(draft: any, settings: PlanningSettings) {
  const normalizedSettings = normalizePlanningSettings(settings);
  return validatePlan(
    curatePlan(draft, normalizedSettings),
    normalizedSettings,
  );
}

export async function createWeeklyPlanStaged(
  apiKey: string,
  context: {
    categoryPortfolio?: string[];
    recentKeywords?: string[];
    recentContent?: any[];
    settings?: PlanningSettings;
    performanceGuidance?: any[];
    strategyGuidance?: any;
  } = {},
  onSearchComplete?: (snapshot: {
    capturedAt: string;
    settings: PlanningSettings;
    rawResponse: string;
    sources: any[];
  }) => Promise<void>,
) {
  const settings = normalizePlanningSettings(context.settings);
  const categoryResult = await createCategoryStage(apiKey, {
    ...context,
    settings,
  });
  const draft = categoryResult.draft;
  let sources = categoryResult.sources || [];
  for (const category of draft.categories) {
    const keywordResult = await createKeywordStage(apiKey, {
      category,
      settings,
      recentKeywords: context.recentKeywords,
      recentContent: context.recentContent,
    });
    category.keywords = keywordResult.keywords;
    sources = [
      ...new Map(
        [...sources, ...(keywordResult.sources || [])]
          .filter((source: any) => source?.url)
          .map((source: any) => [source.url, source]),
      ).values(),
    ];
    for (const keyword of category.keywords) {
      const angleResult = await createAngleStage(apiKey, {
        category,
        keyword,
        settings,
      });
      keyword.angles = angleResult.angles;
    }
  }
  if (onSearchComplete)
    await onSearchComplete({
      capturedAt: new Date().toISOString(),
      settings,
      rawResponse: JSON.stringify(draft),
      sources,
    });
  return { plan: finalizeStagedPlan(draft, settings), sources };
}

export async function createWeeklyPlan(
  apiKey: string,
  context: {
    categoryPortfolio?: string[];
    recentKeywords?: string[];
    recentContent?: any[];
    settings?: PlanningSettings;
    performanceGuidance?: any[];
    strategyGuidance?: any;
  } = {},
  onSearchComplete?: (snapshot: {
    capturedAt: string;
    settings: PlanningSettings;
    rawResponse: string;
    sources: any[];
  }) => Promise<void>,
) {
  const client = new OpenAI({ apiKey });
  const settings = normalizePlanningSettings(context.settings);
  const totalArticles =
    settings.categoryCount *
    settings.keywordsPerCategory *
    settings.articlesPerKeyword;
  const realtimeTarget = Math.min(
    settings.categoryCount,
    Math.max(1, Math.ceil(settings.categoryCount * 0.4)),
  );
  const activePortfolio = (context.categoryPortfolio || []).slice(
    0,
    settings.categoryCount,
  );
  const newCategorySlots = Math.min(
    settings.categoryCount,
    Math.max(realtimeTarget, settings.categoryCount - activePortfolio.length),
  );
  const portfolioRule = activePortfolio.length
    ? `\n9. 운영 중인 블로그 카테고리는 ${JSON.stringify(activePortfolio)}다. 품질 기준을 통과한 기존 카테고리를 우선 검토하고 이름을 바꾸지 않는다. 각 기존 블로그의 독자·핵심 목적과 맞지 않는 유행 키워드를 억지로 넣지 않는다. 실시간 관심 트랙이 기존 포트폴리오에 없다면 장기형 기존 카테고리 일부를 이번 주 계획에서 쉬게 하고 신규 실시간 카테고리를 포함할 수 있다. 신규 카테고리는 최대 ${newCategorySlots}개까지만 추가한다. 신규 카테고리마다 별도 Blogger를 권하지 말고 독자 목적이 비슷한 기존 카테고리 또는 신규 카테고리 2~4개와 하나의 주제군으로 묶는다. 기존 카테고리도 정책 위험 또는 근거 부족이면 이번 주 수량이 줄더라도 제외한다.`
    : "\n9. 아직 운영 카테고리 포트폴리오가 없으므로 이번에는 시장 신호를 바탕으로 새 카테고리를 발굴한다. 이후 사용자가 각 카테고리를 Blogger 블로그에 매핑해야 자동 임시저장이 가능하다.";
  const historyRule = context.recentKeywords?.length
    ? `\n최근 사용 키워드(동일 의도의 반복·자기잠식 금지): ${JSON.stringify(context.recentKeywords.slice(0, 80))}\n최근 콘텐츠 인벤토리(같은 질문을 다시 만들지 말고, 기존 글에서 빠진 하위 질문·후속 단계만 확장): ${JSON.stringify((context.recentContent || []).slice(0, 120)).slice(0, 9000)}`
    : "";
  const performanceRule = context.performanceGuidance?.length
    ? `\n10. 아래 Search Console 성과 학습은 다음 기획의 참고 신호로 사용한다. 표본·신뢰도를 존중하고, 과거 성과만 좇아 새 수요를 배제하거나 잘된 글을 복제하지 않는다. 데이터에 없는 인과관계는 만들지 않는다.\n성과 학습: ${JSON.stringify(context.performanceGuidance).slice(0, 18000)}`
    : "\n10. 아직 충분한 Search Console 성과 학습이 없으므로 시장 조사 근거만으로 계획한다.";
  const strategyRule = context.strategyGuidance
    ? `\n11. 아래 수익 사령탑 지시를 카테고리·글 배분의 참고 기준으로 반영한다. 단, 목표 수익 때문에 근거 없는 검색량·수익을 만들거나 품질·정책 안전성을 낮춰서는 안 된다. 중단 기준과 정책 경고는 반드시 지킨다.\n수익 사령탑: ${JSON.stringify(context.strategyGuidance).slice(0, 16000)}`
    : "\n11. 아직 수익 사령탑 데이터가 없으므로 70% 검증 주제·20% 인접 확장·10% 신규 실험을 기본 배분으로 삼되 근거가 약하면 억지로 채우지 않는다.";
  const response = await client.responses.create({
    model: process.env.RESEARCH_MODEL || "gpt-5.6-terra",
    tools: [{ type: "web_search" }],
    include: ["web_search_call.action.sources" as any],
    reasoning: { effort: "high" },
    max_output_tokens: 24000,
    input: `오늘 기준 한국의 공개 검색 관심 신호를 조사해 다음 1주 Google Blogger 편집 계획을 만든다. 사용자의 검색 기록, 대화 취향, 개인정보는 절대 사용하지 않는다.

[조사 한계와 판정 규칙]
1. Google Trends, 검색 자동완성·관련 검색어, 최근 보도량, 커뮤니티 반복 질문, 공공·사업자 자료처럼 공개적으로 확인 가능한 신호를 교차 확인한다.
2. 자동완성 순서는 정확한 검색량 순위가 아니며, 절대 검색량을 제공하지 않는다. 확인할 수 없는 검색량·CPC·경쟁률 숫자를 만들지 않는다.
3. 최근 상승은 가능하면 서로 독립적인 신호 2개 이상 또는 권위 있는 추세 자료 1개로 확인한다. 근거가 약하거나 서로 충돌하면 trend와 confidence를 각각 '판단보류', '낮음'으로 쓴다.
4. 콘텐츠를 evergreen(장기 검색형)과 realtime(실시간 관심형)으로 분리한다. evergreen은 3개월 이상 반복 검색될 문제를 우선한다. realtime은 1시간~7일 안에 관심이 집중되는 사건·방송·공연·영화·음악·스포츠 일정·경기 결과·기록·공식 발표도 적극 포함하며, 짧게 유효하다는 이유만으로 제외하지 않는다.
5. 건강·의료, 법률, 대출·투자 추천, 선거·정치 선동 등 고위험 YMYL, 연예인 사생활·확인되지 않은 열애설·루머, 피해자 신상·잔혹 묘사·사건 자극화, 성인·도박·불법, 혐오·충격 소재, 저작권 침해 유도는 제외한다. 연예는 공식 발표·작품·방송·공연·차트·수상 정보, 스포츠는 공식 일정·결과·기록·규정·선수 또는 구단의 공개 발표, 사건은 독자의 생활에 영향을 주는 공공기관 발표·교통·안전·서비스 변경·후속 절차처럼 검증 가능한 정보만 다룬다.
6. 새 블로그가 답할 수 있을 만큼 구체적이고, 1차 자료가 있으며, 독자가 실제 행동으로 옮길 수 있는 정보형·문제해결형 키워드를 우선한다. 단순 인기 대형 키워드만 선택하지 않는다.
7. 카테고리는 서로 충분히 달라야 하고 각각 별도 전문 블로그로 최소 6개월 운영 가능한 범위여야 한다. 각 블로그는 한 문장으로 설명되는 특정 독자와 문제 영역을 유지한다. 특정 브랜드에 과도하게 종속되거나 광고만을 위한 얕은 주제를 피한다.
8. 설정 수량은 반드시 채워야 하는 할당량이 아니라 최대치다. 품질 기준을 통과한 항목만 최대 ${settings.categoryCount}개 카테고리, 각 최대 ${settings.keywordsPerCategory}개 키워드로 제안한다. 한 키워드의 글 ${settings.articlesPerKeyword}개는 검색 의도·독자 상황·구성이 실제로 달라야 하며 제목만 바꾼 중복 글이면 안 된다.
8-1. 자동화만으로 독창적 가치를 만들기 어려운 단순 정의·요약·목록형 주제, 실제 사용·방문·전문 자격이 있어야 신뢰할 수 있는 리뷰형 주제는 제외한다. 대신 여러 1차 자료를 비교해 독자가 판단할 수 있는 기준표·계산·절차·예외·체크리스트를 만들 수 있는 주제를 우선한다.
8-2. 요청 수량의 최소 2배 후보를 내부적으로 먼저 조사한 뒤 결과 JSON에는 최종 선정 항목만 넣는다. 한 후보의 출처가 부족하면 즉시 버리기 전에 검색 질문을 더 구체적으로 좁히거나 실행형·비교형 각도로 바꾸고, 그래도 근거를 확보하지 못한 경우에만 다음 후보로 대체한다.
8-3. 최종 선정하는 각 키워드는 서로 다른 도메인의 실제 원문 URL을 최소 2개 확보해야 한다. 가능하면 그중 하나는 공식기관·법령·통계·제조사 문서 같은 1차 자료여야 한다. 이 URL은 글 작성 단계의 보강 검색에 그대로 전달되므로 검색결과 페이지나 존재를 추정한 주소를 넣지 않는다.
8-4. 전체 카테고리 중 약 40%, 최소 ${realtimeTarget}개는 realtime으로 우선 제안한다. 카테고리 수가 1개여도 검증 가능한 실시간 관심 카테고리 1개를 먼저 검토한다. realtime 후보가 안전성·출처 기준을 통과하지 못할 때만 실제 선정 수가 줄어들 수 있으며, 빈자리를 근거 약한 루머로 채우지 않는다.
8-5. realtime 글은 freshnessWindowHours를 6·24·72·168 중 하나로 지정하고, eventDate와 sourceCheckedAt을 명시한다. 실시간 카테고리와 글 작업은 대기열 앞쪽에 배치한다. 결과·일정·순위처럼 바뀔 수 있는 사실은 제목과 본문에서 확인 시각 또는 기준일을 명확히 적도록 브리프에 포함한다.
8-6. 행사·경기·시상식의 종료 여부를 공식 일정으로 먼저 확인한다. 아직 종료되지 않았다면 수상작·우승·최종 결과·최종 순위처럼 확정되지 않은 미래 사실을 전제한 키워드와 제목을 만들지 말고, 일정·후보·현재 순위·관전 포인트·확인 방법으로 자동 전환한다. 진행 중인 대회는 반드시 '현재 순위(기준 시각)'로 표현한다.
${portfolioRule}
${historyRule}
${performanceRule}
${strategyRule}

[선정 방식]
각 카테고리를 demand(공개 관심), momentum(최근 변화), durability(지속성), accessibility(신규 블로그 공략 가능성), adSafety(광고·정책 안전성), sourceability(신뢰 출처 확보)를 0~100으로 보수적으로 평가한다. evergreen은 지속성, realtime은 수요·상승세·출처 확보에 더 높은 가중치를 둔다. 키워드는 demand, momentum, durability, competitionOpportunity(대형 사이트가 놓친 구체적 질문), sourceability, uniqueValue(단순 재요약을 넘어설 여지), topicalFit(해당 블로그 핵심 주제 적합도)을 평가한다. priorityScore는 참고값이며 서버가 트랙별 가중치로 다시 계산한다. 근거 링크는 실제 조사에 사용한 URL만 포함한다.

내부 조사에서는 카테고리와 키워드 후보를 요청량의 최소 2배 검토하되, 결과에는 최대 ${settings.categoryCount}개 카테고리, 카테고리별 최대 ${settings.keywordsPerCategory}개 키워드, 키워드별 서로 다른 글 방향 ${settings.articlesPerKeyword}개만 넣는다. 최대 ${totalArticles}개 작업을 우선순위대로 배열하고, 근거 부족 후보는 질문 범위를 보정하거나 다음 후보로 대체한 뒤에도 기준 미달인 경우에만 개수를 줄인다. 하루 ${settings.dailyArticleLimit}개씩 처리하며 7일을 넘는 작업은 다음 날짜로 자연스럽게 이어진다.

카테고리마다 별도 Blogger를 만들지 않는다. 독자 목적이 비슷한 카테고리를 3~4개씩 같은 blogGroupId로 묶고, 전체 수량상 불가피할 때만 2개 묶음을 허용한다. 같은 묶음에는 '오늘의 똑똑이', '알쓸 똑똑이'처럼 특정 주제에 종속되지 않는 동일한 한국어 브랜드 이름·한 줄 소개·영문 소문자·숫자·하이픈만 사용한 blogspot 주소 후보 3개를 제안한다. 서로 완전히 무관한 주제는 억지로 묶지 않으며 주소 사용 가능 여부는 확인했다고 주장하지 않는다.

JSON만 출력한다:
{"weekLabel":"YYYY-MM-DD 시작 주간","marketSummary":"조사 결과와 한계 요약","methodNote":"검색량 추정이 아닌 공개 관심 신호 기반임을 설명","categories":[{"name":"카테고리","contentMode":"evergreen|realtime","audience":"이 블로그의 특정 독자","sitePurpose":"이 블로그가 반복해서 해결할 문제","suggestedBlogName":"추천 블로그 이름","suggestedBlogDescription":"한 줄 소개","suggestedBlogAddresses":["address-one","address-two","address-three"],"reason":"선정 근거","trend":"상승|보합|판단보류","confidence":"높음|중간|낮음","priorityScore":0,"scores":{"demand":0,"momentum":0,"durability":0,"accessibility":0,"adSafety":0,"sourceability":0},"evidence":[{"signal":"관찰한 신호","period":"1시간|24시간|7일|30일|12개월","url":"https://..."}],"keywords":[{"keyword":"구체적 검색어","contentMode":"evergreen|realtime","freshnessWindowHours":168,"eventDate":"YYYY-MM-DD 또는 해당 없음","sourceCheckedAt":"ISO-8601 시각","intent":"정보형|비교형|문제해결형|구매형","clusterRole":"기둥글|하위질문|비교|실행|문제해결","trend":"상승|보합|판단보류","confidence":"높음|중간|낮음","priorityScore":0,"scores":{"demand":0,"momentum":0,"durability":0,"competitionOpportunity":0,"sourceability":0,"uniqueValue":0,"topicalFit":0},"reason":"근거와 한계","evidence":[{"signal":"관찰한 신호","period":"1시간|24시간|7일|30일|12개월","url":"https://..."}],"angles":[{"titleIdea":"과장 없는 제목 방향","purpose":"다른 글과의 차별화","searchQuestion":"독자가 검색창에 가진 구체적 질문","readerSituation":"이 답이 필요한 독자 상황","answerPromise":"읽고 나면 할 수 있는 판단 또는 행동","mustCover":["필수 답 1","필수 답 2","필수 답 3"],"exclusions":["이 글에서 다루지 않을 범위"],"uniqueValue":"출처를 재요약하는 데 그치지 않고 제공할 기준표·계산·절차·예외"}]}]}]}`,
  });
  const sources = extractCitations(response);
  await onSearchComplete?.({
    capturedAt: new Date().toISOString(),
    settings,
    rawResponse: response.output_text,
    sources,
  });
  const plan = parseWeeklyPlan(response.output_text, settings);
  return { plan, sources };
}

export function parseWeeklyPlan(
  rawResponse: string,
  settings: PlanningSettings,
) {
  const parsed = parseJson<any>(rawResponse);
  if (Array.isArray(parsed?.categories)) assignSharedBlogGroups(parsed.categories);
  return validatePlan(
    curatePlan(parsed, settings),
    settings,
  );
}
