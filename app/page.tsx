"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ModelOption = {
  id: string;
  provider: "openai" | "anthropic" | "google";
  label: string;
};
type Settings = {
  connected: Record<string, boolean>;
  writerModel: string;
  reviewerModel: string;
  styleGuide: string;
  models: ModelOption[];
};
type Angle = {
  titleIdea: string;
  purpose: string;
  searchQuestion?: string;
  readerSituation?: string;
  answerPromise?: string;
  mustCover?: string[];
  exclusions?: string[];
  uniqueValue?: string;
  contentMode?: "evergreen" | "realtime";
  freshnessWindowHours?: number;
  eventDate?: string;
  sourceCheckedAt?: string;
};
type Plan = {
  weekLabel: string;
  marketSummary: string;
  sources: { title: string; url: string }[];
  qualityGate?: {
    requestedCategories: number;
    selectedCategories: number;
    requestedKeywordsPerCategory: number;
    selectedKeywords: number;
    realtimeTarget?: number;
    selectedRealtimeCategories?: number;
    rule: string;
    rejected: { type: string; name: string; reason: string }[];
  };
  categories: {
    name: string;
    contentMode?: "evergreen" | "realtime";
    audience?: string;
    sitePurpose?: string;
    blogGroupId?: string;
    blogGroupCategories?: string[];
    suggestedBlogName?: string;
    suggestedBlogDescription?: string;
    suggestedBlogAddresses?: string[];
    reason: string;
    trend: string;
    priorityScore?: number;
    scores?: Record<string, number>;
    evidence?: { signal?: string; period?: string; url: string }[];
    keywords: {
      keyword: string;
      contentMode?: "evergreen" | "realtime";
      freshnessWindowHours?: number;
      eventDate?: string;
      sourceCheckedAt?: string;
      intent: string;
      clusterRole?: string;
      trend: string;
      reason: string;
      priorityScore?: number;
      scores?: Record<string, number>;
      evidence?: { signal?: string; period?: string; url: string }[];
      angles: Angle[];
    }[];
  }[];
};
type Task = {
  id: string;
  category: string;
  keyword: string;
  intent: string;
  angle: Angle;
  day: number;
  scheduledDate?: string;
  blogId?: string;
  evidence?: { signal?: string; period?: string; url: string }[];
  categoryEvidence?: { signal?: string; period?: string; url: string }[];
  state:
    | "waiting"
    | "working"
    | "ready"
    | "needs_review"
    | "draft"
    | "published"
    | "source_blocked"
    | "error";
  article?: any;
  error?: string;
  postId?: string;
};

type ReviewGuidance = {
  kind: "format" | "evidence" | "content" | "manual";
  label: string;
  summary: string;
  actionLabel: string;
  canRetryAutomatically: boolean;
  retryMode:
    "review_only" | "evidence_repair" | "content_repair" | "manual_review";
  reasons: string[];
};

function getReviewGuidance(task: Task): ReviewGuidance | null {
  if (task.state !== "needs_review" || !task.article?.review) return null;
  if (task.article.recoveryDecision) {
    const decision = task.article.recoveryDecision;
    const kind =
      decision.mode === "review_only"
        ? "format"
        : decision.mode === "evidence_repair"
          ? "evidence"
          : decision.mode === "content_repair"
            ? "content"
            : "manual";
    return {
      kind,
      label: String(decision.label || "자동 복구 판단"),
      summary: String(decision.explanation || "원인을 자동 분류했습니다."),
      actionLabel: String(decision.actionLabel || "자동 복구 실행"),
      canRetryAutomatically: Boolean(decision.automatic),
      retryMode: decision.mode,
      reasons: Array.isArray(decision.reasons)
        ? decision.reasons.map(String)
        : [],
    };
  }
  const review = task.article.review;
  const issues = Array.isArray(review.issues) ? review.issues.map(String) : [];
  const issueText = issues.join(" ");
  const scores = [
    review.overallScore,
    review.factualScore,
    review.evidenceScore,
    review.usefulnessScore,
  ].map((value) => Number(value || 0));

  if (
    scores.every((score) => score === 0) ||
    /자동 검수 미완료|JSON|형식|파싱|응답.*찾지 못|schema/i.test(issueText)
  ) {
    return {
      kind: "format",
      label: "글은 있음 · 자동 검수 응답 오류",
      summary:
        "본문 문제가 확인된 것이 아니라 검수 결과를 읽는 과정이 끝나지 않았습니다. 자동 재시도 1회가 적합합니다.",
      actionLabel: "자동 검수 다시 시도",
      canRetryAutomatically: true,
      retryMode: "review_only",
      reasons: issues.length ? issues : ["검수 점수가 생성되지 않았습니다."],
    };
  }

  if (
    Number(review.factualScore || 0) < 95 ||
    Number(review.evidenceScore || 0) < 95 ||
    task.article.evidenceAudit?.passed === false ||
    /출처|근거|사실|수치|날짜|현재성|확인 불가|unsupported|misleading/i.test(
      issueText,
    )
  ) {
    return {
      kind: "evidence",
      label: "근거·사실 보강 필요",
      summary:
        "내용을 그대로 등록하기보다 출처를 다시 찾고 사실·날짜·조건을 보강해야 합니다. 에이전트가 보강 후 재작성하도록 하세요.",
      actionLabel: "근거 보강 후 재작성·검수",
      canRetryAutomatically: true,
      retryMode: "evidence_repair",
      reasons: issues.slice(0, 8),
    };
  }

  if (
    Number(review.intentScore || 0) < 90 ||
    Number(review.usefulnessScore || 0) < 88 ||
    Number(review.originalValueScore || 0) < 85 ||
    Number(review.readabilityScore || 0) < 85 ||
    Number(review.titleAccuracyScore || 0) < 90 ||
    Number(review.completenessScore || 0) < 90 ||
    task.article.contentDiagnostics?.passed === false
  ) {
    return {
      kind: "content",
      label: "본문·제목 자동 수정 필요",
      summary:
        "출처 부족보다는 검색 의도, 제목, 구성 또는 유용성 기준을 통과하지 못했습니다. 문제 항목을 반영한 자동 수정이 적합합니다.",
      actionLabel: "문제 반영해 자동 수정·재검수",
      canRetryAutomatically: true,
      retryMode: "content_repair",
      reasons: issues.slice(0, 8),
    };
  }

  return {
    kind: "manual",
    label: "자동 기준 경계 · 사람 확인 권장",
    summary:
      "치명적인 자동 오류는 찾지 못했지만 통과 기준에 근접한 항목이 남았습니다. 임시저장 후 최종 확인하는 편이 안전합니다.",
    actionLabel: "Blogger 임시저장 후 확인",
    canRetryAutomatically: false,
    retryMode: "manual_review",
    reasons: issues.slice(0, 8),
  };
}
const TITLE_STRATEGY_LABELS: Record<string, string> = {
  direct_answer: "직접 답변형",
  conditional: "대상·조건형",
  comparison: "비교 기준형",
  problem_solution: "문제 해결형",
};
type Workflow = {
  categoryCount: number;
  keywordsPerCategory: number;
  articlesPerKeyword: number;
  dailyArticleLimit: number;
};
type PlanningRun = {
  version: 1;
  id: string;
  settings: Workflow;
  settingsSignature: string;
  draft: any | null;
  sources: { title: string; url: string }[];
  createdAt: string;
  updatedAt: string;
};
type BlogMetric = {
  id: string;
  name: string;
  url: string;
  description: string;
  published?: string;
  updated?: string;
  postCount: number;
  views7Days: number;
  views30Days: number;
  viewsAllTime: number;
  viewsPerPost30Days: number;
  metricsAvailable: boolean;
};
type BlogSummary = {
  blogCount: number;
  postCount: number;
  views7Days: number;
  views30Days: number;
  viewsAllTime: number;
};
type GoogleConnectionState =
  "checking" | "connected" | "disconnected" | "error";
type PreflightReport = {
  readyForFirstArticle: boolean;
  summary: string;
  checkedAt?: string;
  consumesAiCredits?: boolean;
  checks: {
    id: string;
    label: string;
    status: "pass" | "warning" | "fail";
    detail: string;
    action?: string;
    diagnostic?: Record<string, unknown>;
  }[];
};
type Automation = Workflow & {
  configured: boolean;
  enabled: boolean;
  autoPublish?: boolean;
  schedule?: {
    weekly: string;
    daily: string;
    dailyLimit: number;
    total: number;
    estimatedDays: number;
  };
  runs?: any[];
  revenueGoalMonthly?: number;
  revenueGoalMonths?: number;
  estimatedArticleCostWon?: number;
  estimatedWeeklyPlanCostWon?: number;
  estimatedAnalysisCostWon?: number;
  monthlyFixedCostWon?: number;
  monthlyAiBudgetWon?: number;
  pauseOnBudget?: boolean;
  revenueStreams?: string[];
  readyForUnattendedRun?: boolean;
  readiness?: {
    id: string;
    label: string;
    ready: boolean;
    detail: string;
  }[];
  operational?: Record<string, number>;
  auditEvents?: {
    action: string;
    entityType: string;
    entityId?: string;
    detail?: Record<string, any>;
    createdAt: string;
  }[];
};
type StrategyReport = {
  status: string;
  trajectory: string;
  forecastConfidence: string;
  executiveSummary: string;
  weeklyObjective: string;
  progressPercent: number;
  actual: {
    estimatedEarnings: number;
    pageViews: number;
    pageRpm: number;
    periodStart: string;
    periodEnd: string;
  };
  requiredPageViewsAtActualRpm?: number | null;
  rpmScenarios: { rpm: number; requiredMonthlyPageViews: number }[];
  milestones: { month: number; monthlyRevenueTarget: number; label: string }[];
  growthPortfolio?: {
    planBasis: string;
    officialReviewNote: string;
    approvalTarget: string;
    firstRevenueTarget: string;
    activePhaseId: string;
    progress: {
      publishedArticles: number;
      draftArticles: number;
      searchPages: number;
      searchImpressions: number;
      searchClicks: number;
    };
    phases: {
      id: string;
      title: string;
      targetDate: string;
      expectedWindow: string;
      periodFromPrevious: string;
      description: string;
      gate: string;
      kpis: string[];
      status: "completed" | "in_progress" | "waiting" | "at_risk";
      actualSummary: string;
    }[];
  };
  approvalReadiness?: {
    blogId: string;
    blogName: string;
    ready: boolean;
    score: number;
    checks: { id: string; label: string; passed: boolean; detail: string }[];
  }[];
  business?: {
    grossRevenue: number;
    estimatedAiCost: number;
    fixedCost: number;
    totalOperatingCost: number;
    estimatedNetProfit: number;
    monthlyAiBudget: number;
    budgetUsedPercent: number;
    productionEvents: number;
    costMethod: string;
    unassignedRevenue: number;
    approvedSiteCount: number;
    adsenseSites: { domain: string; state: string }[];
    sites: {
      blogId: string;
      blogName: string;
      domain: string;
      pageViews: number;
      grossRevenue: number;
      pageRpm: number;
      estimatedAiCost: number;
      allocatedFixedCost: number;
      netProfit: number;
      marginPercent: number | null;
      attribution: string;
      recommendation: "scale" | "repair" | "measure";
    }[];
  };
  monetization?: {
    streams: { id: string; label: string; measured: boolean; status: string }[];
    nextActions: string[];
    disclaimer: string;
  };
  contentAllocation: { winners: number; adjacent: number; experiments: number };
  portfolioActions: {
    blogName: string;
    action: string;
    reason: string;
    articleShare?: number;
  }[];
  actionPlan: {
    priority: number;
    action: string;
    metric: string;
    deadline: string;
  }[];
  stopRules: string[];
  policyWarnings: string[];
  analyzedAt?: string;
};
type PerformanceReport = {
  blogId: string;
  blogName: string;
  blogUrl: string;
  status:
    | "ready"
    | "insufficient_data"
    | "property_missing"
    | "budget_paused"
    | "error";
  summary?: {
    pages: number;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  eligiblePages?: number;
  excludedPages?: number;
  message?: string;
  learning?: {
    summary: string;
    confidence: string;
    patterns: {
      signal: string;
      evidence: string;
      hypothesis: string;
      action: string;
      confidence: string;
    }[];
    topicGuidance: string[];
    titleGuidance: string[];
    structureGuidance: string[];
    avoid: string[];
    lowExposureGuidance: string[];
  };
  lowExposurePages?: {
    title: string;
    url: string;
    ageDays: number | null;
    impressions: number;
    clicks: number;
    position: number;
    signals: string[];
    index?: { checked: boolean; verdict?: string; coverageState?: string };
  }[];
  periodStart?: string;
  periodEnd?: string;
  analyzedAt?: string;
};

const DEFAULT_WORKFLOW: Workflow = {
  categoryCount: 5,
  keywordsPerCategory: 5,
  articlesPerKeyword: 2,
  dailyArticleLimit: 7,
};

function tasksFromPlan(plan: Plan, dailyLimit: number): Task[] {
  const nextTasks: Task[] = [];
  plan.categories.forEach((category) =>
    category.keywords.forEach((keyword) =>
      keyword.angles.forEach((angle) => {
        const index = nextTasks.length;
        const taskAngle: Angle = {
          ...angle,
          contentMode: keyword.contentMode || category.contentMode,
          freshnessWindowHours: keyword.freshnessWindowHours,
          eventDate: keyword.eventDate,
          sourceCheckedAt: keyword.sourceCheckedAt,
        };
        nextTasks.push({
          id: `${plan.weekLabel || "saved-plan"}-${index}`,
          category: category.name,
          keyword: keyword.keyword,
          intent: keyword.intent,
          angle: taskAngle,
          evidence: keyword.evidence || [],
          categoryEvidence: (category as any).evidence || [],
          day: Math.floor(index / Math.max(1, dailyLimit)),
          state: "waiting",
        });
      }),
    ),
  );
  return nextTasks;
}

function recoverInterruptedTasks(items: Task[] = []) {
  return items.map((task) =>
    task.state === "working"
      ? {
          ...task,
          state: "error" as const,
          error:
            "이전 실행이 브라우저 종료·새로고침으로 중단되었습니다. 다시 작성하면 완료된 다른 작업은 유지됩니다.",
        }
      : task,
  );
}

const numberFormat = new Intl.NumberFormat("ko-KR");
const formatCount = (value: number) => numberFormat.format(value || 0);
const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(value))
    : "-";

async function readApiJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as any;
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok)
      return {
        error:
          text
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500) ||
          `서버 요청에 실패했습니다(HTTP ${response.status}).`,
      } as any;
    throw new Error(
      `서버 응답 형식이 올바르지 않습니다(HTTP ${response.status}). CMD의 오류 내용을 확인하세요.`,
    );
  }
}

function workflowSignature(workflow: Workflow) {
  return JSON.stringify({
    categoryCount: workflow.categoryCount,
    keywordsPerCategory: workflow.keywordsPerCategory,
    articlesPerKeyword: workflow.articlesPerKeyword,
    dailyArticleLimit: workflow.dailyArticleLimit,
  });
}

function mergeSources(
  current: { title: string; url: string }[] = [],
  next: { title: string; url: string }[] = [],
) {
  const byUrl = new Map<string, { title: string; url: string }>();
  for (const source of [...current, ...next])
    if (source?.url) byUrl.set(source.url, source);
  return [...byUrl.values()];
}

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [initializationError, setInitializationError] = useState("");
  const [keys, setKeys] = useState({ openai: "", anthropic: "", google: "" });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planningRun, setPlanningRun] = useState<PlanningRun | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [blogs, setBlogs] = useState<BlogMetric[]>([]);
  const [blogSummary, setBlogSummary] = useState<BlogSummary>({
    blogCount: 0,
    postCount: 0,
    views7Days: 0,
    views30Days: 0,
    viewsAllTime: 0,
  });
  const [blogMetricsAt, setBlogMetricsAt] = useState("");
  const [blogMetricsError, setBlogMetricsError] = useState("");
  const [blogMetricsErrorCode, setBlogMetricsErrorCode] = useState("");
  const [googleConnection, setGoogleConnection] =
    useState<GoogleConnectionState>("checking");
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [performanceReports, setPerformanceReports] = useState<
    PerformanceReport[]
  >([]);
  const [performanceError, setPerformanceError] = useState("");
  const [blogMap, setBlogMap] = useState<Record<string, string>>({});
  const [styleMap, setStyleMap] = useState<Record<string, string>>({});
  const [compare, setCompare] = useState<any[]>([]);
  const [compareMode, setCompareMode] = useState<"write" | "review">("write");
  const [compareKeyword, setCompareKeyword] = useState("전기요금 절약 방법");
  const [compareSources, setCompareSources] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchStopRequested, setBatchStopRequested] = useState(false);
  const [automation, setAutomation] = useState<Automation>({
    ...DEFAULT_WORKFLOW,
    configured: false,
    enabled: false,
  });
  const [workflow, setWorkflow] = useState<Workflow>(DEFAULT_WORKFLOW);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [autoPublish, setAutoPublish] = useState(false);
  const [strategy, setStrategy] = useState<StrategyReport | null>(null);
  const [strategyError, setStrategyError] = useState("");
  const [revenueGoal, setRevenueGoal] = useState({
    monthly: 100000000,
    months: 24,
  });
  const [revenueStreams, setRevenueStreams] = useState<string[]>([
    "adsense",
    "affiliate",
    "sponsorship",
    "digital_products",
  ]);
  const [costControl, setCostControl] = useState({
    estimatedArticleCostWon: 1000,
    estimatedWeeklyPlanCostWon: 5000,
    estimatedAnalysisCostWon: 2000,
    monthlyFixedCostWon: 0,
    monthlyAiBudgetWon: 100000,
    pauseOnBudget: true,
  });
  const tasksRef = useRef<Task[]>([]);
  const batchStopRequestedRef = useRef(false);

  function clearPlanningRun() {
    setPlanningRun(null);
    localStorage.removeItem("blogger-agent-planning-run-v1");
    fetch("/api/local-workspace", { method: "DELETE" }).catch(() => {});
  }

  useEffect(() => {
    const savedPlanningRun = localStorage.getItem(
      "blogger-agent-planning-run-v1",
    );
    if (savedPlanningRun)
      try {
        const restoredRun = JSON.parse(savedPlanningRun) as PlanningRun;
        setPlanningRun(restoredRun);
        if (restoredRun?.settings) setWorkflow(restoredRun.settings);
      } catch {
        localStorage.removeItem("blogger-agent-planning-run-v1");
      }
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get("google_connected");
    const googleError = params.get("google_error");
    if (googleConnected === "1")
      setMessage("Google Blogger 연결을 완료했습니다.");
    if (googleError) setMessage(`Google 연결 오류: ${googleError}`);
    if (googleConnected || googleError) {
      params.delete("google_connected");
      params.delete("google_error");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    }
    fetch("/api/settings", { cache: "no-store" })
      .then(async (response) => {
        const data = await readApiJson(response);
        if (!response.ok)
          throw new Error(data.error || "설정을 불러오지 못했습니다.");
        setSettings(data);
      })
      .catch((error) =>
        setInitializationError(
          error?.message || "에이전트 초기 설정을 불러오지 못했습니다.",
        ),
      );
    refreshBlogMetrics();
    refreshPerformance(false);
    refreshStrategy(false);
    refreshAutomationStatus(true);
  }, []);

  useEffect(() => {
    if (
      planningRun?.settings &&
      workflowSignature(planningRun.settings) !== workflowSignature(workflow)
    )
      setWorkflow(planningRun.settings);
  }, [planningRun, workflow]);

  async function refreshAutomationStatus(loadWorkspace = false) {
    try {
      const response = await fetch("/api/automation/status", {
        cache: "no-store",
      });
      const data = await readApiJson(response);
      if (!response.ok) return;
      setAutomation(data);
      if (!loadWorkspace) return;
      if (data.configured) {
        setAutomationEnabled(data.enabled ?? true);
        setAutoPublish(data.autoPublish ?? false);
        setWorkflow({
          categoryCount: data.categoryCount,
          keywordsPerCategory: data.keywordsPerCategory,
          articlesPerKeyword: data.articlesPerKeyword,
          dailyArticleLimit: data.dailyArticleLimit,
        });
        setPlan(data.plan || null);
        setTasks(recoverInterruptedTasks(data.tasks || []));
        setBlogMap(data.categoryBlogMap || {});
        setStyleMap(data.categoryStyleMap || {});
        setRevenueGoal({
          monthly: data.revenueGoalMonthly || 100000000,
          months: data.revenueGoalMonths || 24,
        });
        setRevenueStreams(
          Array.isArray(data.revenueStreams) && data.revenueStreams.length
            ? data.revenueStreams
            : ["adsense", "affiliate", "sponsorship", "digital_products"],
        );
        setCostControl({
          estimatedArticleCostWon: data.estimatedArticleCostWon ?? 1000,
          estimatedWeeklyPlanCostWon: data.estimatedWeeklyPlanCostWon ?? 5000,
          estimatedAnalysisCostWon: data.estimatedAnalysisCostWon ?? 2000,
          monthlyFixedCostWon: data.monthlyFixedCostWon ?? 0,
          monthlyAiBudgetWon: data.monthlyAiBudgetWon ?? 100000,
          pauseOnBudget: data.pauseOnBudget ?? true,
        });
      } else {
        let browserWorkspace: any = null;
        const saved = localStorage.getItem("blogger-agent-workspace-v2");
        if (saved)
          try {
            browserWorkspace = JSON.parse(saved);
          } catch {}
        let durableWorkspace: any = null;
        try {
          const localResponse = await fetch("/api/local-workspace", {
            cache: "no-store",
          });
          const localData = await readApiJson(localResponse);
          if (localResponse.ok) durableWorkspace = localData.workspace;
        } catch {}
        const browserTime = Date.parse(browserWorkspace?.savedAt || 0) || 0;
        const durableTime = Date.parse(durableWorkspace?.savedAt || 0) || 0;
        const local =
          durableTime >= browserTime && durableWorkspace
            ? durableWorkspace
            : browserWorkspace;
        if (local) {
          setWorkflow(
            local.planningRun?.settings || local.workflow || DEFAULT_WORKFLOW,
          );
          setPlan(local.plan || null);
          setTasks(recoverInterruptedTasks(local.tasks || []));
          setBlogMap(local.blogMap || {});
          setStyleMap(local.styleMap || {});
          if (local.planningRun) setPlanningRun(local.planningRun);
        } else {
          await restoreSavedResearch(false);
        }
      }
    } catch {}
  }

  async function refreshBlogMetrics() {
    setBlogMetricsError("");
    setBlogMetricsErrorCode("");
    setGoogleConnection("checking");
    try {
      const response = await fetch("/api/blogs", { cache: "no-store" });
      const data = await readApiJson(response);
      if (!response.ok) {
        setBlogMetricsErrorCode(data.code || "BLOGGER_API_REQUEST_FAILED");
        setGoogleConnection(
          data.code === "GOOGLE_LOGIN_REQUIRED" ||
            data.code === "GOOGLE_OAUTH_CONFIG_REQUIRED"
            ? "disconnected"
            : "error",
        );
        throw new Error(data.error || "Blogger 통계를 불러오지 못했습니다.");
      }
      setGoogleConnection("connected");
      setBlogs(data.blogs || []);
      setBlogSummary(
        data.summary || {
          blogCount: 0,
          postCount: 0,
          views7Days: 0,
          views30Days: 0,
          viewsAllTime: 0,
        },
      );
      setBlogMetricsAt(data.fetchedAt || "");
    } catch (error: any) {
      setBlogMetricsError(error.message || "Blogger 연결이 필요합니다.");
      setGoogleConnection((current) =>
        current === "checking" ? "error" : current,
      );
    }
  }

  async function runPreflight() {
    setBusy("첫 글 작성 전 전체 연결 점검 중");
    setMessage("");
    try {
      const response = await fetch("/api/preflight", { cache: "no-store" });
      const data = await readApiJson(response);
      if (!response.ok && !data.checks)
        throw new Error(data.error || "전체 사전 점검을 완료하지 못했습니다.");
      setPreflight(data);
      setMessage(
        `${data.summary}${data.consumesAiCredits === false ? " 이 점검은 AI 크레딧을 사용하지 않았습니다." : ""}`,
      );
      await refreshBlogMetrics();
    } catch (error: any) {
      setMessage(error?.message || "전체 사전 점검에 실패했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function refreshPerformance(runAnalysis: boolean) {
    setPerformanceError("");
    if (runAnalysis) setBusy("Search Console 성과 분석 중");
    try {
      const response = await fetch("/api/performance", {
        method: runAnalysis ? "POST" : "GET",
        cache: "no-store",
      });
      const data = await readApiJson(response);
      if (!response.ok)
        throw new Error(data.error || "성과 학습을 불러오지 못했습니다.");
      setPerformanceReports(data.reports || []);
      if (runAnalysis)
        setMessage(
          "성과 분석이 끝났습니다. 표본이 충분한 학습은 다음 글부터 자동 반영됩니다.",
        );
    } catch (error: any) {
      setPerformanceError(error.message || "Search Console 연결을 확인하세요.");
    } finally {
      if (runAnalysis) setBusy("");
    }
  }

  async function refreshStrategy(runAnalysis: boolean) {
    setStrategyError("");
    if (runAnalysis) setBusy("수익 사령탑 전략 갱신 중");
    try {
      if (runAnalysis) {
        const saved = await fetch("/api/automation/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revenueGoalMonthly: revenueGoal.monthly,
            revenueGoalMonths: revenueGoal.months,
            revenueStreams,
            ...costControl,
          }),
        });
        const savedData = await readApiJson(saved);
        if (!saved.ok)
          throw new Error(savedData.error || "수익 목표 저장 실패");
      }
      const response = await fetch("/api/strategy", {
        method: runAnalysis ? "POST" : "GET",
        cache: "no-store",
      });
      const data = await readApiJson(response);
      if (!response.ok)
        throw new Error(data.error || "수익 전략을 불러오지 못했습니다.");
      setStrategy(data.report || null);
      if (data.config) {
        setRevenueGoal({
          monthly: data.config.revenueGoalMonthly,
          months: data.config.revenueGoalMonths,
        });
        if (Array.isArray(data.config.revenueStreams))
          setRevenueStreams(data.config.revenueStreams);
        setCostControl({
          estimatedArticleCostWon: data.config.estimatedArticleCostWon ?? 1000,
          estimatedWeeklyPlanCostWon:
            data.config.estimatedWeeklyPlanCostWon ?? 5000,
          estimatedAnalysisCostWon:
            data.config.estimatedAnalysisCostWon ?? 2000,
          monthlyFixedCostWon: data.config.monthlyFixedCostWon ?? 0,
          monthlyAiBudgetWon: data.config.monthlyAiBudgetWon ?? 100000,
          pauseOnBudget: data.config.pauseOnBudget ?? true,
        });
      }
      if (runAnalysis)
        setMessage(
          "목표와 실제 AdSense 실적을 기준으로 다음 주 전략을 갱신했습니다.",
        );
    } catch (error: any) {
      setStrategyError(error.message || "수익 사령탑 설정을 확인하세요.");
    } finally {
      if (runAnalysis) setBusy("");
    }
  }

  useEffect(() => {
    tasksRef.current = tasks;
    if (plan || planningRun || tasks.length || Object.keys(blogMap).length) {
      const workspace = {
        workflow,
        plan,
        planningRun,
        tasks,
        blogMap,
        styleMap,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(
        "blogger-agent-workspace-v2",
        JSON.stringify(workspace),
      );
      const timer = window.setTimeout(() => {
        fetch("/api/local-workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(workspace),
        }).catch(() => {});
      }, 250);
      return () => window.clearTimeout(timer);
    }
  }, [workflow, plan, planningRun, tasks, blogMap, styleMap]);

  const connectedModels = useMemo(
    () => settings?.models.filter((m) => settings.connected[m.provider]) || [],
    [settings],
  );
  const stats = useMemo(
    () => ({
      total: tasks.length,
      done: tasks.filter((t) =>
        ["ready", "draft", "published"].includes(t.state),
      ).length,
      drafts: tasks.filter((t) => t.state === "draft").length,
      published: tasks.filter((t) => t.state === "published").length,
    }),
    [tasks],
  );
  const evidenceStats = useMemo(() => {
    const completed = tasks.filter((task) => task.article?.researchAttempts);
    const blocked = tasks.filter((task) => task.state === "source_blocked");
    const attempted = completed.length + blocked.length;
    const firstPass = completed.filter(
      (task) => Number(task.article?.researchAttempts || 0) === 1,
    ).length;
    const retryPass = completed.filter(
      (task) => Number(task.article?.researchAttempts || 0) > 1,
    ).length;
    return {
      attempted,
      firstPass,
      retryPass,
      blocked: blocked.length,
      finalPassRate: attempted
        ? Math.round((completed.length / attempted) * 100)
        : null,
    };
  }, [tasks]);
  const planningProgress = useMemo(() => {
    const categories = planningRun?.draft?.categories || [];
    const keywordCategories = categories.filter(
      (category: any) =>
        Array.isArray(category.keywords) && category.keywords.length,
    ).length;
    const keywords = categories.flatMap(
      (category: any) => category.keywords || [],
    );
    const completedAngles = keywords.filter(
      (keyword: any) =>
        Array.isArray(keyword.angles) &&
        keyword.angles.length === planningRun?.settings.articlesPerKeyword,
    ).length;
    return {
      categories: categories.length,
      keywordCategories,
      keywords: keywords.length,
      completedAngles,
    };
  }, [planningRun]);
  const maxViews30Days = useMemo(
    () => Math.max(1, ...blogs.map((blog) => blog.views30Days)),
    [blogs],
  );
  const maxPostCount = useMemo(
    () => Math.max(1, ...blogs.map((blog) => blog.postCount)),
    [blogs],
  );
  const categoriesByBlog = useMemo(
    () =>
      Object.entries(blogMap).reduce<Record<string, string[]>>(
        (result, [category, blogId]) => {
          if (blogId) (result[blogId] ||= []).push(category);
          return result;
        },
        {},
      ),
    [blogMap],
  );
  const unmappedCategories = useMemo(
    () => plan?.categories.filter((category) => !blogMap[category.name]) || [],
    [plan, blogMap],
  );
  const unmappedBlogGroups = useMemo(() => {
    const groups = new Map<string, Plan["categories"][number]>();
    for (const category of unmappedCategories) {
      const key = category.blogGroupId || category.name;
      if (!groups.has(key)) groups.set(key, category);
    }
    return [...groups.values()];
  }, [unmappedCategories]);

  function selectBlogForGroup(
    category: Plan["categories"][number],
    blogId: string,
  ) {
    const groupNames = category.blogGroupCategories?.length
      ? category.blogGroupCategories
      : [category.name];
    setBlogMap((current) => ({
      ...current,
      ...Object.fromEntries(groupNames.map((name) => [name, blogId])),
    }));
  }

  async function saveSettings(test = false) {
    if (!settings) return;
    setBusy(test ? "API 연결 확인 중" : "설정 저장 중");
    setMessage("");
    const testModels = test
      ? settings.models
          .filter((m) => keys[m.provider] || settings.connected[m.provider])
          .map((m) => m.id)
      : [];
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKeys: keys,
          writerModel: settings.writerModel,
          reviewerModel: settings.reviewerModel,
          styleGuide: settings.styleGuide,
          testModels,
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || "설정 저장 실패");
      const refreshed = await fetch("/api/settings", { cache: "no-store" });
      const refreshedData = await readApiJson(refreshed);
      if (!refreshed.ok)
        throw new Error(refreshedData.error || "저장된 설정 확인 실패");
      setSettings(refreshedData);
      setKeys({ openai: "", anthropic: "", google: "" });
      setMessage(
        test
          ? Object.entries(data.testResults || {})
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")
          : "설정을 저장했습니다.",
      );
    } catch (error: any) {
      setMessage(error?.message || "설정을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function runCompare(mode: "write" | "review") {
    setBusy(mode === "write" ? "세 모델 작성 비교 중" : "세 모델 검수 비교 중");
    setMessage("");
    setCompare([]);
    setCompareMode(mode);
    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          keyword: compareKeyword,
          sources: compareSources,
          styleGuide: settings?.styleGuide,
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok && !data.outputs?.length)
        throw new Error(data.error || "모델 비교 실패");
      setCompare(data.outputs || []);
      if (data.warning) setMessage(data.warning);
    } catch (error: any) {
      setMessage(error?.message || "모델 비교를 완료하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function chooseModel(
    kind: "writerModel" | "reviewerModel",
    model: string,
  ) {
    if (!settings) return;
    setSettings({ ...settings, [kind]: model });
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [kind]: model }),
    });
    setMessage(
      `${kind === "writerModel" ? "작성" : "검수"} 모델을 저장했습니다.`,
    );
  }

  async function createPlan() {
    setMessage("");
    const signature = workflowSignature(workflow);
    const history = {
      categories: plan?.categories.map((category) => category.name) || [],
      recentKeywords: tasks.map((task) => task.keyword),
      recentContent: tasks.map((task) => ({
        category: task.category,
        keyword: task.keyword,
        intent: task.intent,
        angleTitle: task.angle.titleIdea,
        state: task.state,
        articleTitle: task.article?.title || "",
      })),
    };
    const saveRun = (value: PlanningRun | null) => {
      if (value) {
        setPlanningRun(value);
        localStorage.setItem(
          "blogger-agent-planning-run-v1",
          JSON.stringify(value),
        );
      } else clearPlanningRun();
    };
    const postStage = async (body: Record<string, any>) => {
      const response = await fetch("/api/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...workflow, history, ...body }),
      });
      const data = await readApiJson(response);
      if (!response.ok)
        throw new Error(data.error || "주간 계획 단계 실행에 실패했습니다.");
      return data;
    };
    let run = planningRun?.settingsSignature === signature ? planningRun : null;
    if (!run) {
      const now = new Date().toISOString();
      run = {
        version: 1,
        id:
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        settings: workflow,
        settingsSignature: signature,
        draft: null,
        sources: [],
        createdAt: now,
        updatedAt: now,
      };
      saveRun(run);
    }
    try {
      if (!run.draft) {
        setBusy("1/3단계 · 카테고리 조사 중");
        const data = await postStage({ phase: "categories", runId: run.id });
        run = {
          ...run,
          draft: data.draft,
          sources: mergeSources(run.sources, data.sources || []),
          updatedAt: new Date().toISOString(),
        };
        saveRun(run);
      }

      const categories = run.draft.categories as any[];
      for (
        let categoryIndex = 0;
        categoryIndex < categories.length;
        categoryIndex++
      ) {
        const category = categories[categoryIndex];
        if (Array.isArray(category.keywords) && category.keywords.length)
          continue;
        setBusy(
          `2/3단계 · 키워드 조사 ${categoryIndex + 1}/${categories.length} · ${category.name}`,
        );
        const data = await postStage({ phase: "keywords", category });
        category.keywords = data.keywords;
        run = {
          ...run,
          draft: { ...run.draft, categories: [...categories] },
          sources: mergeSources(run.sources, data.sources || []),
          updatedAt: new Date().toISOString(),
        };
        saveRun(run);
      }

      const keywords = categories.flatMap((category, categoryIndex) =>
        category.keywords.map((keyword: any, keywordIndex: number) => ({
          category,
          categoryIndex,
          keyword,
          keywordIndex,
        })),
      );
      let finishedAngles = keywords.filter(
        ({ keyword }) =>
          Array.isArray(keyword.angles) &&
          keyword.angles.length === workflow.articlesPerKeyword,
      ).length;
      for (const item of keywords) {
        if (
          Array.isArray(item.keyword.angles) &&
          item.keyword.angles.length === workflow.articlesPerKeyword
        )
          continue;
        setBusy(
          `3/3단계 · 글 방향 설계 ${finishedAngles + 1}/${keywords.length} · ${item.keyword.keyword}`,
        );
        const data = await postStage({
          phase: "angles",
          category: item.category,
          keyword: item.keyword,
        });
        item.keyword.angles = data.angles;
        finishedAngles += 1;
        run = {
          ...run,
          draft: { ...run.draft, categories: [...categories] },
          updatedAt: new Date().toISOString(),
        };
        saveRun(run);
      }

      setBusy("계획 검증 및 저장 중");
      const data = await postStage({
        phase: "finalize",
        draft: run.draft,
        sources: run.sources,
      });
      const nextPlan = data as Plan;
      const nextTasks: Task[] = data.tasks?.length
        ? data.tasks
        : tasksFromPlan(nextPlan, workflow.dailyArticleLimit);
      const categoryTotal = nextPlan.categories.length;
      const keywordTotal = nextPlan.categories.reduce(
        (sum, category) => sum + category.keywords.length,
        0,
      );
      const total = nextTasks.length;
      setPlan(nextPlan);
      setTasks(nextTasks);
      saveRun(null);
      setMessage(
        `분할 조사와 중간 저장을 마쳤습니다. 품질 기준을 통과한 ${categoryTotal}개 카테고리·${keywordTotal}개 키워드·${total}개 글 작업을 만들었습니다.${data.persistenceWarning ? ` 저장 경고: ${data.persistenceWarning}` : " 검색 원본과 계획을 업데이트와 무관한 저장소에 보관했습니다."}`,
      );
    } catch (error: any) {
      setMessage(
        `${error?.message || "주간 계획을 만들지 못했습니다."} 완료된 단계는 저장했습니다. 같은 버튼을 다시 누르면 실패한 단계부터 이어집니다. 기존 완성 계획은 바뀌지 않았습니다.`,
      );
    } finally {
      setBusy("");
    }
  }

  async function restoreSavedResearch(showMessage = true) {
    if (showMessage) {
      setBusy("저장된 조사 결과 복원 중");
      setMessage("");
    }
    try {
      const response = await fetch("/api/weekly-plan/cache", {
        cache: "no-store",
      });
      const data = await readApiJson(response);
      if (!response.ok) {
        if (showMessage) setMessage(data.error);
        return false;
      }
      const restoredWorkflow = data.settings || workflow;
      const restoredPlan = data as Plan;
      setWorkflow(restoredWorkflow);
      setPlan(restoredPlan);
      setTasks(tasksFromPlan(restoredPlan, restoredWorkflow.dailyArticleLimit));
      if (showMessage)
        setMessage(
          `저장된 ${data.capturedAt ? formatDate(data.capturedAt) : "이전"} 조사 결과를 불러왔습니다. OpenAI API와 웹 검색은 사용하지 않았습니다.`,
        );
      return true;
    } catch (error: any) {
      if (showMessage)
        setMessage(error.message || "저장된 조사 결과를 불러오지 못했습니다.");
      return false;
    } finally {
      if (showMessage) setBusy("");
    }
  }

  async function saveAutomation() {
    if (!settings) return;
    setBusy("자동 실행 설정 저장 중");
    setMessage("");
    try {
      const response = await fetch("/api/automation/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: automationEnabled,
          autoPublish,
          ...workflow,
          writerModel: settings.writerModel || "gpt-5.6-terra",
          reviewerModel: settings.reviewerModel || "gpt-5.6-terra",
          styleGuide: settings.styleGuide,
          categoryBlogMap: blogMap,
          categoryStyleMap: styleMap,
          ...costControl,
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok)
        throw new Error(data.error || "자동 실행 설정 저장 실패");
      setAutomation((current) => ({
        ...current,
        configured: true,
        enabled: automationEnabled,
      }));
      await refreshAutomationStatus(false);
      setMessage("자동 실행 설정을 저장했습니다.");
    } catch (error: any) {
      setMessage(error?.message || "자동 실행 설정을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function produceOne(
    taskId: string,
    recoveryMode?:
      "review_only" | "evidence_repair" | "content_repair" | "manual_review",
  ) {
    const target = tasksRef.current.find((t) => t.id === taskId);
    if (!target) return { ok: false, state: "error" as const };
    const guidance = getReviewGuidance(target);
    const selectedRecoveryMode = recoveryMode || guidance?.retryMode;
    if (selectedRecoveryMode === "manual_review") {
      setMessage(
        "공식·권위 출처가 서로 충돌해 자동으로 한쪽을 선택하지 않았습니다. 글과 충돌 출처를 확인한 뒤 임시저장하세요.",
      );
      return {
        ok: false,
        state: "needs_review" as const,
        code: "MANUAL_REVIEW_REQUIRED",
        status: 409,
        error: "공식·권위 출처 간 충돌",
      };
    }
    setTasks((current) => {
      const next = current.map((t) =>
        t.id === taskId
          ? { ...t, state: "working" as const, error: undefined }
          : t,
      );
      tasksRef.current = next;
      return next;
    });
    const existingArticles = tasksRef.current
      .filter((t) => t.article && t.id !== taskId)
      .map((t) => ({
        title: t.article.title,
        summary: String(t.article.html || "").slice(0, 900),
      }));
    try {
      const response = await fetch("/api/produce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...target,
          existingArticles,
          sources: plan?.sources,
          styleGuide: styleMap[target.category] || settings?.styleGuide,
          recoveryMode: selectedRecoveryMode,
          existingArticle:
            selectedRecoveryMode && target.article ? target.article : undefined,
          recoveryContext:
            selectedRecoveryMode === "evidence_repair"
              ? guidance?.reasons || target.article?.review?.issues || []
              : undefined,
        }),
      });
      const data = await readApiJson(response);
      setTasks((current) => {
        const next = current.map((t) =>
          t.id === taskId
            ? response.ok
              ? { ...t, state: data.status, article: data }
              : {
                  ...t,
                  state:
                    data.code === "SOURCE_BLOCKED"
                      ? ("source_blocked" as const)
                      : ("error" as const),
                  error: data.error,
                }
            : t,
        );
        tasksRef.current = next;
        return next as Task[];
      });
      return {
        ok: response.ok,
        state: response.ok
          ? data.status
          : data.code === "SOURCE_BLOCKED"
            ? ("source_blocked" as const)
            : ("error" as const),
        code: data.code || "",
        status: response.status,
        error: data.error || "",
      };
    } catch (error: any) {
      const detail =
        error?.message || "글 작성 요청 중 연결 오류가 발생했습니다.";
      setTasks((current) => {
        const next = current.map((task) =>
          task.id === taskId
            ? { ...task, state: "error" as const, error: detail }
            : task,
        );
        tasksRef.current = next;
        return next as Task[];
      });
      return {
        ok: false,
        state: "error" as const,
        code: "NETWORK_ERROR",
        status: 0,
        error: detail,
      };
    }
  }

  function requestBatchStop() {
    batchStopRequestedRef.current = true;
    setBatchStopRequested(true);
    setMessage(
      "중지를 요청했습니다. 현재 작성·검수 중인 글 1개만 마무리한 뒤 다음 글을 시작하지 않습니다.",
    );
  }

  function isSystemicProductionError(result: {
    ok: boolean;
    state: string;
    code?: string;
    status?: number;
    error?: string;
  }) {
    if (result.ok || result.state === "source_blocked") return false;
    return (
      [401, 403, 429].includes(Number(result.status)) ||
      /invalid x-api-key|api.?key|authentication|unauthorized|forbidden|credit|billing|quota|rate.?limit/i.test(
        `${result.code || ""} ${result.error || ""}`,
      )
    );
  }

  async function produceNextBatch() {
    const candidates = tasksRef.current.filter(
      (t) =>
        ["waiting", "error"].includes(t.state) ||
        (t.state === "needs_review" &&
          getReviewGuidance(t)?.canRetryAutomatically),
    );
    const ids = [
      ...candidates.filter((task) => task.state === "error"),
      ...candidates.filter((task) => task.state !== "error"),
    ].map((t) => t.id);
    if (!ids.length) return setMessage("작성할 대기 작업이 없습니다.");
    batchStopRequestedRef.current = false;
    setBatchStopRequested(false);
    setBatchRunning(true);
    setMessage("");
    let ready = 0;
    let review = 0;
    let blocked = 0;
    let failed = 0;
    let processed = 0;
    let completedSlots = 0;
    let replacements = 0;
    let stopReason = "";
    for (
      let i = 0;
      i < ids.length && completedSlots < workflow.dailyArticleLimit;
      i += 1
    ) {
      if (batchStopRequestedRef.current) {
        stopReason = "사용자 요청으로 일시정지했습니다.";
        break;
      }
      setBusy(`다음 작업 ${i + 1}/${ids.length} 작성·검수 중`);
      const result = await produceOne(ids[i]);
      processed += 1;
      if (result.ok && result.state === "ready") ready += 1;
      else if (result.ok) review += 1;
      else if (result.state === "source_blocked") {
        blocked += 1;
        replacements += 1;
      } else failed += 1;
      if (result.state !== "source_blocked") completedSlots += 1;
      if (isSystemicProductionError(result)) {
        stopReason =
          "API 인증·결제·사용량과 관련된 공통 오류를 감지해 나머지 글의 실행을 자동으로 멈췄습니다.";
        break;
      }
    }
    setBusy("");
    setBatchRunning(false);
    setBatchStopRequested(false);
    batchStopRequestedRef.current = false;
    await refreshAutomationStatus(false);
    const remaining = Math.max(0, ids.length - processed);
    setMessage(
      `${processed}개를 시도해 오늘 작업 ${completedSlots}개를 채웠습니다. 작성 완료 ${ready}개, 검토 보류 ${review}개, 출처 보강 필요 ${blocked}개, 시스템 오류 ${failed}개입니다.${replacements ? ` 근거 부족 ${replacements}개는 다음 글 방향·키워드로 자동 대체했습니다.` : ""}${stopReason ? ` ${stopReason} 시작하지 않은 ${remaining}개는 대기 상태로 보존했습니다. 설정을 수정한 뒤 이어서 작성 버튼을 누르면 오류 작업부터 계속합니다.` : " 개별 콘텐츠 오류는 해당 작업만 표시하고 나머지 작업을 계속했습니다."}`,
    );
  }

  async function produceReplacementForBlocked(taskId: string) {
    const blockedTask = tasksRef.current.find((task) => task.id === taskId);
    if (!blockedTask) return;
    const eligible = tasksRef.current.filter(
      (task) =>
        task.id !== taskId &&
        ["waiting", "error", "needs_review"].includes(task.state),
    );
    const replacement =
      eligible.find(
        (task) =>
          task.keyword === blockedTask.keyword &&
          task.angle.titleIdea !== blockedTask.angle.titleIdea,
      ) ||
      eligible.find(
        (task) =>
          task.category === blockedTask.category &&
          task.keyword !== blockedTask.keyword,
      ) ||
      eligible[0];
    if (!replacement)
      return setMessage(
        "대체할 다른 글 방향이나 다음 키워드가 없습니다. 다음 주간 계획에서 후보 수를 늘려주세요.",
      );
    setMessage(
      replacement.keyword === blockedTask.keyword
        ? "같은 키워드의 다른 글 방향으로 대체 작성을 시작합니다."
        : `다음 우선순위 키워드 ‘${replacement.keyword}’로 대체 작성을 시작합니다.`,
    );
    const result = await produceOne(replacement.id);
    if (result.ok)
      setMessage(
        `근거 부족 작업 대신 ‘${replacement.keyword}’ 글을 작성했습니다. 기존 차단 작업은 기록으로 남겨 중복 재시도를 막습니다.`,
      );
  }

  async function saveDraft(task: Task) {
    const blogId = task.blogId || blogMap[task.category];
    if (!blogId || !task.article)
      return setMessage(
        "이 카테고리에 사용할 Blogger 블로그를 먼저 선택하세요.",
      );
    setBusy("Blogger 임시글 저장 중");
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          blogId,
          jobId: task.id,
          article: task.article,
          ...task.article,
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok)
        throw new Error(data.error || "Blogger 임시글 저장 실패");
      setTasks((current) =>
        current.map((t) =>
          t.id === task.id
            ? { ...t, state: "draft", blogId, postId: data.id }
            : t,
        ),
      );
      await refreshAutomationStatus(false);
      setMessage(
        data.recoveredDeletedDraft
          ? "Blogger에서 삭제된 임시글을 새로 복구했습니다. 아직 공개되지 않았습니다."
          : data.updated
            ? "수정 내용을 기존 Blogger 임시글에 반영했습니다."
            : "Blogger 임시글로 저장했습니다. 아직 공개되지 않았습니다.",
      );
    } catch (error: any) {
      setMessage(error?.message || "Blogger 임시글을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function publishDraft(task: Task) {
    const blogId = task.blogId || blogMap[task.category];
    if (!blogId || !task.postId) return;
    if (!window.confirm("검토한 이 글을 공개 발행할까요?")) return;
    setBusy("승인된 글 발행 중");
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          blogId,
          postId: task.postId,
          jobId: task.id,
          article: task.article,
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || "Blogger 공개 발행 실패");
      setTasks((current) =>
        current.map((t) =>
          t.id === task.id ? { ...t, state: "published" } : t,
        ),
      );
      await refreshAutomationStatus(false);
      setMessage("승인된 글을 공개했습니다.");
    } catch (error: any) {
      setMessage(error?.message || "Blogger 글을 공개하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  if (!settings)
    return (
      <main>
        <div className="panel dashboardEmpty">
          <h2>{initializationError ? "시작 준비 오류" : "설정 불러오는 중"}</h2>
          {initializationError && (
            <>
              <p>{initializationError}</p>
              <button onClick={() => window.location.reload()}>
                다시 시도
              </button>
            </>
          )}
        </div>
      </main>
    );

  return (
    <main>
      <header>
        <div>
          <span className="eyebrow">WEEKLY EDITORIAL AGENT</span>
          <h1>Blogger 글쓰기 에이전트</h1>
          <p>카테고리·키워드·글 수·일일 작성량을 자유롭게 설정</p>
        </div>
        <a
          className={`google google-${googleConnection}`}
          href="/api/auth/google"
          title={
            googleConnection === "connected"
              ? "클릭하면 Google 계정을 다시 연결합니다."
              : "Google 계정을 연결합니다."
          }
        >
          {googleConnection === "checking"
            ? "Google 연결 확인 중"
            : googleConnection === "connected"
              ? "✓ Google Blogger 연결됨"
              : googleConnection === "error"
                ? "Google 연결 점검"
                : "Google Blogger 연결"}
        </a>
      </header>

      <section className="panel preflightPanel">
        <div className="sectionTitle dashboardTitle">
          <span>점검</span>
          <div>
            <h2>첫 글 작성 전 전체 사전 점검</h2>
            <p>
              API 비용을 쓰기 전에 저장소·모델·Google 인증·Blogger 목록·매핑을
              실제로 확인합니다.
            </p>
          </div>
          <button className="primary" onClick={runPreflight} disabled={!!busy}>
            전체 점검 실행
          </button>
        </div>
        {preflight && (
          <div className="preflightResults">
            <strong
              className={
                preflight.readyForFirstArticle
                  ? "preflightReady"
                  : "preflightBlocked"
              }
            >
              {preflight.summary}
            </strong>
            <div className="preflightGrid">
              {preflight.checks.map((check) => (
                <article className={`preflight-${check.status}`} key={check.id}>
                  <div>
                    <b>
                      {check.status === "pass"
                        ? "정상"
                        : check.status === "warning"
                          ? "확인"
                          : "조치 필요"}
                    </b>
                    <h3>{check.label}</h3>
                  </div>
                  <p>{check.detail}</p>
                  {check.action && <small>{check.action}</small>}
                  {check.diagnostic && (
                    <code>{JSON.stringify(check.diagnostic)}</code>
                  )}
                </article>
              ))}
            </div>
            <small>
              점검 시각{" "}
              {preflight.checkedAt ? formatDate(preflight.checkedAt) : "-"}
              {preflight.consumesAiCredits === false
                ? " · AI API 크레딧 사용 없음"
                : ""}
            </small>
          </div>
        )}
      </section>

      <section className="panel bloggerDashboard">
        <div className="sectionTitle dashboardTitle">
          <span>현황</span>
          <div>
            <h2>운영 중인 Blogger 대시보드</h2>
            <p>연결된 모든 블로그의 게시글 수와 실제 조회수를 비교합니다.</p>
          </div>
          <button onClick={refreshBlogMetrics} disabled={!!busy}>
            통계 새로고침
          </button>
        </div>

        {blogMetricsError ? (
          <div className="dashboardEmpty">
            <strong>
              {googleConnection === "disconnected"
                ? "Blogger 통계를 불러오려면 Google 계정을 연결하세요."
                : "Google 연결은 확인됐지만 Blogger 목록을 불러오지 못했습니다."}
            </strong>
            <p>{blogMetricsError}</p>
            {googleConnection === "disconnected" ? (
              <a className="google" href="/api/auth/google">
                Google Blogger 연결
              </a>
            ) : (
              <button onClick={refreshBlogMetrics} disabled={!!busy}>
                다시 불러오기
              </button>
            )}
            {blogMetricsErrorCode === "BLOGGER_PERMISSION_REQUIRED" && (
              <small className="connectionHint">
                Google Cloud에서 Blogger API가 활성화되어 있는지, 블로그를 만든
                Google 계정으로 로그인했는지 확인하세요.
              </small>
            )}
          </div>
        ) : (
          <>
            <div className="blogKpis">
              <article>
                <small>운영 블로그</small>
                <b>{formatCount(blogSummary.blogCount)}</b>
                <em>개</em>
              </article>
              <article>
                <small>전체 게시글</small>
                <b>{formatCount(blogSummary.postCount)}</b>
                <em>개</em>
              </article>
              <article>
                <small>최근 7일 조회수</small>
                <b>{formatCount(blogSummary.views7Days)}</b>
                <em>회</em>
              </article>
              <article>
                <small>최근 30일 조회수</small>
                <b>{formatCount(blogSummary.views30Days)}</b>
                <em>회</em>
              </article>
              <article>
                <small>누적 조회수</small>
                <b>{formatCount(blogSummary.viewsAllTime)}</b>
                <em>회</em>
              </article>
            </div>

            {blogs.length > 0 ? (
              <>
                <div className="metricCharts">
                  <article className="metricChart">
                    <h3>블로그별 최근 30일 조회수</h3>
                    <p>최근 유입이 많은 블로그 순위를 비교합니다.</p>
                    {[...blogs]
                      .sort((a, b) => b.views30Days - a.views30Days)
                      .map((blog) => (
                        <div className="barRow" key={`views-${blog.id}`}>
                          <span title={blog.name}>{blog.name}</span>
                          <div className="barTrack">
                            <i
                              style={{
                                width: `${Math.max(blog.views30Days ? 3 : 0, (blog.views30Days / maxViews30Days) * 100)}%`,
                              }}
                            />
                          </div>
                          <b>{formatCount(blog.views30Days)}</b>
                        </div>
                      ))}
                  </article>
                  <article className="metricChart postsChart">
                    <h3>블로그별 게시글 수</h3>
                    <p>운영 규모와 콘텐츠 축적 정도를 비교합니다.</p>
                    {[...blogs]
                      .sort((a, b) => b.postCount - a.postCount)
                      .map((blog) => (
                        <div className="barRow" key={`posts-${blog.id}`}>
                          <span title={blog.name}>{blog.name}</span>
                          <div className="barTrack">
                            <i
                              style={{
                                width: `${Math.max(blog.postCount ? 3 : 0, (blog.postCount / maxPostCount) * 100)}%`,
                              }}
                            />
                          </div>
                          <b>{formatCount(blog.postCount)}</b>
                        </div>
                      ))}
                  </article>
                </div>

                <div className="blogSiteGrid">
                  {blogs.map((blog) => (
                    <article className="blogSiteCard" key={blog.id}>
                      <div className="blogSiteTop">
                        <div>
                          <small>운영 중</small>
                          <h3>{blog.name}</h3>
                        </div>
                        <a href={blog.url} target="_blank" rel="noreferrer">
                          사이트 열기
                        </a>
                      </div>
                      {blog.description && <p>{blog.description}</p>}
                      <div className="siteMetrics">
                        <b>
                          {formatCount(blog.postCount)}
                          <small>게시글</small>
                        </b>
                        <b>
                          {formatCount(blog.views7Days)}
                          <small>7일 조회</small>
                        </b>
                        <b>
                          {formatCount(blog.views30Days)}
                          <small>30일 조회</small>
                        </b>
                        <b>
                          {formatCount(blog.viewsAllTime)}
                          <small>누적 조회</small>
                        </b>
                      </div>
                      <div className="siteMeta">
                        <span>
                          게시글 수 대비 30일 조회{" "}
                          {formatCount(blog.viewsPerPost30Days)}
                        </span>
                        <span>최근 업데이트 {formatDate(blog.updated)}</span>
                      </div>
                      <div className="mappedCategories">
                        {categoriesByBlog[blog.id]?.length ? (
                          categoriesByBlog[blog.id].map((category) => (
                            <small key={category}>{category}</small>
                          ))
                        ) : (
                          <small className="unmapped">
                            연결된 카테고리 없음
                          </small>
                        )}
                      </div>
                      {!blog.metricsAvailable && (
                        <em className="metricWarning">
                          조회수 권한을 확인하지 못했습니다.
                        </em>
                      )}
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="dashboardEmpty">
                <strong>현재 계정에 운영 중인 Blogger가 없습니다.</strong>
                <p>
                  먼저 주간 계획을 만들면 카테고리에 맞는 이름과 주소를
                  추천합니다.
                </p>
              </div>
            )}
            {blogMetricsAt && (
              <small className="fetchedAt">
                마지막 조회: {formatDate(blogMetricsAt)}
              </small>
            )}
          </>
        )}

        {unmappedBlogGroups.length > 0 && (
          <div className="blogRecommendations">
            <div>
              <h3>새 Blogger 생성 추천</h3>
              <p>
                비슷한 카테고리 2~4개를 하나의 주제군 Blogger로
                묶었습니다. 추천 이름으로 한 번만 만든 뒤 묶음 전체를
                연결하세요.
              </p>
            </div>
            <div className="recommendationGrid">
              {unmappedBlogGroups.map((category) => (
                <article key={category.blogGroupId || category.name}>
                  <small>
                    {category.blogGroupCategories?.join(" · ") || category.name}
                  </small>
                  <b>
                    {category.suggestedBlogName || `${category.name} 가이드`}
                  </b>
                  <p>{category.suggestedBlogDescription || category.reason}</p>
                  <em>{category.suggestedBlogAddresses?.join(" · ")}</em>
                </article>
              ))}
            </div>
            <a
              className="google"
              href="https://www.blogger.com/"
              target="_blank"
              rel="noreferrer"
            >
              Blogger에서 새 블로그 만들기
            </a>
          </div>
        )}
      </section>

      <section className="panel strategyCommand">
        <div className="sectionTitle dashboardTitle">
          <span>목표</span>
          <div>
            <h2>수익 사령탑</h2>
            <p>
              실제 AdSense 수익·페이지 RPM·검색 성과로 24개월 실행 경로를 매주
              보정합니다.
            </p>
          </div>
          <button
            className="primary"
            onClick={() => refreshStrategy(true)}
            disabled={!!busy}
          >
            목표 저장·전략 갱신
          </button>
        </div>
        <div className="strategyDisclaimer">
          월 1억 원은 보장 예측이 아닌 공격적인 도전 목표입니다. 사령탑은 확인된
          실적만 사용하며, 데이터가 없으면 성공 가능성을 꾸미지 않습니다.
        </div>
        <div className="goalControls">
          <label>
            월 수익 목표 (원)
            <input
              type="number"
              min={100000}
              max={1000000000}
              step={100000}
              value={revenueGoal.monthly}
              onChange={(e) =>
                setRevenueGoal({
                  ...revenueGoal,
                  monthly: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            목표 기간 (개월)
            <input
              type="number"
              min={6}
              max={120}
              value={revenueGoal.months}
              onChange={(e) =>
                setRevenueGoal({
                  ...revenueGoal,
                  months: Number(e.target.value),
                })
              }
            />
          </label>
          <fieldset className="revenueStreamControls">
            <legend>동시 운영할 수익원</legend>
            {[
              ["adsense", "AdSense 광고"],
              ["affiliate", "제휴 링크"],
              ["sponsorship", "협찬·스폰서"],
              ["digital_products", "자료·디지털 상품"],
            ].map(([id, label]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={revenueStreams.includes(id)}
                  onChange={(event) =>
                    setRevenueStreams((current) =>
                      event.target.checked
                        ? [...new Set([...current, id])]
                        : current.filter((item) => item !== id),
                    )
                  }
                />
                {label}
              </label>
            ))}
            <small>
              제휴·협찬·상품은 계정/계약과 고지 문구를 먼저 설정해야 하며, 에이전트가 임의로 가입하거나 허위 추천하지 않습니다.
            </small>
          </fieldset>
        </div>
        <div className="costControls">
          <label>
            글 1개 전체 예상 비용 (조사·작성·검수·최종 감사, 원)
            <input
              type="number"
              min={0}
              step={100}
              value={costControl.estimatedArticleCostWon}
              onChange={(e) =>
                setCostControl({
                  ...costControl,
                  estimatedArticleCostWon: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            주간 조사 1회 예상 비용 (원)
            <input
              type="number"
              min={0}
              step={100}
              value={costControl.estimatedWeeklyPlanCostWon}
              onChange={(e) =>
                setCostControl({
                  ...costControl,
                  estimatedWeeklyPlanCostWon: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            성과(블로그별)·전략 분석 1회 비용 (원)
            <input
              type="number"
              min={0}
              step={100}
              value={costControl.estimatedAnalysisCostWon}
              onChange={(e) =>
                setCostControl({
                  ...costControl,
                  estimatedAnalysisCostWon: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            월 고정 운영비 (원)
            <input
              type="number"
              min={0}
              step={1000}
              value={costControl.monthlyFixedCostWon}
              onChange={(e) =>
                setCostControl({
                  ...costControl,
                  monthlyFixedCostWon: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            월 AI 예산 한도 (원)
            <input
              type="number"
              min={0}
              step={1000}
              value={costControl.monthlyAiBudgetWon}
              onChange={(e) =>
                setCostControl({
                  ...costControl,
                  monthlyAiBudgetWon: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="budgetToggle">
            <input
              type="checkbox"
              checked={costControl.pauseOnBudget}
              onChange={(e) =>
                setCostControl({
                  ...costControl,
                  pauseOnBudget: e.target.checked,
                })
              }
            />
            예산 초과 전 조사·작성·분석 중지
          </label>
        </div>
        {strategyError ? (
          <div className="dashboardEmpty">
            <strong>수익 사령탑 준비가 필요합니다.</strong>
            <p>{strategyError}</p>
          </div>
        ) : strategy ? (
          <>
            <div className="strategyKpis">
              <article>
                <small>최근 30일 수익</small>
                <b>₩{formatCount(strategy.actual.estimatedEarnings)}</b>
              </article>
              <article>
                <small>페이지 RPM</small>
                <b>₩{formatCount(Math.round(strategy.actual.pageRpm))}</b>
              </article>
              <article>
                <small>최근 30일 페이지뷰</small>
                <b>{formatCount(strategy.actual.pageViews)}</b>
              </article>
              <article>
                <small>목표 달성률</small>
                <b>
                  {Math.min(100, strategy.progressPercent || 0).toFixed(3)}%
                </b>
              </article>
              <article>
                <small>판정 · 신뢰도</small>
                <b>
                  {strategy.trajectory} · {strategy.forecastConfidence}
                </b>
              </article>
            </div>
            {strategy.business && (
              <div className="businessPanel">
                <div className="businessHead">
                  <div>
                    <small>REVENUE − ESTIMATED COST</small>
                    <h3>사업 손익·예산 안전장치</h3>
                  </div>
                  <span
                    className={
                      strategy.business.budgetUsedPercent >= 80
                        ? "budgetRisk"
                        : "budgetSafe"
                    }
                  >
                    AI 예산 {strategy.business.budgetUsedPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="businessKpis">
                  <article>
                    <small>총 예상 매출</small>
                    <b>₩{formatCount(strategy.business.grossRevenue)}</b>
                  </article>
                  <article>
                    <small>예상 AI 비용</small>
                    <b>₩{formatCount(strategy.business.estimatedAiCost)}</b>
                  </article>
                  <article>
                    <small>월 고정비</small>
                    <b>₩{formatCount(strategy.business.fixedCost)}</b>
                  </article>
                  <article
                    className={
                      strategy.business.estimatedNetProfit < 0
                        ? "negativeProfit"
                        : "positiveProfit"
                    }
                  >
                    <small>예상 순이익</small>
                    <b>₩{formatCount(strategy.business.estimatedNetProfit)}</b>
                  </article>
                </div>
                <p className="estimateNote">
                  비용은 실제 OpenAI 청구액이 아니라{" "}
                  {strategy.business.costMethod}
                  입니다. 현재 달 처리{" "}
                  {formatCount(strategy.business.productionEvents)}건 · 월 AI
                  예산 ₩{formatCount(strategy.business.monthlyAiBudget)} · 승인
                  사이트 {formatCount(strategy.business.approvedSiteCount)}개
                </p>
                {!!strategy.business.sites.length && (
                  <div className="economicsTableWrap">
                    <table className="economicsTable">
                      <thead>
                        <tr>
                          <th>블로그</th>
                          <th>페이지뷰</th>
                          <th>매출</th>
                          <th>RPM</th>
                          <th>예상 비용</th>
                          <th>예상 순이익</th>
                          <th>판정</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategy.business.sites.map((site) => (
                          <tr key={site.blogId}>
                            <td>
                              <b>{site.blogName}</b>
                              <small>{site.domain}</small>
                            </td>
                            <td>{formatCount(site.pageViews)}</td>
                            <td>₩{formatCount(site.grossRevenue)}</td>
                            <td>₩{formatCount(site.pageRpm)}</td>
                            <td>
                              ₩
                              {formatCount(
                                site.estimatedAiCost + site.allocatedFixedCost,
                              )}
                            </td>
                            <td>₩{formatCount(site.netProfit)}</td>
                            <td>
                              {site.recommendation === "scale"
                                ? "확대"
                                : site.recommendation === "repair"
                                  ? "개선"
                                  : "측정"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {strategy.business.unassignedRevenue > 0 && (
                  <p className="estimateNote">
                    Blogger 도메인과 연결하지 못한 수익: ₩
                    {formatCount(strategy.business.unassignedRevenue)}
                  </p>
                )}
              </div>
            )}
            {strategy.monetization && (
              <div className="businessPanel monetizationPanel">
                <div className="businessHead">
                  <div>
                    <small>MONETIZATION MIX</small>
                    <h3>AdSense 외 수익원 준비</h3>
                  </div>
                </div>
                <div className="businessKpis">
                  {strategy.monetization.streams.map((stream: any) => (
                    <article key={stream.id}>
                      <small>{stream.label}</small>
                      <b>{stream.status}</b>
                    </article>
                  ))}
                </div>
                <p className="estimateNote">
                  {strategy.monetization.disclaimer}
                </p>
                {!!strategy.monetization.nextActions.length && (
                  <ul>
                    {strategy.monetization.nextActions.map((action: string) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="commandSummary">
              <small>이번 주 최우선 목표</small>
              <h3>{strategy.weeklyObjective}</h3>
              <p>{strategy.executiveSummary}</p>
            </div>
            {strategy.growthPortfolio && (
              <div className="growthPortfolio">
                <div className="growthPortfolioHead">
                  <div>
                    <small>FIRST POST → ADSENSE → ₩100M/MONTH</small>
                    <h3>수익 성장 포트폴리오</h3>
                    <p>{strategy.growthPortfolio.planBasis}</p>
                  </div>
                  <div className="portfolioTargets">
                    <b>
                      {strategy.growthPortfolio.approvalTarget}
                      <small>첫 승인 목표</small>
                    </b>
                    <b>
                      {strategy.growthPortfolio.firstRevenueTarget}
                      <small>첫 수익 목표</small>
                    </b>
                  </div>
                </div>
                <div className="progressStrip">
                  <span>
                    <b>
                      {formatCount(
                        strategy.growthPortfolio.progress.publishedArticles,
                      )}
                    </b>{" "}
                    공개 글
                  </span>
                  <span>
                    <b>
                      {formatCount(
                        strategy.growthPortfolio.progress.searchPages,
                      )}
                    </b>{" "}
                    검색 페이지
                  </span>
                  <span>
                    <b>
                      {formatCount(
                        strategy.growthPortfolio.progress.searchImpressions,
                      )}
                    </b>{" "}
                    검색 노출
                  </span>
                  <span>
                    <b>
                      {formatCount(
                        strategy.growthPortfolio.progress.searchClicks,
                      )}
                    </b>{" "}
                    검색 클릭
                  </span>
                </div>
                <div className="growthRoadmap">
                  {strategy.growthPortfolio.phases.map((phase, index) => {
                    const statusLabel = {
                      completed: "달성",
                      in_progress: "진행 중",
                      waiting: "대기",
                      at_risk: "목표일 초과",
                    }[phase.status];
                    return (
                      <article
                        className={`growthPhase phase-${phase.status}`}
                        key={phase.id}
                      >
                        <div className="phaseTop">
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <em>{statusLabel}</em>
                        </div>
                        <h4>{phase.title}</h4>
                        <b className="phaseDate">
                          목표 {formatDate(phase.targetDate)}
                        </b>
                        <small>
                          {phase.expectedWindow} · 이전 단계 후{" "}
                          {phase.periodFromPrevious}
                        </small>
                        <p>{phase.description}</p>
                        <div className="phaseActual">
                          현재: {phase.actualSummary}
                        </div>
                        <details>
                          <summary>달성 조건·관리 지표</summary>
                          <strong>{phase.gate}</strong>
                          <ul>
                            {phase.kpis.map((kpi) => (
                              <li key={kpi}>{kpi}</li>
                            ))}
                          </ul>
                        </details>
                      </article>
                    );
                  })}
                </div>
                <div className="officialTimingNote">
                  {strategy.growthPortfolio.officialReviewNote} 첫 수익 발생
                  시점은 방문자와 광고 노출에 따라 달라지므로 보장 기간이
                  아닙니다.
                </div>
              </div>
            )}
            {!!strategy.approvalReadiness?.length && (
              <div className="approvalPanel">
                <div className="businessHead">
                  <div>
                    <small>INTERNAL READINESS GATE</small>
                    <h3>블로그별 AdSense 신청 준비도</h3>
                  </div>
                  <span>승인을 보장하지 않는 내부 점검</span>
                </div>
                <div className="approvalGrid">
                  {strategy.approvalReadiness.map((blog) => (
                    <article key={blog.blogId}>
                      <div className="approvalScore">
                        <b>{blog.blogName}</b>
                        <strong>{blog.score}%</strong>
                      </div>
                      {blog.checks.map((check) => (
                        <p key={check.id}>
                          <span>{check.passed ? "✓" : "대기"}</span>
                          {check.label}
                          <small>{check.detail}</small>
                        </p>
                      ))}
                    </article>
                  ))}
                </div>
              </div>
            )}
            <div className="strategyColumns">
              <article>
                <h3>24개월 목표 스토리라인</h3>
                <div className="milestoneList">
                  {strategy.milestones.map((item) => (
                    <div key={item.month}>
                      <b>{item.label}</b>
                      <span>월 ₩{formatCount(item.monthlyRevenueTarget)}</span>
                    </div>
                  ))}
                </div>
                <small>목표 곡선이며 실제 수익 예측이 아닙니다.</small>
              </article>
              <article>
                <h3>월 1억에 필요한 페이지뷰</h3>
                {strategy.requiredPageViewsAtActualRpm ? (
                  <p>
                    현재 RPM 기준 약{" "}
                    <b>
                      {formatCount(strategy.requiredPageViewsAtActualRpm)} PV/월
                    </b>
                  </p>
                ) : (
                  <p>실제 RPM 데이터가 없어 시나리오만 표시합니다.</p>
                )}
                <div className="milestoneList">
                  {strategy.rpmScenarios.map((item) => (
                    <div key={item.rpm}>
                      <b>RPM ₩{formatCount(item.rpm)}</b>
                      <span>
                        {formatCount(item.requiredMonthlyPageViews)} PV
                      </span>
                    </div>
                  ))}
                </div>
              </article>
              <article>
                <h3>콘텐츠 자원 배분</h3>
                <div className="allocation">
                  <b>
                    {strategy.contentAllocation.winners}%
                    <small>검증 주제</small>
                  </b>
                  <b>
                    {strategy.contentAllocation.adjacent}%
                    <small>인접 확장</small>
                  </b>
                  <b>
                    {strategy.contentAllocation.experiments}%
                    <small>신규 실험</small>
                  </b>
                </div>
                <p>성과 표본이 충분할 때만 비율을 변경합니다.</p>
              </article>
            </div>
            <div className="actionGrid">
              <article>
                <h3>이번 주 실행 지시</h3>
                {strategy.actionPlan.map((item) => (
                  <div
                    className="actionItem"
                    key={`${item.priority}-${item.action}`}
                  >
                    <b>{item.priority}</b>
                    <p>
                      {item.action}
                      <small>
                        {item.metric} · {item.deadline}
                      </small>
                    </p>
                  </div>
                ))}
              </article>
              <article>
                <h3>중단·정책 안전선</h3>
                {[...strategy.stopRules, ...strategy.policyWarnings].map(
                  (item) => (
                    <p className="warningItem" key={item}>
                      {item}
                    </p>
                  ),
                )}
              </article>
            </div>
            {strategy.analyzedAt && (
              <small className="fetchedAt">
                마지막 전략 갱신: {formatDate(strategy.analyzedAt)}
              </small>
            )}
          </>
        ) : (
          <div className="dashboardEmpty">
            <strong>아직 수익 전략을 계산하지 않았습니다.</strong>
            <p>
              목표를 저장하고 Google 계정을 다시 연결한 뒤 전략을 갱신하세요.
            </p>
          </div>
        )}
      </section>

      <section className="panel performanceLearning">
        <div className="sectionTitle dashboardTitle">
          <span>학습</span>
          <div>
            <h2>조회 성과 학습</h2>
            <p>
              Search Console의 글별 노출·클릭·CTR·순위를 분석해 다음 글을
              보완합니다.
            </p>
          </div>
          <button
            className="primary"
            onClick={() => refreshPerformance(true)}
            disabled={!!busy}
          >
            지금 분석
          </button>
        </div>
        <div className="learningNotice">
          저노출 글도 제외하지 않고 색인·발행 경과일·검색 순위·검색어 범위를
          별도로 진단합니다. 신규 글은 관찰하고, 여러 글에서 반복된 패턴만 다음
          글 학습으로 반영합니다.
        </div>
        {performanceError ? (
          <div className="dashboardEmpty">
            <strong>성과 분석 준비가 필요합니다.</strong>
            <p>{performanceError}</p>
            <p>
              Google 계정을 다시 연결하고 Blogger 주소를 Search Console 속성으로
              등록하세요.
            </p>
          </div>
        ) : performanceReports.length ? (
          <div className="learningGrid">
            {performanceReports.map((report) => (
              <article
                className={`learningCard learning-${report.status}`}
                key={report.blogId}
              >
                <div className="learningTop">
                  <div>
                    <small>
                      {report.status === "ready"
                        ? `학습 가능 · 신뢰도 ${report.learning?.confidence}`
                        : report.status === "insufficient_data"
                          ? "표본 수집 중"
                          : report.status === "property_missing"
                            ? "Search Console 미연결"
                            : report.status === "budget_paused"
                              ? "월 AI 예산으로 분석 보류"
                              : "분석 오류"}
                    </small>
                    <h3>{report.blogName}</h3>
                  </div>
                  {report.analyzedAt && (
                    <em>{formatDate(report.analyzedAt)}</em>
                  )}
                </div>
                {report.summary && (
                  <div className="learningMetrics">
                    <b>
                      {formatCount(report.summary.impressions)}
                      <small>검색 노출</small>
                    </b>
                    <b>
                      {formatCount(report.summary.clicks)}
                      <small>검색 클릭</small>
                    </b>
                    <b>
                      {(report.summary.ctr * 100).toFixed(1)}%<small>CTR</small>
                    </b>
                    <b>
                      {report.summary.position.toFixed(1)}
                      <small>평균 순위</small>
                    </b>
                  </div>
                )}
                {report.learning ? (
                  <>
                    <p className="learningSummary">{report.learning.summary}</p>
                    <div className="learningPatterns">
                      {report.learning.patterns
                        .slice(0, 3)
                        .map((pattern, index) => (
                          <details key={`${report.blogId}-${index}`}>
                            <summary>
                              {pattern.signal} · {pattern.confidence}
                            </summary>
                            <p>
                              <b>근거</b> {pattern.evidence}
                            </p>
                            <p>
                              <b>가설</b> {pattern.hypothesis}
                            </p>
                            <p>
                              <b>다음 글</b> {pattern.action}
                            </p>
                          </details>
                        ))}
                    </div>
                    <div className="guidanceTags">
                      {[
                        ...(report.learning.lowExposureGuidance || []),
                        ...report.learning.topicGuidance,
                        ...report.learning.titleGuidance,
                        ...report.learning.structureGuidance,
                      ]
                        .slice(0, 6)
                        .map((item) => (
                          <small key={item}>{item}</small>
                        ))}
                    </div>
                  </>
                ) : (
                  <p className="learningSummary">
                    {report.message || "아직 분석 결과가 없습니다."}
                  </p>
                )}
                {report.lowExposurePages?.length ? (
                  <div className="lowExposureList">
                    <h4>저노출 글 진단</h4>
                    {report.lowExposurePages.slice(0, 5).map((page) => (
                      <details key={page.url}>
                        <summary>
                          {page.title} · 노출 {formatCount(page.impressions)}
                        </summary>
                        <p>
                          발행 후{" "}
                          {page.ageDays === null
                            ? "확인 불가"
                            : `${page.ageDays}일`}{" "}
                          · 평균 순위{" "}
                          {page.position
                            ? page.position.toFixed(1)
                            : "집계 없음"}
                        </p>
                        <p>{page.signals.join(" · ")}</p>
                        {page.index?.checked && (
                          <p>
                            색인 판정: {page.index.verdict} ·{" "}
                            {page.index.coverageState}
                          </p>
                        )}
                      </details>
                    ))}
                  </div>
                ) : null}
                {report.summary && (
                  <small className="sampleNote">
                    학습 대상 {formatCount(report.eligiblePages || 0)}개 · 표본
                    제외 {formatCount(report.excludedPages || 0)}개 ·{" "}
                    {report.periodStart}~{report.periodEnd}
                  </small>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="dashboardEmpty">
            <strong>아직 저장된 성과 학습이 없습니다.</strong>
            <p>
              Google을 다시 연결하고 Search Console에 블로그를 등록한 뒤 ‘지금
              분석’을 누르세요.
            </p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="sectionTitle">
          <span>01</span>
          <div>
            <h2>API 및 편집 설정</h2>
            <p>
              키는 암호화된 서버 세션에 저장되며 화면으로 다시 표시하지
              않습니다.
            </p>
          </div>
        </div>
        <div className="keyGrid">
          <label>
            OpenAI API 키{" "}
            <small>
              {settings.connected.openai ? "연결 정보 있음" : "미연결"}
            </small>
            <input
              type="password"
              value={keys.openai}
              onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
              placeholder="sk-…"
            />
          </label>
          <label>
            Anthropic API 키{" "}
            <small>
              {settings.connected.anthropic ? "연결 정보 있음" : "미연결"}
            </small>
            <input
              type="password"
              value={keys.anthropic}
              onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })}
              placeholder="sk-ant-…"
            />
          </label>
          <label>
            Gemini API 키{" "}
            <small>
              {settings.connected.google ? "연결 정보 있음" : "미연결"}
            </small>
            <input
              type="password"
              value={keys.google}
              onChange={(e) => setKeys({ ...keys, google: e.target.value })}
              placeholder="AIza…"
            />
          </label>
        </div>
        <div className="modelGrid">
          <label>
            작성 모델
            <select
              value={settings.writerModel}
              onChange={(e) =>
                setSettings({ ...settings, writerModel: e.target.value })
              }
            >
              <option value="">비교 후 선택</option>
              {connectedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            검수 모델
            <select
              value={settings.reviewerModel}
              onChange={(e) =>
                setSettings({ ...settings, reviewerModel: e.target.value })
              }
            >
              <option value="">비교 후 선택</option>
              {connectedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          블로그 편집 가이드
          <textarea
            rows={8}
            value={settings.styleGuide}
            onChange={(e) =>
              setSettings({ ...settings, styleGuide: e.target.value })
            }
          />
        </label>
        <div className="actions">
          <button onClick={() => saveSettings(true)} disabled={!!busy}>
            키 연결 확인
          </button>
          <button
            className="primary"
            onClick={() => saveSettings(false)}
            disabled={!!busy}
          >
            설정 저장
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="sectionTitle">
          <span>02</span>
          <div>
            <h2>작성·검수 모델 비교</h2>
            <p>같은 조건으로 작성 능력과 오류 탐지 능력을 따로 비교합니다.</p>
          </div>
        </div>
        <div className="inputPanel">
          <input
            value={compareKeyword}
            onChange={(e) => setCompareKeyword(e.target.value)}
            placeholder="비교 키워드"
          />
          <textarea
            rows={3}
            value={compareSources}
            onChange={(e) => setCompareSources(e.target.value)}
            placeholder="비교에 사용할 동일 참고자료(선택)"
          />
        </div>
        <div className="actions">
          <button onClick={() => runCompare("write")} disabled={!!busy}>
            작성 능력 비교
          </button>
          <button onClick={() => runCompare("review")} disabled={!!busy}>
            검수 능력 비교
          </button>
        </div>
        {compare.length > 0 && (
          <>
            <p className="previewNotice">
              실제 Blogger 테마에 따라 글꼴과 폭은 달라질 수 있습니다. 아래는
              제목·문단·목록·표의 실제 배치를 판단하기 위한 대표 화면입니다.
            </p>
            <div className="compareGrid">
              {compare.map((x) => (
                <article key={x.model} className="compareCard">
                  <div className="sampleBadge">
                    <b>익명 샘플 {x.id}</b>
                    <small>
                      {compareMode === "write"
                        ? "작성 결과 미리보기"
                        : `검수 점수 ${x.parsed?.score ?? "-"}`}
                    </small>
                  </div>
                  {!x.ok && (
                    <div className="previewUnavailable">
                      이 모델만 비교에 실패했습니다: {x.error}
                    </div>
                  )}
                  {compareMode === "review" && x.parsed?.errors?.length > 0 && (
                    <div className="reviewFindings">
                      <strong>찾아낸 문제</strong>
                      <ul>
                        {x.parsed.errors.map((error: string, index: number) => (
                          <li key={`${error}-${index}`}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {x.preview?.html ? (
                    <div className="bloggerPreview">
                      <div className="bloggerPreviewBar">
                        <span>BLOGGER PREVIEW</span>
                        <i />
                        <i />
                        <i />
                      </div>
                      <div className="bloggerPost">
                        <small>정보 · 방금 전</small>
                        <h2>{x.preview.title}</h2>
                        <div
                          className="bloggerPostBody"
                          dangerouslySetInnerHTML={{ __html: x.preview.html }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="previewUnavailable">
                      미리보기 형식을 만들지 못했습니다. 아래 원문을 확인하세요.
                    </div>
                  )}
                  <details className="rawCompareOutput">
                    <summary>
                      {compareMode === "write"
                        ? "HTML 원문 보기"
                        : "검수 JSON 원문 보기"}
                    </summary>
                    <pre>
                      {x.parsed ? JSON.stringify(x.parsed, null, 2) : x.text}
                    </pre>
                  </details>
                  {x.ok && (
                    <div className="actions">
                      {compareMode === "write" ? (
                        <button
                          onClick={() => chooseModel("writerModel", x.model)}
                        >
                          샘플 {x.id}를 작성 모델로
                        </button>
                      ) : (
                        <button
                          onClick={() => chooseModel("reviewerModel", x.model)}
                        >
                          샘플 {x.id}를 검수 모델로
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="sectionTitle">
          <span>03</span>
          <div>
            <h2>콘텐츠 수량과 자동 운영</h2>
            <p>
              아래 값은 언제든 변경할 수 있으며 다음 주간 계획부터 적용됩니다.
            </p>
          </div>
        </div>
        <div className="modelGrid">
          <label>
            선정할 카테고리 수
            <input
              type="number"
              min="1"
              max="20"
              value={workflow.categoryCount}
              onChange={(e) =>
                setWorkflow({
                  ...workflow,
                  categoryCount: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            카테고리별 키워드 수
            <input
              type="number"
              min="1"
              max="20"
              value={workflow.keywordsPerCategory}
              onChange={(e) =>
                setWorkflow({
                  ...workflow,
                  keywordsPerCategory: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            키워드별 작성 글 수
            <input
              type="number"
              min="1"
              max="5"
              value={workflow.articlesPerKeyword}
              onChange={(e) =>
                setWorkflow({
                  ...workflow,
                  articlesPerKeyword: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            하루 자동 작성량
            <input
              type="number"
              min="1"
              max="20"
              value={workflow.dailyArticleLimit}
              onChange={(e) =>
                setWorkflow({
                  ...workflow,
                  dailyArticleLimit: Number(e.target.value),
                })
              }
            />
          </label>
        </div>
        <p>
          현재 설정 상한: 최대{" "}
          {workflow.categoryCount *
            workflow.keywordsPerCategory *
            workflow.articlesPerKeyword}
          개 글 · 하루 {workflow.dailyArticleLimit}개 · 모두 통과할 경우 약{" "}
          {Math.ceil(
            (workflow.categoryCount *
              workflow.keywordsPerCategory *
              workflow.articlesPerKeyword) /
              Math.max(1, workflow.dailyArticleLimit),
          )}
          일 소요
        </p>
        <label className="automationToggle">
          <input
            type="checkbox"
            checked={automationEnabled}
            onChange={(e) => setAutomationEnabled(e.target.checked)}
          />
          <span>
            <b>{automationEnabled ? "예약 자동 실행 켜짐" : "긴급 중지"}</b>
            <small>
              끄고 저장하면 주간 조사·일일 작성·성과 분석 예약을 실행하지
              않습니다.
            </small>
          </span>
        </label>
        <label className="automationToggle">
          <input
            type="checkbox"
            checked={autoPublish}
            onChange={(e) => setAutoPublish(e.target.checked)}
          />
          <span>
            <b>{autoPublish ? "검증 통과 글 자동공개" : "Blogger 임시저장"}</b>
            <small>
              자동공개를 켜도 작성·검수·근거·현재성 기준을 모두 통과한 글만
              공개하며 실패한 글은 공개하지 않습니다.
            </small>
          </span>
        </label>
        {!!automation.readiness?.length && (
          <div className="operationsHealth">
            <div className="operationsHead">
              <div>
                <small>AUTOMATION HEALTH</small>
                <h3>무인 운영 준비 상태</h3>
              </div>
              <b
                className={
                  automation.readyForUnattendedRun
                    ? "healthReady"
                    : "healthRisk"
                }
              >
                {automation.readyForUnattendedRun ? "준비 완료" : "설정 필요"}
              </b>
            </div>
            <div className="healthGrid">
              {automation.readiness.map((item) => (
                <article key={item.id}>
                  <span>{item.ready ? "✓" : "!"}</span>
                  <div>
                    <b>{item.label}</b>
                    <small>{item.detail}</small>
                  </div>
                </article>
              ))}
            </div>
            {automation.operational && (
              <div className="operationsCounts">
                <span>대기 {formatCount(automation.operational.waiting)}</span>
                <span>
                  검토 필요 {formatCount(automation.operational.needs_review)}
                </span>
                <span>임시글 {formatCount(automation.operational.draft)}</span>
                <span>
                  공개 {formatCount(automation.operational.published)}
                </span>
                <span>
                  재시도 중단{" "}
                  {formatCount(automation.operational.blocked_errors)}
                </span>
                <span>
                  출처 보강 필요{" "}
                  {formatCount(automation.operational.source_blocked)}
                </span>
                <span>
                  미매핑 {formatCount(automation.operational.unmapped)}
                </span>
              </div>
            )}
            {!!automation.auditEvents?.length && (
              <details className="auditTrail">
                <summary>최근 운영 기록 보기</summary>
                {automation.auditEvents.slice(0, 8).map((event, index) => (
                  <p key={`${event.action}-${event.entityId}-${index}`}>
                    <b>
                      {{
                        automation_config_updated: "자동화 설정 변경",
                        draft_created: "Blogger 임시글 생성",
                        draft_reused: "기존 임시글 재사용",
                        draft_updated: "Blogger 임시글 수정 반영",
                        draft_recreated: "삭제된 임시글 복구 생성",
                        post_published: "게시글 공개",
                      }[event.action] || event.action}
                    </b>
                    <span>{event.detail?.title || event.entityId || "-"}</span>
                    <small>{formatDate(event.createdAt)}</small>
                  </p>
                ))}
              </details>
            )}
            {!!automation.runs?.length &&
              automation.runs.some((run) =>
                ["failed", "partial"].includes(run.status),
              ) && (
                <p className="healthWarning">
                  최근 자동 실행에 실패 또는 부분 실패가 있습니다. 제작 대기열의
                  오류 메시지를 확인하세요.
                </p>
              )}
          </div>
        )}
        <p>
          {automation.configured
            ? `${automation.schedule?.weekly || "매주 월요일"} 조사 · ${automation.schedule?.daily || "매일"} 작성`
            : "DATABASE_URL과 CRON_SECRET을 설정하면 화면을 열지 않아도 실행됩니다."}
        </p>
        <div className="actions">
          {!automation.configured && !plan && (
            <button onClick={() => restoreSavedResearch()} disabled={!!busy}>
              저장된 조사 결과 불러오기
            </button>
          )}
          <button
            onClick={saveAutomation}
            disabled={!!busy || !automation.configured}
          >
            수량·자동화 설정 저장
          </button>
          <button
            className="primary"
            onClick={createPlan}
            disabled={!!busy || !settings.connected.openai}
          >
            {planningRun?.settingsSignature === workflowSignature(workflow)
              ? "저장된 지점부터 계획 계속 만들기"
              : "새로 웹 조사해 계획 만들기"}
          </button>
          {planningRun && (
            <button
              onClick={() => {
                clearPlanningRun();
                setMessage(
                  "진행 중이던 미완성 계획만 폐기했습니다. 기존 완성 계획과 글 작업은 유지됩니다.",
                );
              }}
              disabled={!!busy}
            >
              진행 중 계획 폐기
            </button>
          )}
        </div>
        {planningRun?.settingsSignature === workflowSignature(workflow) && (
          <p className="healthWarning">
            진행 중 계획 자동 저장됨 · 카테고리 {planningProgress.categories}개
            · 키워드 조사 {planningProgress.keywordCategories}/
            {planningProgress.categories || workflow.categoryCount}개 카테고리 ·
            글 방향 {planningProgress.completedAngles}/
            {planningProgress.keywords || "대기"}개 키워드. 브라우저나 컴퓨터를
            껐다가 다시 실행해도 이 지점부터 이어집니다.
          </p>
        )}
        <small>
          새 조사는 카테고리 → 카테고리별 키워드 → 키워드별 글 방향으로 나눠
          실행되며 OpenAI API 비용이 발생합니다. 각 단계가 끝날 때마다
          저장하므로 시간 초과 시 완료 구간을 다시 조사하지 않습니다.
        </small>
      </section>

      {plan && (
        <>
          <section className="panel">
            <div className="sectionTitle">
              <span>04</span>
              <div>
                <h2>{plan.weekLabel}</h2>
                <p>{plan.marketSummary}</p>
              </div>
            </div>
            <div className="categoryGrid">
              {plan.qualityGate && (
                <div className="qualityGate">
                  <strong>
                    품질 게이트 통과: 카테고리{" "}
                    {plan.qualityGate.selectedCategories}/
                    {plan.qualityGate.requestedCategories} · 키워드{" "}
                    {plan.qualityGate.selectedKeywords}개
                    {typeof plan.qualityGate.selectedRealtimeCategories ===
                      "number" && (
                      <>
                        {" "}
                        · 실시간 관심 카테고리{" "}
                        {plan.qualityGate.selectedRealtimeCategories}/
                        {plan.qualityGate.realtimeTarget}
                      </>
                    )}
                  </strong>
                  <p>{plan.qualityGate.rule}</p>
                  {plan.qualityGate.rejected.length > 0 && (
                    <details>
                      <summary>
                        기준 미달로 제외한 후보{" "}
                        {plan.qualityGate.rejected.length}개
                      </summary>
                      <ul>
                        {plan.qualityGate.rejected.map((item, index) => (
                          <li key={`${item.type}:${item.name}:${index}`}>
                            {item.name} — {item.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              {plan.categories.map((category) => (
                <article className="categoryCard" key={category.name}>
                  <div className="keywordTop">
                    <strong>{category.name}</strong>
                    <b>
                      {category.contentMode === "realtime"
                        ? "실시간 관심"
                        : "장기 검색"}{" "}
                      · 기회 {category.priorityScore ?? "-"} · {category.trend}
                    </b>
                  </div>
                  {(category.audience || category.sitePurpose) && (
                    <div className="briefCard">
                      <small>대상 독자: {category.audience}</small>
                      <p>블로그 핵심 목적: {category.sitePurpose}</p>
                    </div>
                  )}
                  <p>{category.reason}</p>
                  {category.suggestedBlogName && (
                    <div className="inputPanel">
                      <small>
                        함께 운영할 카테고리: {category.blogGroupCategories?.join(" · ") || category.name}
                      </small>
                      <b>추천 이름: {category.suggestedBlogName}</b>
                      <small>{category.suggestedBlogDescription}</small>
                      <small>
                        주소 후보:{" "}
                        {category.suggestedBlogAddresses?.join(" · ")}
                      </small>
                      <a
                        href="https://www.blogger.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Blogger에서 새 블로그 만들기
                      </a>
                    </div>
                  )}
                  <label>
                    운영할 Blogger
                    <select
                      value={blogMap[category.name] || ""}
                      onChange={(e) =>
                        selectBlogForGroup(category, e.target.value)
                      }
                    >
                      <option value="">블로그 선택</option>
                      {blogs.map((blog) => (
                        <option key={blog.id} value={blog.id}>
                          {blog.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>
                    블로그 자체 생성은 Blogger API에서 지원하지 않습니다. 위
                    링크에서 한 번 만든 뒤 다시 연결하세요.
                  </small>
                  <label>
                    이 블로그 전용 문체
                    <textarea
                      rows={4}
                      value={styleMap[category.name] || settings.styleGuide}
                      onChange={(e) =>
                        setStyleMap({
                          ...styleMap,
                          [category.name]: e.target.value,
                        })
                      }
                    />
                  </label>
                  <ul>
                    {category.keywords.map((keyword) => (
                      <li key={keyword.keyword}>
                        <strong>{keyword.keyword}</strong>{" "}
                        <small>
                          · 기회 {keyword.priorityScore ?? "-"} ·{" "}
                          {keyword.intent} · {keyword.clusterRole || "클러스터"}{" "}
                          · {keyword.trend}
                          {keyword.contentMode === "realtime" && (
                            <>
                              {" "}
                              · {keyword.freshnessWindowHours || 24}시간마다
                              현재성 확인
                            </>
                          )}
                        </small>
                        <details>
                          <summary>선정 근거와 글 브리프</summary>
                          <p>{keyword.reason}</p>
                          {keyword.angles.map((angle) => (
                            <div className="briefCard" key={angle.titleIdea}>
                              <b>{angle.titleIdea}</b>
                              <small>{angle.readerSituation}</small>
                              <p>{angle.searchQuestion}</p>
                              <p>
                                <strong>답변 약속:</strong>{" "}
                                {angle.answerPromise}
                              </p>
                              <p>
                                <strong>고유 가치:</strong> {angle.uniqueValue}
                              </p>
                            </div>
                          ))}
                        </details>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="sectionTitle">
              <span>05</span>
              <div>
                <h2>제작 대기열</h2>
                <p>
                  설정한 하루 작성량만큼 처리하고, 남은 작업은 다음 날짜로
                  이어집니다. 자료 조사·독립 검수 후 Blogger 임시글로 저장하며
                  공개는 승인한 글만 가능합니다.
                </p>
              </div>
            </div>
            <div className="stats">
              <b>
                {stats.total}
                <small>전체</small>
              </b>
              <b>
                {stats.done}
                <small>작성 완료</small>
              </b>
              <b>
                {stats.drafts}
                <small>임시저장</small>
              </b>
              <b>
                {stats.published}
                <small>공개</small>
              </b>
            </div>
            <div className="qualityGate">
              <strong>실제 근거 기준 운영 검증</strong>
              {evidenceStats.attempted ? (
                <p>
                  실제 시도 {evidenceStats.attempted}건 · 1차 통과{" "}
                  {evidenceStats.firstPass}건 · 보강 검색 후 통과{" "}
                  {evidenceStats.retryPass}건 · 근거 차단{" "}
                  {evidenceStats.blocked}건 · 최종 통과율{" "}
                  {evidenceStats.finalPassRate}%
                </p>
              ) : (
                <p>
                  아직 실제 작성 표본이 없습니다. 10건 이상 작성하면 이 수치로
                  근거 기준이 과한지 판단하세요. 목표는 보강 검색 포함 최종
                  통과율 90% 이상, 근거 차단률 10% 이하입니다.
                </p>
              )}
            </div>
            <div className="dayTabs">
              {batchRunning ? (
                <button
                  className="publish"
                  onClick={requestBatchStop}
                  disabled={batchStopRequested}
                >
                  {batchStopRequested
                    ? "현재 글 완료 후 중지 예정"
                    : "새 작업 시작 일시정지"}
                </button>
              ) : (
                <button
                  onClick={produceNextBatch}
                  disabled={
                    !!busy || !settings.writerModel || !settings.reviewerModel
                  }
                >
                  {tasks.some((task) => task.state === "error")
                    ? "오류 작업부터 이어서 "
                    : "다음 "}
                  {Math.min(
                    workflow.dailyArticleLimit,
                    tasks.filter(
                      (t) =>
                        ["waiting", "error"].includes(t.state) ||
                        (t.state === "needs_review" &&
                          getReviewGuidance(t)?.canRetryAutomatically),
                    ).length,
                  )}
                  개 작성
                </button>
              )}
            </div>
            <small>
              일시정지는 진행 중인 API 요청 1개를 안전하게 마친 뒤 적용됩니다.
              완료된 글은 유지되고 오류·미시작 글만 다음 실행 대상으로 남습니다.
            </small>
            <div className="queue">
              {tasks.map((task) => (
                <article key={task.id} className={`task task-${task.state}`}>
                  <div className="taskBody">
                    <small>
                      {task.scheduledDate || `${task.day + 1}일차`} ·{" "}
                      {task.category} · {task.intent}
                      {task.angle.contentMode === "realtime"
                        ? ` · 실시간 관심 · ${task.angle.freshnessWindowHours || 24}시간 현재성 확인`
                        : " · 장기 검색"}
                    </small>
                    <h3>{task.article?.title || task.angle.titleIdea}</h3>
                    <p>
                      {task.keyword} — {task.angle.purpose}
                    </p>
                    {task.article?.review && (
                      <em>
                        종합 {task.article.review.overallScore} · 사실{" "}
                        {task.article.review.factualScore} · 근거{" "}
                        {task.article.review.evidenceScore} · 유용성{" "}
                        {task.article.review.usefulnessScore} · 독창 가치{" "}
                        {task.article.review.originalValueScore}
                      </em>
                    )}
                    {task.error && <em>{task.error}</em>}
                    {getReviewGuidance(task) && (
                      <div
                        className={`reviewGuidance reviewGuidance-${getReviewGuidance(task)!.kind}`}
                      >
                        <strong>
                          자동 판정: {getReviewGuidance(task)!.label}
                        </strong>
                        <p>{getReviewGuidance(task)!.summary}</p>
                        <small>
                          권장 행동: {getReviewGuidance(task)!.actionLabel}
                        </small>
                        {getReviewGuidance(task)!.reasons.length > 0 && (
                          <details>
                            <summary>자동 판정 근거 보기</summary>
                            <ul>
                              {getReviewGuidance(task)!.reasons.map(
                                (reason) => (
                                  <li key={reason}>{reason}</li>
                                ),
                              )}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}
                    {task.state === "source_blocked" && (
                      <p className="taskHint">
                        이 작업만 격리했습니다. 같은 키워드의 다른 글 방향을
                        먼저 찾고, 없으면 다음 우선순위 키워드로 대체할 수
                        있습니다.
                      </p>
                    )}
                    {task.article && (
                      <details
                        open={
                          task.state === "needs_review" &&
                          Number(task.article.review?.overallScore || 0) === 0
                        }
                      >
                        <summary>
                          {Number(task.article.review?.overallScore || 0) === 0
                            ? "초안 생성 완료 · 자동 검수 재시도 필요"
                            : "작성된 글 검토·편집"}
                        </summary>
                        <label>
                          제목
                          <input
                            value={task.article.title}
                            onChange={(e) =>
                              setTasks((current) =>
                                current.map((t) =>
                                  t.id === task.id
                                    ? {
                                        ...t,
                                        article: {
                                          ...t.article,
                                          title: e.target.value,
                                          manualEdited: true,
                                        },
                                      }
                                    : t,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          본문 HTML
                          <textarea
                            rows={16}
                            value={task.article.html}
                            onChange={(e) =>
                              setTasks((current) =>
                                current.map((t) =>
                                  t.id === task.id
                                    ? {
                                        ...t,
                                        article: {
                                          ...t.article,
                                          html: e.target.value,
                                          manualEdited: true,
                                        },
                                      }
                                    : t,
                                ),
                              )
                            }
                          />
                        </label>
                        {task.article.manualEdited && (
                          <div className="learningNotice">
                            제목 또는 본문을 직접 수정했습니다. 아래 자동 점수와
                            기술 진단은 수정 전 원고 기준이므로 공개 전에 변경
                            내용을 직접 다시 확인하세요.
                          </div>
                        )}
                        {task.article.titleCandidates?.length > 0 && (
                          <details>
                            <summary>제목 후보 4개와 선택 근거</summary>
                            <div className="titleCandidateGrid">
                              {task.article.titleCandidates.map(
                                (candidate: any) => (
                                  <div
                                    key={`${candidate.strategy}:${candidate.title}`}
                                  >
                                    <small>
                                      {TITLE_STRATEGY_LABELS[
                                        candidate.strategy
                                      ] || candidate.strategy}
                                    </small>
                                    <b>{candidate.title}</b>
                                    <p>{candidate.queryFit}</p>
                                    <p>본문 약속: {candidate.promise}</p>
                                    <em>
                                      위험 점검: {candidate.risk || "없음"}
                                    </em>
                                  </div>
                                ),
                              )}
                            </div>
                            <p>
                              <strong>선택 이유:</strong>{" "}
                              {task.article.titleSelectionReason}
                            </p>
                            {task.article.review.titleAssessment && (
                              <p>
                                최종 제목 평가 · 질문 일치{" "}
                                {task.article.review.titleAssessment.queryMatch}{" "}
                                · 구체성{" "}
                                {
                                  task.article.review.titleAssessment
                                    .specificity
                                }{" "}
                                · 정확성{" "}
                                {task.article.review.titleAssessment.accuracy} ·
                                차별성{" "}
                                {
                                  task.article.review.titleAssessment
                                    .distinctiveness
                                }{" "}
                                · 간결성{" "}
                                {task.article.review.titleAssessment.concision}
                              </p>
                            )}
                          </details>
                        )}
                        {task.article.autoRepairs?.length > 0 && (
                          <details>
                            <summary>
                              자동 보정 {task.article.autoRepairs.length}건
                            </summary>
                            <ul>
                              {task.article.autoRepairs.map((item: string) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {task.article.review.issues?.length > 0 && (
                          <ul>
                            {task.article.review.issues.map((issue: string) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        )}
                        <div className="qualityScoreGrid">
                          {[
                            ["사실성", task.article.review.factualScore],
                            ["근거성", task.article.review.evidenceScore],
                            ["유용성", task.article.review.usefulnessScore],
                            ["검색 의도", task.article.review.intentScore],
                            [
                              "독창 가치",
                              task.article.review.originalValueScore,
                            ],
                            ["가독성", task.article.review.readabilityScore],
                            [
                              "제목 정확성",
                              task.article.review.titleAccuracyScore,
                            ],
                            ["완결성", task.article.review.completenessScore],
                          ].map(([label, value]) => (
                            <b key={String(label)}>
                              {value ?? "-"}
                              <small>{label}</small>
                            </b>
                          ))}
                        </div>
                        {task.article.contentDiagnostics && (
                          <div className="craftDiagnostics">
                            <strong>제목·본문 기술 진단</strong>
                            <span>
                              제목 {task.article.contentDiagnostics.titleLength}
                              자
                            </span>
                            <span>
                              제목 유사도{" "}
                              {(
                                task.article.contentDiagnostics
                                  .titleSimilarity * 100
                              ).toFixed(1)}
                              %
                            </span>
                            <span>
                              본문 유사도{" "}
                              {(
                                task.article.contentDiagnostics.bodySimilarity *
                                100
                              ).toFixed(1)}
                              %
                            </span>
                            <span>
                              문단{" "}
                              {task.article.contentDiagnostics.paragraphCount}개
                            </span>
                            <span>
                              소제목{" "}
                              {task.article.contentDiagnostics.headingCount}개
                            </span>
                            <span>
                              긴 문단{" "}
                              {
                                task.article.contentDiagnostics
                                  .longParagraphCount
                              }
                              개
                            </span>
                            <span>
                              키워드{" "}
                              {task.article.contentDiagnostics.keywordMentions}
                              회
                            </span>
                            <span>
                              출처 링크{" "}
                              {task.article.contentDiagnostics.sourceLinkCount}
                              개
                            </span>
                          </div>
                        )}
                        {task.angle.mustCover?.length ? (
                          <div className="qualityGate">
                            <strong>이 글이 반드시 답해야 하는 항목</strong>
                            <ul>
                              {task.angle.mustCover.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {task.article.valueAdd && (
                          <div className="qualityGate">
                            <strong>
                              추가 독자 가치: {task.article.valueAdd.type}
                            </strong>
                            <p>{task.article.valueAdd.description}</p>
                          </div>
                        )}
                        {task.article.researchDossier && (
                          <details>
                            <summary>검증 조사 문서 보기</summary>
                            <p>{task.article.researchDossier.directAnswer}</p>
                            <small>
                              확인일 {task.article.researchDossier.checkedAt} ·
                              검증 주장{" "}
                              {task.article.researchDossier.claims?.length || 0}
                              개
                            </small>
                            {task.article.evidencePolicy && (
                              <p>
                                적용 기준: {task.article.evidencePolicy.label} ·
                                독립 출처 {task.article.evidencePolicy.minimumDomains}
                                곳 · 검증 주장{" "}
                                {task.article.evidencePolicy.minimumClaims}개 ·
                                핵심 항목{" "}
                                {
                                  task.article.evidencePolicy
                                    .minimumSupportedRequirements
                                }
                                개
                                {task.article.evidencePolicy.primaryRequired
                                  ? " · 1차 출처 필수"
                                  : " · 공식 원문 1곳이면 독립 출처 예외"}
                              </p>
                            )}
                            {task.article.researchDossier.coverage?.length >
                              0 && (
                              <p>
                                작성 전 근거 게이트 · 필수 항목{" "}
                                {
                                  task.article.researchDossier.coverage.filter(
                                    (item: any) => item.supported,
                                  ).length
                                }
                                /{task.article.researchDossier.coverage.length}
                                개 근거 연결
                              </p>
                            )}
                            {task.article.coverageMap?.length > 0 && (
                              <p>
                                작성 반영 확인 · 필수 항목{" "}
                                {
                                  task.article.coverageMap.filter(
                                    (item: any) => item.addressed,
                                  ).length
                                }
                                /{task.article.coverageMap.length}개 본문 반영 ·
                                사용 근거 {task.article.usedClaimIds?.length || 0}
                                개
                              </p>
                            )}
                            {task.article.researchDossier.conflicts?.length >
                              0 && (
                              <p>
                                출처 차이:{" "}
                                {task.article.researchDossier.conflicts.join(
                                  " · ",
                                )}
                              </p>
                            )}
                            {task.article.researchDossier.unknowns?.length >
                              0 && (
                              <p>
                                확인 불가:{" "}
                                {task.article.researchDossier.unknowns.join(
                                  " · ",
                                )}
                              </p>
                            )}
                          </details>
                        )}
                        {task.article.evidenceAudit && (
                          <div className="qualityGate">
                            <strong>
                              최종 웹 근거 감사{" "}
                              {task.article.evidenceAudit.evidenceScore}점 ·{" "}
                              {task.article.evidenceAudit.passed
                                ? "통과"
                                : "재검토 필요"}
                            </strong>
                            <p>
                              독립 확인 출처{" "}
                              {task.article.evidenceAudit.checkedSources
                                ?.length || 0}
                              개
                            </p>
                          </div>
                        )}
                        <div className="sources">
                          {task.article.sources?.map((source: any) => (
                            <a
                              key={source.url}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {source.title}
                            </a>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="taskActions">
                    <span>{task.state}</span>
                    {["waiting", "error", "source_blocked"].includes(
                      task.state,
                    ) && (
                      <button
                        onClick={() => produceOne(task.id)}
                        disabled={!!busy}
                      >
                        {task.state === "source_blocked"
                          ? "근거 보강 재시도"
                          : "작성·검수"}
                      </button>
                    )}
                    {task.state === "needs_review" &&
                      getReviewGuidance(task)?.canRetryAutomatically && (
                        <button
                          onClick={() =>
                            produceOne(
                              task.id,
                              getReviewGuidance(task)!.retryMode,
                            )
                          }
                          disabled={!!busy}
                        >
                          {getReviewGuidance(task)!.actionLabel}
                        </button>
                      )}
                    {task.state === "ready" && (
                      <button onClick={() => saveDraft(task)} disabled={!!busy}>
                        Blogger 임시저장
                      </button>
                    )}
                    {task.state === "needs_review" && task.article && (
                      <button onClick={() => saveDraft(task)} disabled={!!busy}>
                        {getReviewGuidance(task)?.canRetryAutomatically
                          ? "현재 초안을 Blogger 임시저장"
                          : getReviewGuidance(task)?.actionLabel ||
                            "검토 필요 글도 Blogger 임시저장"}
                      </button>
                    )}
                    {task.state === "source_blocked" && (
                      <button
                        onClick={() => produceReplacementForBlocked(task.id)}
                        disabled={!!busy}
                      >
                        다른 글 방향·다음 키워드로 대체
                      </button>
                    )}
                    {task.state === "draft" && (
                      <>
                        {task.angle.contentMode === "realtime" && (
                          <button
                            onClick={() => produceOne(task.id)}
                            disabled={!!busy}
                          >
                            실시간 정보 다시 확인·재작성
                          </button>
                        )}
                        <button
                          onClick={() => saveDraft(task)}
                          disabled={!!busy}
                        >
                          수정본 임시저장
                        </button>
                        <button
                          className="publish"
                          onClick={() => publishDraft(task)}
                          disabled={!!busy}
                        >
                          검토 승인·공개
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {(busy || message) && <div className="toast">{busy || message}</div>}
    </main>
  );
}
