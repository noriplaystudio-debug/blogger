import { readFileSync } from "node:fs";
import { jsonrepair } from "jsonrepair";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const files = {
  planning: read("lib/planning.ts"),
  production: read("lib/production.ts"),
  models: read("lib/models.ts"),
  store: read("lib/store.ts"),
  google: read("lib/google.ts"),
  weekly: read("app/api/cron/weekly/route.ts"),
  weeklyWorker: read("app/api/cron/weekly-manual-worker/route.ts"),
  daily: read("app/api/cron/daily/route.ts"),
  articleWorker: read("app/api/cron/article-worker/route.ts"),
  health: read("app/api/automation/health/route.ts"),
  status: read("app/api/automation/status/route.ts"),
  vercel: read("vercel.json"),
  middleware: read("middleware.ts"),
};

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

check(
  "주간 계획 단계 분리·재개",
  files.planning.includes("createCategoryStage") &&
    files.planning.includes("createKeywordStage") &&
    files.planning.includes("createAngleStage") &&
    files.weeklyWorker.includes("saveWeeklyPlanningProgress") &&
    files.weekly.includes("getWeeklyPlanningProgress"),
);
check(
  "검색 의도 중복 통합",
  files.planning.includes("articleGroupKey") &&
    files.planning.includes("umbrellaKeyword") &&
    files.planning.includes("articleCountOverride") &&
    files.planning.includes("singleKeywordCategory"),
);
check(
  "주 49개 용량 부족 시 카테고리 보충",
  files.weekly.includes("weeklyArticleTarget") &&
    files.weekly.includes("plannedArticleCapacity") &&
    files.weeklyWorker.includes("weeklyArticleTarget") &&
    files.weeklyWorker.includes("supplementalCategory"),
);
check(
  "계획 단계 관심신호와 발행 근거 검증 분리",
  files.planning.includes("공개 관심 신호") &&
    files.production.includes("researchArticleEvidence") &&
    files.production.includes("determineEvidencePolicy"),
);
check(
  "일반 글 완화·고위험 강화 검증",
  files.production.includes('"개인 블로그 실용 검증"') &&
    files.production.includes('"고위험 정보 단일 출처 검증"') &&
    files.production.includes("standardCraftPass"),
);
check(
  "출처 단계별 검색과 단일 출처 허용",
  files.planning.includes("공공기관·공식 원문 → 관련 제품·서비스·기관 홈페이지 → 관련 공개 게시 글·기사") &&
    files.planning.includes("열어 확인한 관련 URL 1개면 충분") &&
    files.production.includes("관련 내용을 확인할 수 있는 출처 1곳이면 충분") &&
    files.production.includes('const minimumSources = 1;'),
);
check(
  "AI 호출 시간 제한",
  files.models.includes("timeout: 90000") &&
    files.planning.includes("timeout: 90000") &&
    files.production.includes("timeout: 90000"),
);
check(
  "일일 작업 디스패처와 글별 worker 분리",
  files.daily.includes("/api/cron/article-worker") &&
    files.daily.includes("after(async () =>") &&
    files.articleWorker.includes("produceArticle") &&
    files.articleWorker.includes("publishBloggerDraft"),
);
check(
  "worker 보호 차단 감지·선점 복구·실행 상태 기록",
  files.daily.includes('"x-vercel-protection-bypass"') &&
    files.daily.includes('redirect: "manual"') &&
    files.daily.includes("releaseJobClaims(failedIds") &&
    files.daily.includes("workerFailures: outcomes.filter((item) => !item.ok).length") &&
    files.daily.includes('const status =') &&
    files.health.includes('queued: count("queued")') &&
    files.health.includes('dispatchFailures: count("dispatchFailures")') &&
    files.health.includes('workerFailures: count("workerFailures")'),
);
check(
  "타임아웃 작업 자동 복구",
  files.store.includes("recoverStaleArticleJobs") &&
    files.store.includes("finishStaleAutomationRuns") &&
    files.daily.includes("recoverStaleArticleJobs(15)"),
);
check(
  "하루 목표 중복 실행 방지",
  files.store.includes("FOR UPDATE SKIP LOCKED") &&
    files.daily.includes("getTodayPublishedCount") &&
    files.daily.includes("reserved"),
);
check(
  "당일 자동 재시도",
  ["/api/cron/daily-retry-1", "/api/cron/daily-retry-2", "/api/cron/daily-retry-3"].every(
    (route) => files.vercel.includes(route),
  ),
);
check(
  "Blogger 자동 공개와 중복 방지",
  files.articleWorker.includes("config.autoPublish") &&
    files.articleWorker.includes("createBloggerDraft") &&
    files.google.includes("blogger-agent-job:") &&
    files.google.includes("reused: true"),
);
check(
  "Blogger 호출량 제한",
  files.google.includes("maxResults: 100") &&
    files.google.includes("timeout: 15000"),
);
check(
  "운영 상태 가시성",
  files.health.includes("latestDailyRun") &&
    files.health.includes("latestWeeklyRun") &&
    files.status.includes("readyForUnattendedRun"),
);
check(
  "예약 경로 인증",
  files.middleware.includes('startsWith("/api/cron/")') &&
    files.daily.includes("assertCron(req)") &&
    files.articleWorker.includes("assertCron(req)"),
);
check(
  "자동 공개 설정과 하루 7개 기본값",
  files.store.includes("daily_article_limit integer NOT NULL DEFAULT 7") &&
    files.planning.includes("dailyArticleLimit: 7"),
);
check(
  "웹 검색 JSON 모드 충돌 없음",
  ![files.planning, files.production].some(
    (source) =>
      source.includes('tools: [{ type: "web_search" }]') &&
      /tools:\s*\[\{ type: "web_search" \}\][\s\S]{0,800}type:\s*"json_(?:object|schema)"/.test(source),
  ),
);

let repaired = false;
try {
  repaired =
    JSON.parse(jsonrepair('{"categories":[{"name":"생활" "keywords":[]}]}'))
      .categories[0].name === "생활";
} catch {}
check("AI JSON 자동 복구", repaired && files.models.includes("jsonrepair"));

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} automation requirements passed`);
if (failed) process.exit(1);
