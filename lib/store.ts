import postgres from "postgres";
import { createHash, randomUUID } from "crypto";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { DEFAULT_STYLE_GUIDE } from "@/lib/editorial";
import { MODEL_OPTIONS } from "@/lib/models";

let client: ReturnType<typeof postgres> | undefined;
let schemaReady: Promise<void> | undefined;

function databaseUrl() {
  return process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
}

function db() {
  const url = databaseUrl();
  if (!url)
    throw new Error("자동 실행에는 DATABASE_URL이 필요합니다.");
  client ||= postgres(url, {
    max: 3,
    ssl: process.env.DATABASE_SSL === "false" ? false : "require",
  });
  return client;
}

export function hasDatabase() {
  return Boolean(databaseUrl());
}

export async function ensureSchema() {
  if (!schemaReady)
    schemaReady = (async () => {
      const database = db();
      await database.begin(async (sql) => {
        await sql`SELECT pg_advisory_xact_lock(746523901)`;
      await sql`CREATE TABLE IF NOT EXISTS automation_config (
      id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      enabled boolean NOT NULL DEFAULT true,
      category_count integer NOT NULL DEFAULT 5,
      keywords_per_category integer NOT NULL DEFAULT 5,
      articles_per_keyword integer NOT NULL DEFAULT 2,
      daily_article_limit integer NOT NULL DEFAULT 7,
      auto_publish boolean NOT NULL DEFAULT false,
      writer_model text NOT NULL DEFAULT 'gpt-5.6-terra',
      reviewer_model text NOT NULL DEFAULT 'gpt-5.6-terra',
      style_guide text NOT NULL,
      category_blog_map jsonb NOT NULL DEFAULT '{}'::jsonb,
      category_style_map jsonb NOT NULL DEFAULT '{}'::jsonb,
      revenue_goal_monthly bigint NOT NULL DEFAULT 100000000,
      revenue_goal_months integer NOT NULL DEFAULT 24,
      revenue_model text NOT NULL DEFAULT 'multi_stream',
      revenue_streams jsonb NOT NULL DEFAULT '["adsense","affiliate","sponsorship","digital_products"]'::jsonb,
      goal_started_at date NOT NULL DEFAULT CURRENT_DATE,
      estimated_article_cost_won integer NOT NULL DEFAULT 1000,
      estimated_weekly_plan_cost_won integer NOT NULL DEFAULT 5000,
      estimated_analysis_cost_won integer NOT NULL DEFAULT 2000,
      monthly_fixed_cost_won integer NOT NULL DEFAULT 0,
      monthly_ai_budget_won integer NOT NULL DEFAULT 100000,
      pause_on_budget boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS category_count integer NOT NULL DEFAULT 5`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS keywords_per_category integer NOT NULL DEFAULT 5`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS articles_per_keyword integer NOT NULL DEFAULT 2`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS daily_article_limit integer NOT NULL DEFAULT 7`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS revenue_goal_monthly bigint NOT NULL DEFAULT 100000000`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS revenue_goal_months integer NOT NULL DEFAULT 24`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS revenue_model text NOT NULL DEFAULT 'multi_stream'`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS revenue_streams jsonb NOT NULL DEFAULT '["adsense","affiliate","sponsorship","digital_products"]'::jsonb`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS goal_started_at date NOT NULL DEFAULT CURRENT_DATE`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS estimated_article_cost_won integer NOT NULL DEFAULT 1000`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS estimated_weekly_plan_cost_won integer NOT NULL DEFAULT 5000`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS estimated_analysis_cost_won integer NOT NULL DEFAULT 2000`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS monthly_fixed_cost_won integer NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS monthly_ai_budget_won integer NOT NULL DEFAULT 100000`;
      await sql`ALTER TABLE automation_config ADD COLUMN IF NOT EXISTS pause_on_budget boolean NOT NULL DEFAULT true`;
      await sql`CREATE TABLE IF NOT EXISTS oauth_credentials (
      id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      access_token text,
      refresh_token text,
      token_expiry bigint,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
      await sql`CREATE TABLE IF NOT EXISTS weekly_plans (
      week_start date PRIMARY KEY,
      payload jsonb NOT NULL,
      sources jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
      await sql`CREATE TABLE IF NOT EXISTS planning_search_cache (
      id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      settings jsonb NOT NULL,
      raw_response text NOT NULL,
      sources jsonb NOT NULL DEFAULT '[]'::jsonb,
      parsed_plan jsonb,
      status text NOT NULL DEFAULT 'captured',
      captured_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
      await sql`CREATE TABLE IF NOT EXISTS article_jobs (
      id text PRIMARY KEY,
      week_start date NOT NULL REFERENCES weekly_plans(week_start) ON DELETE CASCADE,
      ordinal integer NOT NULL,
      category text NOT NULL,
      keyword text NOT NULL,
      intent text NOT NULL,
      angle jsonb NOT NULL,
      scheduled_date date,
      state text NOT NULL DEFAULT 'waiting',
      attempts integer NOT NULL DEFAULT 0,
      article jsonb,
      error text,
      blog_id text,
      blogger_post_id text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
      await sql`CREATE INDEX IF NOT EXISTS article_jobs_due_idx ON article_jobs(state, scheduled_date, ordinal)`;
      await sql`CREATE TABLE IF NOT EXISTS automation_runs (
      id bigserial PRIMARY KEY,
      kind text NOT NULL,
      status text NOT NULL,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz
    )`;
      await sql`CREATE TABLE IF NOT EXISTS performance_reports (
      blog_id text PRIMARY KEY,
      blog_name text NOT NULL,
      blog_url text NOT NULL,
      site_url text,
      status text NOT NULL,
      report jsonb NOT NULL,
      period_start date,
      period_end date,
      analyzed_at timestamptz NOT NULL DEFAULT now()
    )`;
      await sql`CREATE TABLE IF NOT EXISTS revenue_snapshots (
      id bigserial PRIMARY KEY,
      period_start date NOT NULL,
      period_end date NOT NULL,
      currency_code text NOT NULL,
      estimated_earnings numeric NOT NULL DEFAULT 0,
      page_views bigint NOT NULL DEFAULT 0,
      page_rpm numeric NOT NULL DEFAULT 0,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      collected_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(period_start, period_end)
    )`;
      await sql`CREATE TABLE IF NOT EXISTS strategy_reports (
      id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      status text NOT NULL,
      report jsonb NOT NULL,
      analyzed_at timestamptz NOT NULL DEFAULT now()
    )`;
      await sql`CREATE TABLE IF NOT EXISTS cost_events (
      id bigserial PRIMARY KEY,
      job_id text,
      blog_id text,
      kind text NOT NULL,
      amount_won numeric NOT NULL DEFAULT 0,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(job_id, kind)
    )`;
      await sql`CREATE INDEX IF NOT EXISTS cost_events_month_idx ON cost_events(created_at, blog_id)`;
      await sql`CREATE TABLE IF NOT EXISTS automation_locks (
      kind text PRIMARY KEY,
      owner text NOT NULL,
      locked_until timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
      await sql`CREATE TABLE IF NOT EXISTS audit_events (
      id bigserial PRIMARY KEY,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id text,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
      await sql`CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC)`;
      await sql`INSERT INTO automation_config (id, style_guide) VALUES (1, ${DEFAULT_STYLE_GUIDE}) ON CONFLICT (id) DO NOTHING`;
      });
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  return schemaReady;
}

export async function getAutomationConfig() {
  await ensureSchema();
  const [row] = await db()`SELECT * FROM automation_config WHERE id = 1`;
  return {
    enabled: row.enabled as boolean,
    categoryCount: Number(row.category_count),
    keywordsPerCategory: Number(row.keywords_per_category),
    articlesPerKeyword: Number(row.articles_per_keyword),
    dailyArticleLimit: Number(row.daily_article_limit),
    autoPublish: row.auto_publish as boolean,
    writerModel: row.writer_model as string,
    reviewerModel: row.reviewer_model as string,
    styleGuide: row.style_guide as string,
    categoryBlogMap: (row.category_blog_map || {}) as Record<string, string>,
    categoryStyleMap: (row.category_style_map || {}) as Record<string, string>,
    revenueGoalMonthly: Number(row.revenue_goal_monthly),
    revenueGoalMonths: Number(row.revenue_goal_months),
    revenueModel: row.revenue_model as "adsense_only" | "multi_stream",
    revenueStreams: Array.isArray(row.revenue_streams)
      ? (row.revenue_streams as string[])
      : ["adsense", "affiliate", "sponsorship", "digital_products"],
    goalStartedAt:
      row.goal_started_at instanceof Date
        ? row.goal_started_at.toISOString().slice(0, 10)
        : String(row.goal_started_at).slice(0, 10),
    estimatedArticleCostWon: Number(row.estimated_article_cost_won),
    estimatedWeeklyPlanCostWon: Number(row.estimated_weekly_plan_cost_won),
    estimatedAnalysisCostWon: Number(row.estimated_analysis_cost_won),
    monthlyFixedCostWon: Number(row.monthly_fixed_cost_won),
    monthlyAiBudgetWon: Number(row.monthly_ai_budget_won),
    pauseOnBudget: row.pause_on_budget as boolean,
  };
}

export async function saveAutomationConfig(
  input: Partial<Awaited<ReturnType<typeof getAutomationConfig>>>,
) {
  await ensureSchema();
  const current = await getAutomationConfig();
  const next = { ...current, ...input };
  const limits = [
    ["카테고리 수", next.categoryCount, 1, 20],
    ["카테고리별 키워드 수", next.keywordsPerCategory, 1, 20],
    ["키워드별 글 수", next.articlesPerKeyword, 1, 5],
    ["하루 작성량", next.dailyArticleLimit, 1, 20],
    ["목표 기간", next.revenueGoalMonths, 6, 120],
  ] as const;
  for (const [label, value, min, max] of limits)
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${label}는 ${min}~${max} 사이의 정수여야 합니다.`);
  if (
    !Number.isInteger(next.revenueGoalMonthly) ||
    next.revenueGoalMonthly < 100000 ||
    next.revenueGoalMonthly > 1000000000
  )
    throw new Error("월 수익 목표는 10만~10억 원 사이의 정수여야 합니다.");
  const allowedRevenueStreams = new Set([
    "adsense",
    "affiliate",
    "sponsorship",
    "digital_products",
  ]);
  next.revenueStreams = [
    ...new Set((next.revenueStreams || []).filter((item: string) => allowedRevenueStreams.has(item))),
  ];
  if (!next.revenueStreams.length)
    throw new Error("최소 하나의 수익원을 선택해야 합니다.");
  next.revenueModel = next.revenueStreams.length > 1 ? "multi_stream" : "adsense_only";
  if (!next.styleGuide.trim() || next.styleGuide.length > 12000)
    throw new Error("편집 가이드는 1~12,000자 사이여야 합니다.");
  const supportedModels = new Set(MODEL_OPTIONS.map((model) => model.id));
  if (
    !supportedModels.has(next.writerModel) ||
    !supportedModels.has(next.reviewerModel)
  )
    throw new Error("지원되는 작성·검수 모델을 선택하세요.");
  if (
    !next.categoryBlogMap ||
    Array.isArray(next.categoryBlogMap) ||
    typeof next.categoryBlogMap !== "object" ||
    !next.categoryStyleMap ||
    Array.isArray(next.categoryStyleMap) ||
    typeof next.categoryStyleMap !== "object"
  )
    throw new Error("카테고리별 Blogger·문체 설정 형식이 올바르지 않습니다.");
  if (
    Object.keys(next.categoryBlogMap).length > 50 ||
    Object.keys(next.categoryStyleMap).length > 50
  )
    throw new Error("카테고리 설정은 최대 50개까지 저장할 수 있습니다.");
  for (const [category, blogId] of Object.entries(next.categoryBlogMap))
    if (
      !category.trim() ||
      category.length > 200 ||
      typeof blogId !== "string" ||
      blogId.length > 300
    )
      throw new Error("카테고리 이름 또는 Blogger ID가 너무 깁니다.");
  for (const [category, guide] of Object.entries(next.categoryStyleMap))
    if (
      !category.trim() ||
      category.length > 200 ||
      typeof guide !== "string" ||
      guide.length > 12000
    )
      throw new Error("카테고리 이름 또는 전용 문체 설정이 올바르지 않습니다.");
  for (const [label, value, max] of [
    ["글 1개당 예상 API 비용", next.estimatedArticleCostWon, 1000000],
    ["주간 조사 예상 API 비용", next.estimatedWeeklyPlanCostWon, 1000000],
    ["분석 1회 예상 API 비용", next.estimatedAnalysisCostWon, 1000000],
    ["월 고정비", next.monthlyFixedCostWon, 100000000],
    ["월 AI 예산", next.monthlyAiBudgetWon, 100000000],
  ] as const)
    if (!Number.isInteger(value) || value < 0 || value > max)
      throw new Error(
        `${label}은 0~${max.toLocaleString("ko-KR")}원 사이의 정수여야 합니다.`,
      );
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`UPDATE automation_config SET enabled=${next.enabled}, category_count=${next.categoryCount}, keywords_per_category=${next.keywordsPerCategory}, articles_per_keyword=${next.articlesPerKeyword}, daily_article_limit=${next.dailyArticleLimit}, auto_publish=${next.autoPublish}, writer_model=${next.writerModel}, reviewer_model=${next.reviewerModel}, style_guide=${next.styleGuide}, category_blog_map=${tx.json(next.categoryBlogMap)}, category_style_map=${tx.json(next.categoryStyleMap)}, revenue_goal_monthly=${next.revenueGoalMonthly}, revenue_goal_months=${next.revenueGoalMonths}, revenue_model=${next.revenueModel}, revenue_streams=${tx.json(next.revenueStreams)}, goal_started_at=${next.goalStartedAt}, estimated_article_cost_won=${next.estimatedArticleCostWon}, estimated_weekly_plan_cost_won=${next.estimatedWeeklyPlanCostWon}, estimated_analysis_cost_won=${next.estimatedAnalysisCostWon}, monthly_fixed_cost_won=${next.monthlyFixedCostWon}, monthly_ai_budget_won=${next.monthlyAiBudgetWon}, pause_on_budget=${next.pauseOnBudget}, updated_at=now() WHERE id=1`;
    await tx`UPDATE article_jobs SET blog_id=null, updated_at=now()
      WHERE state IN ('waiting','error','ready','needs_review','source_blocked')
        AND blog_id IS NOT NULL`;
    for (const [category, blogId] of Object.entries(next.categoryBlogMap)) {
      if (!blogId) continue;
      await tx`UPDATE article_jobs SET blog_id=${blogId}, updated_at=now()
        WHERE category=${category}
          AND state IN ('waiting','error','ready','needs_review','source_blocked')`;
    }
  });
  await recordAuditEvent({
    action: "automation_config_updated",
    entityType: "automation_config",
    entityId: "1",
    detail: {
      enabled: next.enabled,
      categoryCount: next.categoryCount,
      keywordsPerCategory: next.keywordsPerCategory,
      articlesPerKeyword: next.articlesPerKeyword,
      dailyArticleLimit: next.dailyArticleLimit,
      autoPublish: next.autoPublish,
      writerModel: next.writerModel,
      reviewerModel: next.reviewerModel,
      mappedCategories: Object.values(next.categoryBlogMap).filter(Boolean)
        .length,
      monthlyAiBudgetWon: next.monthlyAiBudgetWon,
      estimatedWeeklyPlanCostWon: next.estimatedWeeklyPlanCostWon,
      estimatedAnalysisCostWon: next.estimatedAnalysisCostWon,
      pauseOnBudget: next.pauseOnBudget,
    },
  });
  return next;
}

export async function saveGoogleCredentials(tokens: {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
}) {
  await ensureSchema();
  const existing = await getGoogleCredentials();
  await db()`INSERT INTO oauth_credentials (id, access_token, refresh_token, token_expiry) VALUES (1, ${tokens.accessToken ? encryptSecret(tokens.accessToken) : null}, ${tokens.refreshToken ? encryptSecret(tokens.refreshToken) : existing.refreshToken ? encryptSecret(existing.refreshToken) : null}, ${tokens.tokenExpiry || null}) ON CONFLICT (id) DO UPDATE SET access_token=COALESCE(EXCLUDED.access_token, oauth_credentials.access_token), refresh_token=COALESCE(EXCLUDED.refresh_token, oauth_credentials.refresh_token), token_expiry=COALESCE(EXCLUDED.token_expiry, oauth_credentials.token_expiry), updated_at=now()`;
}

export async function getGoogleCredentials() {
  await ensureSchema();
  const [row] =
    await db()`SELECT access_token, refresh_token, token_expiry FROM oauth_credentials WHERE id=1`;
  return {
    accessToken: decryptSecret(row?.access_token),
    refreshToken: decryptSecret(row?.refresh_token),
    tokenExpiry: row?.token_expiry ? Number(row.token_expiry) : undefined,
  };
}

export function koreaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function mondayOfKoreaWeek(date = new Date()) {
  const today = koreaDate(date);
  const base = new Date(`${today}T12:00:00+09:00`);
  const day = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - day);
  return koreaDate(base);
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return koreaDate(date);
}

function jobSignature(category: string, keyword: string, angle: any) {
  const normalized = [category, keyword, angle?.titleIdea || ""]
    .map((value) => String(value).trim().toLowerCase().replace(/\s+/g, " "))
    .join("\u001f");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

function normalizedTopic(value: unknown) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isRepeatableTopic(angle: any) {
  return Boolean(
    angle?.repeatable === true ||
      angle?.contentMode === "realtime" ||
      angle?.contentMode === "seasonal" ||
      angle?.eventDate,
  );
}

export async function persistWeeklyPlan(
  plan: any,
  sources: any[] = [],
  dailyArticleLimit?: number,
) {
  await ensureSchema();
  const weekStart = mondayOfKoreaWeek();
  const config = await getAutomationConfig();
  const dailyLimit = dailyArticleLimit || config.dailyArticleLimit;
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO weekly_plans (week_start, payload, sources) VALUES (${weekStart}, ${tx.json(plan)}, ${tx.json(sources)}) ON CONFLICT (week_start) DO UPDATE SET payload=EXCLUDED.payload, sources=EXCLUDED.sources`;
    const protectedRows =
      await tx`SELECT category, keyword, angle FROM article_jobs
        WHERE week_start=${weekStart}
          AND state NOT IN ('waiting','error')`;
    const protectedSignatures = new Set(
      protectedRows.map((row) =>
        jobSignature(row.category, row.keyword, row.angle),
      ),
    );
    const historicalRows = await tx`SELECT category, keyword, intent, angle, state
      FROM article_jobs
      WHERE state IN ('published','draft','ready','needs_review','source_blocked')
        AND week_start <> ${weekStart}`;
    const historicalTopics = historicalRows.map((row) => ({
      signature: jobSignature(row.category, row.keyword, row.angle),
      category: normalizedTopic(row.category),
      keyword: normalizedTopic(row.keyword),
      intent: normalizedTopic(row.intent),
      angle: row.angle || {},
    }));
    await tx`DELETE FROM article_jobs
      WHERE week_start=${weekStart} AND state IN ('waiting','error')`;
    let ordinal = 0;
    for (const category of plan.categories)
      for (const keyword of category.keywords)
        for (const angle of keyword.angles) {
          const storedAngle = {
            ...angle,
            contentMode: keyword.contentMode || category.contentMode,
            freshnessWindowHours: keyword.freshnessWindowHours,
            eventDate: keyword.eventDate,
            sourceCheckedAt: keyword.sourceCheckedAt,
            planningEvidence: keyword.evidence || [],
            categoryEvidence: category.evidence || [],
          };
          const scheduledDate = addDays(
            weekStart,
            Math.floor(ordinal / dailyLimit),
          );
          const signature = jobSignature(
            category.name,
            keyword.keyword,
            storedAngle,
          );
          const repeatable = isRepeatableTopic(storedAngle);
          const duplicate = historicalTopics.some((previous) => {
            if (previous.signature === signature) {
              if (!repeatable) return true;
              return Boolean(
                previous.angle?.eventDate &&
                  storedAngle.eventDate &&
                  previous.angle.eventDate === storedAngle.eventDate,
              );
            }
            if (repeatable) return false;
            return (
              previous.category === normalizedTopic(category.name) &&
              previous.keyword === normalizedTopic(keyword.keyword) &&
              previous.intent === normalizedTopic(keyword.intent) &&
              normalizedTopic(previous.angle?.titleIdea) ===
                normalizedTopic(storedAngle.titleIdea)
            );
          });
          if (!protectedSignatures.has(signature) && !duplicate) {
            const id = `${weekStart}:${signature}`;
            await tx`INSERT INTO article_jobs (id, week_start, ordinal, category, keyword, intent, angle, scheduled_date, blog_id) VALUES (${id}, ${weekStart}, ${ordinal}, ${category.name}, ${keyword.keyword}, ${keyword.intent}, ${tx.json(storedAngle)}, ${scheduledDate}, ${config.categoryBlogMap[category.name] || null}) ON CONFLICT (id) DO NOTHING`;
          }
          ordinal += 1;
        }
  });
  return getWorkspace();
}

export async function getWorkspace() {
  await ensureSchema();
  const config = await getAutomationConfig();
  const [plan] =
    await db()`SELECT * FROM weekly_plans ORDER BY week_start DESC LIMIT 1`;
  const jobs = plan
    ? await db()`SELECT * FROM article_jobs
        WHERE week_start=${plan.week_start}
          OR state IN ('waiting','working','error','ready','needs_review','source_blocked','draft')
        ORDER BY scheduled_date NULLS LAST, week_start, ordinal`
    : [];
  return {
    plan: plan ? { ...plan.payload, sources: plan.sources } : null,
    tasks: jobs.map((row) => jobToTask(row, config.dailyArticleLimit)),
  };
}

export async function savePlanningSearchSnapshot(input: {
  settings: any;
  rawResponse: string;
  sources: any[];
  capturedAt: string;
}) {
  await ensureSchema();
  await db()`INSERT INTO planning_search_cache
    (id, settings, raw_response, sources, parsed_plan, status, captured_at, updated_at)
    VALUES (1, ${db().json(input.settings)}, ${input.rawResponse}, ${db().json(input.sources)}, null, 'captured', ${input.capturedAt}, now())
    ON CONFLICT (id) DO UPDATE SET
      settings=EXCLUDED.settings,
      raw_response=EXCLUDED.raw_response,
      sources=EXCLUDED.sources,
      parsed_plan=null,
      status='captured',
      captured_at=EXCLUDED.captured_at,
      updated_at=now()`;
}

export async function markPlanningSearchReady(plan: any) {
  await ensureSchema();
  await db()`UPDATE planning_search_cache
    SET parsed_plan=${db().json(plan)}, status='ready', updated_at=now()
    WHERE id=1`;
}

export async function getPlanningSearchSnapshot() {
  await ensureSchema();
  const [row] = await db()`SELECT settings, raw_response, sources, parsed_plan,
      status, captured_at
    FROM planning_search_cache WHERE id=1`;
  if (!row) return null;
  return {
    settings: row.settings,
    rawResponse: row.raw_response as string,
    sources: row.sources || [],
    plan: row.parsed_plan || undefined,
    status: row.status as "captured" | "ready",
    capturedAt:
      row.captured_at instanceof Date
        ? row.captured_at.toISOString()
        : String(row.captured_at),
  };
}

export async function getRecentKeywords() {
  await ensureSchema();
  const rows =
    await db()`SELECT keyword FROM article_jobs GROUP BY keyword ORDER BY max(updated_at) DESC LIMIT 150`;
  return rows.map((row) => row.keyword as string);
}

export async function getRecentContentInventory(limit = 300) {
  await ensureSchema();
  const rows = await db()`SELECT category, keyword, intent, angle, state,
      article->>'title' AS title, updated_at
    FROM article_jobs
    ORDER BY updated_at DESC
    LIMIT ${Math.max(1, Math.min(limit, 500))}`;
  return rows.map((row) => ({
    category: row.category,
    keyword: row.keyword,
    intent: row.intent,
    angleTitle: row.angle?.titleIdea || "",
    state: row.state,
    articleTitle: row.title || "",
  }));
}

function jobToTask(row: any, dailyLimit: number) {
  return {
    id: row.id,
    category: row.category,
    keyword: row.keyword,
    intent: row.intent,
    angle: row.angle,
    evidence: row.angle?.planningEvidence || [],
    categoryEvidence: row.angle?.categoryEvidence || [],
    day: Math.floor(row.ordinal / dailyLimit),
    scheduledDate: row.scheduled_date,
    state: row.state,
    article: row.article,
    error: row.error,
    blogId: row.blog_id,
    postId: row.blogger_post_id,
    attempts: Number(row.attempts || 0),
  };
}

export async function getJobPublicationContext(id: string) {
  await ensureSchema();
  const [row] =
    await db()`SELECT id, state, blog_id, blogger_post_id, article FROM article_jobs WHERE id=${id}`;
  return row
    ? {
        id: row.id as string,
        state: row.state as string,
        blogId: row.blog_id as string | null,
        postId: row.blogger_post_id as string | null,
        article: row.article || null,
      }
    : null;
}

export async function claimDueJobs(limit = 7) {
  await ensureSchema();
  const today = koreaDate();
  return db().begin(async (tx) => {
    const rows =
      await tx`SELECT * FROM article_jobs WHERE scheduled_date IS NOT NULL AND scheduled_date <= ${today} AND (state='waiting' OR (state='error' AND attempts < 3) OR (state='needs_review' AND article IS NOT NULL AND attempts < 3 AND COALESCE(article->'recoveryDecision'->>'automatic','true')='true') OR (state='working' AND article IS NULL AND updated_at < now() - interval '2 hours')) ORDER BY scheduled_date, ordinal LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
    if (rows.length)
      await tx`UPDATE article_jobs SET state='working', attempts=attempts+1, error=null, updated_at=now() WHERE id IN ${tx(rows.map((row) => row.id))}`;
    return rows;
  });
}

export async function claimReadyDraftJobs(limit = 20) {
  await ensureSchema();
  const today = koreaDate();
  return db().begin(async (tx) => {
    const rows = await tx`SELECT * FROM article_jobs
      WHERE scheduled_date IS NOT NULL
        AND scheduled_date <= ${today}
        AND blog_id IS NOT NULL
        AND article IS NOT NULL
        AND (
          state='ready'
          OR (state='working' AND updated_at < now() - interval '2 hours')
        )
      ORDER BY scheduled_date, ordinal
      LIMIT ${Math.max(1, Math.min(limit, 50))}
      FOR UPDATE SKIP LOCKED`;
    if (rows.length)
      await tx`UPDATE article_jobs SET state='working', error=null, updated_at=now()
        WHERE id IN ${tx(rows.map((row) => row.id))}`;
    return rows;
  });
}

export async function releaseJobClaims(ids: string[], reason: string) {
  if (!ids.length) return;
  await ensureSchema();
  await db()`UPDATE article_jobs
    SET state='waiting', attempts=GREATEST(attempts-1, 0), error=${reason}, updated_at=now()
    WHERE id IN ${db()(ids)} AND state='working'`;
}

export async function getRecentArticles(limit = 40, blogId?: string | null) {
  await ensureSchema();
  return blogId
    ? db()`SELECT article->>'title' AS title, left(article->>'html', 500) AS summary FROM article_jobs WHERE article IS NOT NULL AND blog_id=${blogId} ORDER BY updated_at DESC LIMIT ${limit}`
    : db()`SELECT article->>'title' AS title, left(article->>'html', 500) AS summary FROM article_jobs WHERE article IS NOT NULL ORDER BY updated_at DESC LIMIT ${limit}`;
}

export async function updateJob(
  id: string,
  input: {
    state: string;
    article?: any;
    error?: string | null;
    bloggerPostId?: string;
  },
) {
  await ensureSchema();
  await db()`UPDATE article_jobs SET state=${input.state}, article=COALESCE(${input.article ? db().json(input.article) : null}, article), error=${input.error ?? null}, blogger_post_id=COALESCE(${input.bloggerPostId || null}, blogger_post_id), updated_at=now() WHERE id=${id}`;
}

export async function startRun(kind: string) {
  await ensureSchema();
  const [row] =
    await db()`INSERT INTO automation_runs (kind, status) VALUES (${kind}, 'running') RETURNING id`;
  return Number(row.id);
}

export async function finishRun(id: number, status: string, detail: any) {
  await ensureSchema();
  await db()`UPDATE automation_runs SET status=${status}, detail=${db().json(detail)}, finished_at=now() WHERE id=${id}`;
}

export async function recentRuns() {
  await ensureSchema();
  return db()`SELECT kind, status, detail, started_at, finished_at FROM automation_runs ORDER BY id DESC LIMIT 10`;
}

export async function recordAuditEvent(input: {
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: any;
}) {
  await ensureSchema();
  await db()`INSERT INTO audit_events (action, entity_type, entity_id, detail)
    VALUES (${input.action}, ${input.entityType}, ${input.entityId || null}, ${db().json(input.detail || {})})`;
}

export async function recentAuditEvents() {
  await ensureSchema();
  const rows =
    await db()`SELECT action, entity_type, entity_id, detail, created_at
    FROM audit_events ORDER BY id DESC LIMIT 20`;
  return rows.map((row) => ({
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

export async function getOperationalStats() {
  await ensureSchema();
  const [row] = await db()`SELECT
    count(*) FILTER (WHERE state='waiting')::int AS waiting,
    count(*) FILTER (WHERE state='working')::int AS working,
    count(*) FILTER (WHERE state='ready')::int AS ready,
    count(*) FILTER (WHERE state='needs_review')::int AS needs_review,
    count(*) FILTER (WHERE state='source_blocked')::int AS source_blocked,
    count(*) FILTER (WHERE state='draft')::int AS draft,
    count(*) FILTER (WHERE state='published')::int AS published,
    count(*) FILTER (WHERE state='error')::int AS errors,
    count(*) FILTER (WHERE state='error' AND attempts >= 3)::int AS blocked_errors,
    count(*) FILTER (WHERE blog_id IS NULL AND state IN ('waiting','ready','needs_review','source_blocked'))::int AS unmapped,
    count(*) FILTER (WHERE state='working' AND updated_at < now() - interval '2 hours')::int AS stale_working
    FROM article_jobs`;
  return Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [key, Number(value || 0)]),
  );
}

export async function hasStoredGoogleCredentials() {
  await ensureSchema();
  const [row] = await db()`SELECT
    (access_token IS NOT NULL OR refresh_token IS NOT NULL) AS connected
    FROM oauth_credentials WHERE id=1`;
  return Boolean(row?.connected || process.env.GOOGLE_REFRESH_TOKEN);
}

export async function savePerformanceReport(input: {
  blogId: string;
  blogName: string;
  blogUrl: string;
  siteUrl?: string;
  status: string;
  report: any;
  periodStart?: string;
  periodEnd?: string;
}) {
  await ensureSchema();
  await db()`INSERT INTO performance_reports (blog_id, blog_name, blog_url, site_url, status, report, period_start, period_end, analyzed_at)
    VALUES (${input.blogId}, ${input.blogName}, ${input.blogUrl}, ${input.siteUrl || null}, ${input.status}, ${db().json(input.report)}, ${input.periodStart || null}, ${input.periodEnd || null}, now())
    ON CONFLICT (blog_id) DO UPDATE SET blog_name=EXCLUDED.blog_name, blog_url=EXCLUDED.blog_url, site_url=EXCLUDED.site_url, status=EXCLUDED.status, report=EXCLUDED.report, period_start=EXCLUDED.period_start, period_end=EXCLUDED.period_end, analyzed_at=now()`;
}

export async function getPerformanceReports() {
  await ensureSchema();
  const rows =
    await db()`SELECT blog_id, blog_name, blog_url, site_url, status, report, period_start, period_end, analyzed_at FROM performance_reports ORDER BY analyzed_at DESC`;
  return rows.map((row) => ({
    blogId: row.blog_id,
    blogName: row.blog_name,
    blogUrl: row.blog_url,
    siteUrl: row.site_url,
    status: row.status,
    ...row.report,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    analyzedAt: row.analyzed_at,
  }));
}

export async function getPerformanceGuidance(blogId?: string | null) {
  if (!blogId) return null;
  await ensureSchema();
  const [row] =
    await db()`SELECT status, report, analyzed_at FROM performance_reports WHERE blog_id=${blogId}`;
  if (!row || row.status !== "ready") return null;
  return {
    ...row.report.learning,
    evidenceWindow: row.report.summary,
    analyzedAt: row.analyzed_at,
  };
}

export async function getPortfolioPerformanceGuidance() {
  await ensureSchema();
  const rows =
    await db()`SELECT blog_name, report FROM performance_reports WHERE status='ready' ORDER BY analyzed_at DESC LIMIT 20`;
  return rows.map((row) => ({
    blogName: row.blog_name,
    summary: row.report.summary,
    learning: row.report.learning,
  }));
}

export async function saveRevenueSnapshot(input: {
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  estimatedEarnings: number;
  pageViews: number;
  pageRpm: number;
  payload?: any;
}) {
  await ensureSchema();
  await db()`INSERT INTO revenue_snapshots (period_start, period_end, currency_code, estimated_earnings, page_views, page_rpm, payload)
    VALUES (${input.periodStart}, ${input.periodEnd}, ${input.currencyCode}, ${input.estimatedEarnings}, ${input.pageViews}, ${input.pageRpm}, ${db().json(input.payload || {})})
    ON CONFLICT (period_start, period_end) DO UPDATE SET currency_code=EXCLUDED.currency_code, estimated_earnings=EXCLUDED.estimated_earnings, page_views=EXCLUDED.page_views, page_rpm=EXCLUDED.page_rpm, payload=EXCLUDED.payload, collected_at=now()`;
}

export async function saveStrategyReport(status: string, report: any) {
  await ensureSchema();
  await db()`INSERT INTO strategy_reports (id, status, report) VALUES (1, ${status}, ${db().json(report)})
    ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, report=EXCLUDED.report, analyzed_at=now()`;
}

export async function getLatestStrategyReport() {
  await ensureSchema();
  const [row] =
    await db()`SELECT status, report, analyzed_at FROM strategy_reports WHERE id=1`;
  return row
    ? { status: row.status, ...row.report, analyzedAt: row.analyzed_at }
    : null;
}

export async function getStrategyGuidance() {
  const report = await getLatestStrategyReport();
  if (!report) return null;
  return {
    status: report.status,
    trajectory: report.trajectory,
    weeklyObjective: report.weeklyObjective,
    portfolioActions: report.portfolioActions,
    contentAllocation: report.contentAllocation,
    actionPlan: report.actionPlan,
    stopRules: report.stopRules,
    policyWarnings: report.policyWarnings,
  };
}

export async function getStrategyProgressStats() {
  await ensureSchema();
  const [jobs] = await db()`SELECT
    count(*) FILTER (WHERE state='published')::int AS published_articles,
    count(*) FILTER (WHERE state='draft')::int AS draft_articles,
    count(*)::int AS total_jobs,
    min(updated_at) FILTER (WHERE state='published') AS first_published_at
    FROM article_jobs`;
  const [search] = await db()`SELECT
    COALESCE(sum((report->'summary'->>'pages')::numeric), 0)::int AS search_pages,
    COALESCE(sum((report->'summary'->>'impressions')::numeric), 0)::bigint AS search_impressions,
    COALESCE(sum((report->'summary'->>'clicks')::numeric), 0)::bigint AS search_clicks
    FROM performance_reports WHERE status='ready'`;
  return {
    publishedArticles: Number(jobs?.published_articles || 0),
    draftArticles: Number(jobs?.draft_articles || 0),
    totalJobs: Number(jobs?.total_jobs || 0),
    firstPublishedAt: jobs?.first_published_at || null,
    searchPages: Number(search?.search_pages || 0),
    searchImpressions: Number(search?.search_impressions || 0),
    searchClicks: Number(search?.search_clicks || 0),
  };
}

export async function recordCostEvent(input: {
  jobId?: string;
  blogId?: string | null;
  kind?: string;
  amountWon: number;
  detail?: any;
}) {
  await ensureSchema();
  const kind = input.kind || "article-production";
  await db()`INSERT INTO cost_events (job_id, blog_id, kind, amount_won, detail)
    VALUES (${input.jobId || null}, ${input.blogId || null}, ${kind}, ${input.amountWon}, ${db().json(input.detail || {})})
    ON CONFLICT (job_id, kind) DO UPDATE SET amount_won=EXCLUDED.amount_won, blog_id=EXCLUDED.blog_id, detail=EXCLUDED.detail`;
}

export async function getMonthlyCostSummary() {
  await ensureSchema();
  const rows =
    await db()`SELECT blog_id, kind, COALESCE(sum(amount_won), 0) AS amount_won, count(*)::int AS events
    FROM cost_events
    WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
    GROUP BY blog_id, kind`;
  const byBlog: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const row of rows) {
    const amount = Number(row.amount_won);
    if (row.blog_id)
      byBlog[row.blog_id as string] =
        (byBlog[row.blog_id as string] || 0) + amount;
    byKind[row.kind as string] = (byKind[row.kind as string] || 0) + amount;
  }
  return {
    aiCostWon: rows.reduce((sum, row) => sum + Number(row.amount_won), 0),
    unassignedCostWon: rows
      .filter((row) => !row.blog_id)
      .reduce((sum, row) => sum + Number(row.amount_won), 0),
    events: rows.reduce((sum, row) => sum + Number(row.events), 0),
    byBlog,
    byKind,
  };
}

export async function getBudgetGuard() {
  const [config, costs] = await Promise.all([
    getAutomationConfig(),
    getMonthlyCostSummary(),
  ]);
  return {
    ...costs,
    budgetWon: config.monthlyAiBudgetWon,
    paused:
      config.pauseOnBudget &&
      config.monthlyAiBudgetWon > 0 &&
      costs.aiCostWon + config.estimatedArticleCostWon >
        config.monthlyAiBudgetWon,
  };
}

export async function reserveEstimatedCost(input: {
  jobId?: string;
  blogId?: string | null;
  kind: string;
  amountWon?: number;
  detail?: any;
}) {
  await ensureSchema();
  return db().begin(async (tx) => {
    const [config] =
      await tx`SELECT estimated_article_cost_won, monthly_ai_budget_won, pause_on_budget FROM automation_config WHERE id=1 FOR UPDATE`;
    const amountWon = Math.max(
      0,
      Number(input.amountWon ?? config.estimated_article_cost_won),
    );
    const [summary] = await tx`SELECT COALESCE(sum(amount_won), 0) AS used
      FROM cost_events
      WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'`;
    const usedWon = Number(summary.used || 0);
    const budgetWon = Number(config.monthly_ai_budget_won || 0);
    if (
      config.pause_on_budget &&
      budgetWon > 0 &&
      usedWon + amountWon > budgetWon
    )
      return { allowed: false, usedWon, amountWon, budgetWon };
    const inserted =
      await tx`INSERT INTO cost_events (job_id, blog_id, kind, amount_won, detail)
      VALUES (${input.jobId || null}, ${input.blogId || null}, ${input.kind}, ${amountWon}, ${tx.json(input.detail || {})})
      ON CONFLICT (job_id, kind) DO NOTHING
      RETURNING id`;
    return {
      allowed: true,
      reserved: inserted.length > 0,
      usedWon: usedWon + (inserted.length ? amountWon : 0),
      amountWon,
      budgetWon,
    };
  });
}

export async function acquireAutomationLock(kind: string, ttlMinutes = 30) {
  await ensureSchema();
  const owner = randomUUID();
  const [row] =
    await db()`INSERT INTO automation_locks (kind, owner, locked_until)
    VALUES (${kind}, ${owner}, now() + ${ttlMinutes} * interval '1 minute')
    ON CONFLICT (kind) DO UPDATE
    SET owner=EXCLUDED.owner, locked_until=EXCLUDED.locked_until, updated_at=now()
    WHERE automation_locks.locked_until < now()
    RETURNING owner`;
  return row?.owner === owner ? owner : null;
}

export async function releaseAutomationLock(
  kind: string,
  owner?: string | null,
) {
  if (!owner) return;
  try {
    await ensureSchema();
    await db()`DELETE FROM automation_locks WHERE kind=${kind} AND owner=${owner}`;
  } catch {}
}
