import { readFileSync } from "node:fs";
import { jsonrepair } from "jsonrepair";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hasWebSearchJsonModeConflict = (source) =>
  [...source.matchAll(/responses\.create\(\{([\s\S]*?)\n\s*\}\);/g)].some(
    ([, call]) =>
      call.includes('tools: [{ type: "web_search" }]') &&
      (call.includes('text: { format: { type: "json_object" } }') ||
        call.includes('type: "json_schema"')),
  );
const files = {
  models: read("lib/models.ts"),
  openai: read("lib/openai.ts"),
  editorial: read("lib/editorial.ts"),
  weekly: read("app/api/weekly-plan/route.ts"),
  produce: read("lib/production.ts"),
  produceApi: read("app/api/produce/route.ts"),
  compare: read("app/api/compare/route.ts"),
  publish: read("app/api/publish/route.ts"),
  page: read("app/page.tsx"),
  planning: read("lib/planning.ts"),
  store: read("lib/store.ts"),
  weeklyCron: read("app/api/cron/weekly/route.ts"),
  dailyCron: read("app/api/cron/daily/route.ts"),
  vercel: read("vercel.json"),
  blogs: read("app/api/blogs/route.ts"),
  styles: read("app/styles.css"),
  performance: read("lib/performance.ts"),
  performanceApi: read("app/api/performance/route.ts"),
  performanceCron: read("app/api/cron/performance/route.ts"),
  googleAuth: read("app/api/auth/google/route.ts"),
  strategy: read("lib/strategy.ts"),
  strategyApi: read("app/api/strategy/route.ts"),
  strategyCron: read("app/api/cron/strategy/route.ts"),
  session: read("lib/session.ts"),
  middleware: read("middleware.ts"),
  google: read("lib/google.ts"),
  googleCallback: read("app/api/auth/google/callback/route.ts"),
  localState: read("lib/local-state.ts"),
  localWorkspace: read("app/api/local-workspace/route.ts"),
  settingsApi: read("app/api/settings/route.ts"),
  categoriesApi: read("app/api/categories/route.ts"),
  researchApi: read("app/api/research/route.ts"),
  writeApi: read("app/api/write/route.ts"),
  preflight: read("app/api/preflight/route.ts"),
  errorPage: read("app/error.tsx"),
  planCache: read("app/api/weekly-plan/cache/route.ts"),
  package: read("package.json"),
};

let malformedJsonRepairWorks = false;
try {
  const repaired = JSON.parse(
    jsonrepair('{"categories":[{"name":"생활" "keywords":[]}]}'),
  );
  malformedJsonRepairWorks = repaired.categories[0].name === "생활";
} catch {}

const checks = [
  [
    "GPT·Claude·Gemini 모델",
    ["gpt-5.6-terra", "claude-sonnet-5", "gemini-3.1-pro-preview"].every((x) =>
      files.models.includes(x),
    ),
  ],
  [
    "작성·검수 모델 분리",
    files.page.includes("writerModel") && files.page.includes("reviewerModel"),
  ],
  [
    "카테고리 수 변경",
    files.planning.includes("settings.categoryCount") &&
      files.page.includes("categoryCount"),
  ],
  [
    "키워드 수 변경",
    files.planning.includes("settings.keywordsPerCategory") &&
      files.page.includes("keywordsPerCategory"),
  ],
  [
    "키워드별 글 수 변경",
    files.planning.includes("settings.articlesPerKeyword") &&
      files.page.includes("articlesPerKeyword"),
  ],
  ["사실 근거 검색", files.produce.includes('tools: [{ type: "web_search" }]')],
  [
    "웹 검색·JSON 모드 충돌 방지",
    [files.planning, files.produce, files.performance].every(
      (source) =>
        source.includes('tools: [{ type: "web_search" }]') &&
        !hasWebSearchJsonModeConflict(source),
    ) &&
      files.planning.includes("parseWeeklyPlan(response.output_text") &&
      files.produce.includes("parseJson<ResearchDossier>") &&
      files.performance.includes("parseJson<any>(response.output_text)"),
  ],
  [
    "긴 웹 검색 JSON 구문 자동 복구",
    files.models.includes('from "jsonrepair"') &&
      files.models.includes("JSON.parse(jsonrepair(candidate))") &&
      files.planning.includes("max_output_tokens: 24000") &&
      malformedJsonRepairWorks,
  ],
  [
    "업데이트 독립 계획·검색 원본 보관",
    files.localState.includes("LOCALAPPDATA") &&
      files.localState.includes("planningSearch") &&
      files.weekly.includes("saveLocalPlanningSearch") &&
      files.weekly.includes("savePlanningSearchSnapshot") &&
      files.planCache.includes("parseWeeklyPlan") &&
      files.page.includes("저장된 조사 결과 불러오기") &&
      files.localWorkspace.includes("saveLocalWorkspace"),
  ],
  [
    "로컬 URL·Google OAuth 포트 고정",
    files.package.includes("next dev --port 3000") &&
      files.package.includes("next start --port 3000") &&
      files.google.includes("http://localhost:3000/api/auth/google/callback"),
  ],
  [
    "로컬 이전 계획을 다음 조사에 반영",
    files.page.includes("recentContent") &&
      files.page.includes("recentKeywords") &&
      files.weekly.includes("browserHistory(requested.history)"),
  ],
  [
    "허위 경험 금지",
    files.editorial.includes("경험") &&
      files.produce.includes("직접 확인할 수 없는 체험담") &&
      files.planning.includes("실제 사용·방문·전문 자격"),
  ],
  [
    "다양한 글 구조",
    files.editorial.includes("STRUCTURES") &&
      files.produce.includes("pickStructure"),
  ],
  [
    "기존 글 중복 검사",
    files.produce.includes("similarity") && files.produce.includes("0.4"),
  ],
  [
    "별도 검수 및 점수 기준",
    files.produce.includes("REVIEW_SYSTEM") &&
      files.produce.includes("overallScore >= 88") &&
      files.produce.includes("evidenceScore >= 95") &&
      files.produce.includes("originalValueScore >= 85"),
  ],
  [
    "4전략 제목 후보와 선택 근거",
    files.produce.includes("titleCandidates.length !== 4") &&
      files.produce.includes("direct_answer") &&
      files.produce.includes("titleSelectionReason"),
  ],
  [
    "제목 기술 하드 게이트",
    files.editorial.includes("sanitizeArticleTitle") &&
      files.editorial.includes("12~70자") &&
      files.produce.includes("titleSimilarity >= 0.62"),
  ],
  [
    "제목 5축 독립 평가",
    [
      "queryMatch",
      "specificity",
      "accuracy",
      "distinctiveness",
      "concision",
    ].every((field) => files.produce.includes(field)),
  ],
  [
    "본문 구조 기술 진단",
    files.produce.includes("analyzeContentCraft") &&
      files.produce.includes("longParagraphCount") &&
      files.produce.includes("genericHeadingPattern") &&
      files.produce.includes("firstAnswerLength"),
  ],
  [
    "수동 수정 공개 게이트",
    files.publish.includes("validatePublishContent") &&
      files.publish.includes("currentDraft") &&
      files.page.includes("수정 전 원고 기준"),
  ],
  [
    "수량보다 품질 우선",
    files.planning.includes("settings.categoryCount") &&
      files.planning.includes("품질 기준을 통과한 주제가 없습니다") &&
      files.planning.includes("qualityGate"),
  ],
  [
    "장기형·실시간형 이중 트랙",
    files.planning.includes('contentMode":"evergreen|realtime') &&
      files.planning.includes("realtimeTarget") &&
      files.planning.includes("settings.categoryCount * 0.4"),
  ],
  [
    "사건·연예·스포츠 실시간 후보 포함",
    [
      "사건·방송·공연·영화·음악·스포츠",
      "공식 일정·결과·기록·규정",
      "연예인 사생활·확인되지 않은 열애설·루머",
    ].every((text) => files.planning.includes(text)),
  ],
  [
    "실시간 글 우선 처리와 공개 전 재확인",
    files.planning.includes("실시간 카테고리와 글 작업은 대기열 앞쪽") &&
      files.publish.includes("REALTIME_REFRESH_REQUIRED") &&
      files.page.includes("실시간 정보 다시 확인·재작성"),
  ],
  [
    "서버 기회점수 재계산",
    files.planning.includes("weightedScore") &&
      files.planning.includes("competitionOpportunity") &&
      files.planning.includes("topicalFit"),
  ],
  [
    "상세 글 브리프",
    [
      "searchQuestion",
      "readerSituation",
      "answerPromise",
      "mustCover",
      "uniqueValue",
    ].every((field) => files.planning.includes(field)),
  ],
  [
    "작성 전 주장 단위 근거 사전검증",
    files.planning.includes("validPreflightClaims") &&
      files.planning.includes("verifiedClaims") &&
      files.planning.includes("evidenceCoverage") &&
      files.planning.includes("prevalidatedDossier") &&
      files.produce.includes("prevalidatedDossier") &&
      files.produce.includes("stillFresh"),
  ],
  [
    "주장-출처 연결 조사 문서",
    files.produce.includes("validateResearchDossier") &&
      files.produce.includes("authoritative_secondary") &&
      files.openai.includes("web_search_call") &&
      files.produce.includes("web_search_call.action.sources"),
  ],
  [
    "단순 요약 방지 독자 가치",
    files.produce.includes("valueAdd") &&
      files.editorial.includes("고유한 결과물") &&
      files.page.includes("추가 독자 가치"),
  ],
  [
    "최종 독립 웹 근거 감사",
    files.produce.includes("auditFinalEvidence") &&
      files.produce.includes("unsupportedClaims") &&
      files.produce.includes("freshnessIssues") &&
      files.page.includes("최종 웹 근거 감사"),
  ],
  ["검수 실패 자동 재작성", files.produce.includes("attempt < 3")],
  [
    "출처 부족 3단계 자동 보강",
    files.produce.includes("researchArticleEvidence") &&
      files.produce.includes("SourceBlockedError") &&
      files.produce.includes("마지막 보강 단계"),
  ],
  [
    "근거 부족 작업 격리",
    files.produceApi.includes("SOURCE_BLOCKED") &&
      files.dailyCron.includes("source_blocked") &&
      files.page.includes("근거 보강 재시도"),
  ],
  [
    "대량 작성 개별 실패 계속 진행",
    files.page.includes(
      "개별 콘텐츠 오류는 해당 작업만 표시하고 나머지 작업을 계속했습니다",
    ) && files.page.includes("isSystemicProductionError"),
  ],
  [
    "Blogger 임시저장",
    files.publish.includes("createBloggerDraft") &&
      files.google.includes("posts.insert"),
  ],
  [
    "승인 후 공개",
    files.publish.includes("posts.publish") &&
      files.page.includes("window.confirm"),
  ],
  [
    "검증 통과 글 일일 자동공개",
    files.dailyCron.includes("publishBloggerDraft") &&
      files.dailyCron.includes("config.autoPublish") &&
      files.google.includes('status: ["draft", "live"]') &&
      files.google.includes("published_reused") === false &&
      files.page.includes("검증 통과 글 자동공개") &&
      files.vercel.includes('"schedule": "0 0 * * *"'),
  ],
  [
    "카테고리별 블로그·문체",
    files.page.includes("blogMap") && files.page.includes("styleMap"),
  ],
  [
    "주 1회 자동 조사",
    files.vercel.includes("/api/cron/weekly") &&
      files.weeklyCron.includes("createWeeklyPlan"),
  ],
  [
    "일일 작성량 변경",
    files.vercel.includes("/api/cron/daily") &&
      files.dailyCron.includes("claimDueJobs(") &&
      files.dailyCron.includes("config.dailyArticleLimit") &&
      files.dailyCron.includes("completedSlots >= config.dailyArticleLimit"),
  ],
  [
    "서버 영구 대기열",
    files.store.includes("article_jobs") &&
      files.store.includes("DATABASE_URL"),
  ],
  ["중복 실행 방지", files.store.includes("FOR UPDATE SKIP LOCKED")],
  [
    "조사 한계 반영",
    [
      "자동완성 순서는 정확한 검색량 순위가 아니며",
      "신호 2개 이상",
      "YMYL",
      "판단보류",
    ].every((x) => files.planning.includes(x)),
  ],
  [
    "남은 작업 날짜 이월",
    files.store.includes("Math.floor(ordinal / dailyLimit)") &&
      !files.store.includes("ordinal < 49"),
  ],
  [
    "블로그 이름·주소 추천",
    files.planning.includes("suggestedBlogName") &&
      files.planning.includes("suggestedBlogAddresses"),
  ],
  [
    "연관 카테고리 2~4개 공유 Blogger",
    files.planning.includes("assignSharedBlogGroups") &&
      files.planning.includes("blogGroupCategories") &&
      files.planning.includes("오늘의 똑똑이") &&
      files.page.includes("selectBlogForGroup") &&
      files.page.includes("묶음 전체를"),
  ],
  [
    "Blogger 생성 제한 안내",
    files.page.includes("블로그 자체 생성은 Blogger API에서 지원하지 않습니다"),
  ],
  [
    "운영 블로그 포트폴리오 유지",
    files.planning.includes("categoryPortfolio") &&
      files.planning.includes("운영 카테고리"),
  ],
  [
    "최근 키워드 자기잠식 방지",
    files.planning.includes("recentKeywords") &&
      files.store.includes("getRecentKeywords"),
  ],
  [
    "운영 Blogger 자동 조회",
    files.google.includes(
      "https://www.googleapis.com/blogger/v3/users/self/blogs",
    ) &&
      files.blogs.includes("listCurrentUserBlogs") &&
      !files.blogs.includes("blogs.listByUser") &&
      !files.strategy.includes("blogs.listByUser") &&
      !files.performance.includes("blogs.listByUser") &&
      files.page.includes("운영 중인 Blogger 대시보드"),
  ],
  [
    "Blogger 공식 상태값 대소문자",
    files.performance.includes('status: ["live"]') &&
      files.strategy.includes('status: ["live"]') &&
      !files.performance.includes('status: ["LIVE"]') &&
      !files.strategy.includes('status: ["LIVE"]'),
  ],
  [
    "Google 오류 단계 진단",
    files.google.includes("safeGoogleApiDiagnostic") &&
      files.blogs.includes('stage: "blogs.list"') &&
      files.googleAuth.includes("google_error"),
  ],
  [
    "브라우저 재시작 후 세션 유지",
    files.session.includes("maxAge: 60 * 60 * 24 * 30"),
  ],
  [
    "비 JSON 서버 오류 표시",
    files.page.includes("async function readApiJson") &&
      files.page.includes("서버 응답 형식이 올바르지 않습니다"),
  ],
  [
    "모델 비교 부분 실패 격리",
    files.compare.includes("successes.length < outputs.length") &&
      files.compare.includes("ok: false") &&
      files.page.includes("이 모델만 비교에 실패했습니다"),
  ],
  [
    "배열형 AI JSON 자동 복구",
    files.models.includes("export function parseJsonArray") &&
      files.categoriesApi.includes("parseJsonArray") &&
      files.researchApi.includes("parseJsonArray") &&
      files.writeApi.includes("parseJson(response.output_text)"),
  ],
  [
    "초기 설정·로컬 저장 오류 JSON 응답",
    files.settingsApi.includes("설정을 불러오지 못했습니다") &&
      files.localWorkspace.includes("현재 작업을 저장하지 못했습니다") &&
      files.page.includes("시작 준비 오류"),
  ],
  [
    "세션 쿠키 용량 초과 방지",
    files.settingsApi.includes("styleGuide === DEFAULT_STYLE_GUIDE") &&
      files.settingsApi.includes("styleGuide.length > 1200"),
  ],
  [
    "첫 글 전 무비용 전체 사전 점검",
    files.preflight.includes("readyForFirstArticle") &&
      files.preflight.includes("consumesAiCredits: false") &&
      files.preflight.includes("listCurrentUserBlogs") &&
      files.preflight.includes("invalidMappings") &&
      files.page.includes("전체 점검 실행"),
  ],
  [
    "외부 요청 시간 제한과 화면 오류 복구",
    files.google.includes("timeout: 15000") &&
      files.errorPage.includes("현재 단계 다시 시도"),
  ],
  [
    "게시글 수 집계",
    files.blogs.includes("blog.posts?.totalItems") &&
      files.strategy.includes("blog.posts?.totalItems") &&
      !files.blogs.includes("posts(totalItems)") &&
      !files.strategy.includes("posts(totalItems)") &&
      files.page.includes("전체 게시글"),
  ],
  [
    "7일·30일·누적 조회수",
    ["7DAYS", "30DAYS", "all", "SEVEN_DAYS", "THIRTY_DAYS", "ALL_TIME"].every(
      (x) => files.blogs.includes(x),
    ),
  ],
  [
    "블로그별 비교 시각화",
    files.page.includes("maxViews30Days") &&
      files.page.includes("barTrack") &&
      files.styles.includes(".metricCharts"),
  ],
  [
    "사이트별 상세 성과",
    files.page.includes("viewsPerPost30Days") &&
      files.page.includes("게시글 수 대비 30일 조회") &&
      files.page.includes("최근 업데이트"),
  ],
  [
    "미연결 카테고리 생성 추천",
    files.page.includes("unmappedCategories") &&
      files.page.includes("새 Blogger 생성 추천"),
  ],
  [
    "Search Console 읽기 권한",
    files.googleAuth.includes("webmasters.readonly") &&
      files.performance.includes("searchanalytics.query"),
  ],
  [
    "URL별 검색 성과 분석",
    ["impressions", "clicks", "ctr", "position"].every((x) =>
      files.performance.includes(x),
    ),
  ],
  [
    "표본 부족 과잉학습 방지",
    files.performance.includes("insufficient_data") &&
      files.performance.includes("minImpressions * 5"),
  ],
  [
    "저노출 글 별도 진단",
    files.performance.includes("lowExposurePages") &&
      files.performance.includes("PERFORMANCE_MIN_AGE_DAYS") &&
      files.page.includes("저노출 글 진단"),
  ],
  [
    "색인 상태 점검",
    files.performance.includes("urlInspection.index.inspect") &&
      files.performance.includes("robotsTxtState") &&
      files.performance.includes("googleCanonical"),
  ],
  [
    "저노출 개선안 다음 글 반영",
    files.performance.includes("lowExposureGuidance") &&
      files.produce.includes("performanceGuidance"),
  ],
  [
    "성과 가설·신뢰도",
    files.performance.includes("상관관계를 원인으로 단정하지 말고") &&
      files.performance.includes("confidence"),
  ],
  [
    "성과 학습 자동 반영",
    files.dailyCron.includes("getPerformanceGuidance") &&
      files.weeklyCron.includes("getPortfolioPerformanceGuidance") &&
      files.produce.includes("performanceGuidance"),
  ],
  [
    "주간 성과 학습 예약",
    files.vercel.includes("/api/cron/performance") &&
      files.performanceCron.includes("refreshPerformanceLearning"),
  ],
  [
    "성과 학습 대시보드",
    files.page.includes("조회 성과 학습") &&
      files.page.includes("지금 분석") &&
      files.styles.includes(".learningGrid"),
  ],
  [
    "AdSense 읽기 전용 연결",
    files.googleAuth.includes("adsense.readonly") &&
      files.strategy.includes("google.adsense"),
  ],
  [
    "사이트별 AdSense 수익 귀속",
    files.strategy.includes("OWNED_SITE_DOMAIN_NAME") &&
      files.strategy.includes("siteEconomics"),
  ],
  [
    "예상 운영비·순이익",
    files.store.includes("cost_events") &&
      files.strategy.includes("estimatedNetProfit") &&
      files.page.includes("사업 손익·예산 안전장치"),
  ],
  [
    "월 AI 예산 자동 중지",
    files.store.includes("getBudgetGuard") &&
      files.dailyCron.includes("monthly AI budget reached") &&
      files.page.includes("예산 초과 전 조사·작성·분석 중지"),
  ],
  [
    "AdSense 신청 준비도",
    files.strategy.includes("approvalReadiness") &&
      files.page.includes("블로그별 AdSense 신청 준비도"),
  ],
  [
    "월 수익·RPM 실제 집계",
    files.strategy.includes("ESTIMATED_EARNINGS") &&
      files.strategy.includes("PAGE_VIEWS") &&
      files.strategy.includes("estimatedEarnings / pageViews"),
  ],
  [
    "24개월 월 1억 기본 목표",
    files.store.includes("100000000") &&
      files.store.includes("revenue_goal_months") &&
      files.page.includes("수익 사령탑"),
  ],
  [
    "수익 목표 역산 시나리오",
    files.strategy.includes("TARGET_RPM_SCENARIOS") &&
      files.strategy.includes("requiredMonthlyPageViews"),
  ],
  [
    "주간 수익 전략 예약",
    files.vercel.includes("/api/cron/strategy") &&
      files.strategyCron.includes("refreshRevenueStrategy"),
  ],
  [
    "수익 전략 다음 기획 반영",
    files.planning.includes("strategyGuidance") &&
      files.weeklyCron.includes("getStrategyGuidance"),
  ],
  [
    "수익 목표 정책 안전선",
    files.strategy.includes("본인 광고 클릭") &&
      files.strategy.includes("사용자 가치 없는 대량 AI 콘텐츠"),
  ],
  [
    "AdSense 미준비 정직한 처리",
    files.strategy.includes("adsense_not_ready") &&
      files.strategy.includes("실제 RPM이 없을 때"),
  ],
  [
    "첫 글부터 승인까지 성장 단계",
    files.strategy.includes("approval-ready") &&
      files.strategy.includes("첫 게시글 공개 후 7~14주") &&
      files.page.includes("수익 성장 포트폴리오"),
  ],
  [
    "승인 후 첫 수익 계획",
    files.strategy.includes("승인 후 1~14일") &&
      files.strategy.includes("first-revenue"),
  ],
  [
    "10만·100만·1000만 수익 단계",
    ["100000", "1000000", "10000000", "50000000"].every((x) =>
      files.strategy.includes(x),
    ),
  ],
  [
    "단계별 자동 진행 판정",
    ["completed", "in_progress", "waiting", "at_risk"].every((x) =>
      files.strategy.includes(x),
    ) && files.store.includes("getStrategyProgressStats"),
  ],
  [
    "겹친 예약 실행 차단",
    files.store.includes("automation_locks") &&
      files.dailyCron.includes("acquireAutomationLock") &&
      files.weeklyCron.includes("acquireAutomationLock") &&
      files.performanceCron.includes("acquireAutomationLock") &&
      files.strategyCron.includes("acquireAutomationLock"),
  ],
  [
    "원자적 월 예산 예약",
    files.store.includes("reserveEstimatedCost") &&
      files.store.includes("FOR UPDATE") &&
      files.weeklyCron.includes("estimatedWeeklyPlanCostWon") &&
      files.performance.includes("estimatedAnalysisCostWon") &&
      files.strategyCron.includes("estimatedAnalysisCostWon"),
  ],
  [
    "재시도별 비용 기록",
    files.dailyCron.includes("article-production-attempt-") &&
      files.produceApi.includes("manual-production-"),
  ],
  [
    "공통 공급자 오류 비용 차단",
    files.dailyCron.includes("isSystemicProviderError(error)") &&
      files.dailyCron.includes('state: "circuit_breaker"') &&
      files.dailyCron.includes("releaseJobClaims"),
  ],
  [
    "전체 AI 작업 비용 설정",
    files.page.includes("estimatedWeeklyPlanCostWon") &&
      files.page.includes("estimatedAnalysisCostWon") &&
      files.performance.includes('status: "budget_paused"'),
  ],
  [
    "Blogger 상태 DB 동기화",
    files.publish.includes('state: "published"') &&
      files.publish.includes('state: "draft"') &&
      files.page.includes("jobId: task.id"),
  ],
  [
    "Blogger 중복 임시글 방지",
    files.google.includes("blogger-agent-job:") &&
      files.google.includes("reused: true"),
  ],
  [
    "HTML 허용목록 정제",
    files.editorial.includes("sanitizeArticleHtml") &&
      files.editorial.includes("ALLOWED_TAGS") &&
      files.publish.includes("sanitizeArticleHtml"),
  ],
  [
    "조사 근거 교차검증",
    files.planning.includes("evidenceDomains") &&
      files.planning.includes("서로 다른 출처 2개") &&
      files.produce.includes("citedSourceCount"),
  ],
  [
    "실제 AdSense 승인 상태",
    files.strategy.includes("accounts.sites.list") &&
      files.strategy.includes('site.state === "READY"'),
  ],
  [
    "블로그별 Search Console 준비도",
    files.strategy.includes("searchReport") &&
      files.strategy.includes("report.blogId === blog.id"),
  ],
  [
    "무인 운영 준비도",
    files.page.includes("무인 운영 준비 상태") &&
      files.store.includes("getOperationalStats"),
  ],
  [
    "운영 감사 기록",
    files.store.includes("audit_events") &&
      files.publish.includes("post_published") &&
      files.page.includes("최근 운영 기록 보기"),
  ],
  [
    "운영 비밀키 필수화",
    files.session.includes("운영 환경에는 32자 이상의 SESSION_PASSWORD") &&
      files.middleware.includes("APP_PASSWORD 설정이 필요합니다"),
  ],
  [
    "교차 출처 요청 차단",
    files.middleware.includes("허용되지 않은 요청 출처") &&
      files.middleware.includes("X-Frame-Options"),
  ],
  [
    "오래된 미완료 작업 표시",
    files.store.includes(
      "OR state IN ('waiting','working','error','ready','needs_review','source_blocked','draft')",
    ),
  ],
  [
    "브라우저 중단 작업 자동 복구",
    files.page.includes("recoverInterruptedTasks") &&
      files.page.includes("이전 실행이 브라우저 종료·새로고침으로 중단"),
  ],
  [
    "예약 실행 긴급 중지",
    files.page.includes("긴급 중지") &&
      files.performanceCron.includes("automation disabled"),
  ],
  [
    "주간 재조사 대기열 정합성",
    files.store.includes("protectedSignatures") &&
      files.store.includes("state IN ('waiting','error')") &&
      files.store.includes("jobSignature"),
  ],
  [
    "기존 Blogger 임시글 수정 반영",
    files.google.includes("updateBloggerDraft") &&
      files.publish.includes("draft_updated"),
  ],
  [
    "연결 후 검수완료 글 자동 임시저장",
    files.store.includes("claimReadyDraftJobs") &&
      files.dailyCron.includes("automatic-ready-sync"),
  ],
  [
    "자동화 모델·매핑 입력 검증",
    files.store.includes("supportedModels") &&
      files.store.includes("카테고리별 Blogger·문체 설정 형식"),
  ],
  [
    "카테고리 매핑 해제 정합성",
    files.store.includes("SET blog_id=null") &&
      files.store.includes("blogId: row.blog_id"),
  ],
  [
    "임시글 수정 버튼과 삭제 복구",
    files.page.includes("수정본 임시저장") &&
      files.publish.includes("recoveredDeletedDraft") &&
      files.publish.includes("draft_recreated"),
  ],
  [
    "모델 비교 Blogger 화면 미리보기",
    files.compare.includes("createBlogPreview") &&
      files.compare.includes("sanitizeArticleHtml") &&
      files.page.includes("BLOGGER PREVIEW") &&
      files.page.includes("HTML 원문 보기") &&
      files.styles.includes(".bloggerPostBody table"),
  ],
  [
    "주간 계획 3단계 분할 실행",
    files.weekly.includes('phase === "categories"') &&
      files.weekly.includes('phase === "keywords"') &&
      files.weekly.includes('phase === "angles"') &&
      files.weekly.includes("finalizeStagedPlan(requested.draft"),
  ],
  [
    "계획 중간 결과 브라우저·로컬 자동 저장",
    files.page.includes("blogger-agent-planning-run-v1") &&
      files.localWorkspace.includes("planningRun"),
  ],
  [
    "계획 실패 지점 재개 안내",
    files.page.includes("저장된 지점부터 계획 계속 만들기") &&
      files.page.includes("실패한 단계부터 이어집니다"),
  ],
  [
    "계획 단계별 시간 초과 진단",
    files.weekly.includes("PLANNING_STAGE_TIMEOUT") &&
      files.weekly.includes("완료된 단계는 보존"),
  ],
  [
    "예약 주간 조사 분할 실행",
    files.weeklyCron.includes("createWeeklyPlanStaged") &&
      files.weeklyCron.includes("maxDuration = 60"),
  ],
  [
    "글 방향 수량 자동 보정과 평탄한 API 응답",
    files.planning.includes("adjusted: candidates.length !==") &&
      files.planning.includes("angles.slice(0, settings.articlesPerKeyword)") &&
      files.weekly.includes("NextResponse.json({ phase, ...result })"),
  ],
  [
    "진행 계획 설정 자동 복원",
    files.page.includes(
      "local.planningRun?.settings || local.workflow || DEFAULT_WORKFLOW",
    ) && files.page.includes("setWorkflow(planningRun.settings)"),
  ],
  [
    "시작 중 진행 계획 덮어쓰기 방지",
    files.localWorkspace.includes(
      "body?.planningRun || current.workspace?.planningRun || null",
    ) && files.localWorkspace.includes("export async function DELETE()"),
  ],
  [
    "대량 작성 안전 일시정지",
    files.page.includes("새 작업 시작 일시정지") &&
      files.page.includes("현재 글 완료 후 중지 예정") &&
      files.page.includes("batchStopRequestedRef.current"),
  ],
  [
    "공통 API 오류 즉시 자동 중지",
    files.page.includes("isSystemicProductionError") &&
      files.page.includes("invalid x-api-key") &&
      files.page.includes(
        "공통 오류를 감지해 나머지 글의 실행을 자동으로 멈췄습니다",
      ),
  ],
  [
    "오류 작업 우선 재개",
    files.page.includes(
      '...candidates.filter((task) => task.state === "error")',
    ) && files.page.includes("오류 작업부터 이어서"),
  ],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} requirements passed`);
if (failed) process.exit(1);
