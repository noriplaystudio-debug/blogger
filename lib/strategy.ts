import OpenAI from "openai";
import { google } from "googleapis";
import { getAuthorizedClient, listCurrentUserBlogs } from "@/lib/google";
import { parseJson } from "@/lib/models";
import {
  getAutomationConfig,
  getMonthlyCostSummary,
  getPerformanceReports,
  getStrategyProgressStats,
  getWorkspace,
  saveRevenueSnapshot,
  saveStrategyReport,
} from "@/lib/store";

type RevenueWindow = {
  periodStart: string;
  periodEnd: string;
  estimatedEarnings: number;
  pageViews: number;
  pageRpm: number;
  currencyCode: string;
};
type SiteRevenue = {
  domain: string;
  estimatedEarnings: number;
  pageViews: number;
  pageRpm: number;
};
type BloggerPortfolio = {
  id: string;
  name: string;
  url: string;
  postCount: number;
  pageTitles: string[];
};
type AdSenseSite = {
  domain: string;
  state: string;
};

const REVENUE_STREAM_LABELS: Record<string, string> = {
  adsense: "AdSense 광고",
  affiliate: "제휴 링크",
  sponsorship: "협찬·스폰서",
  digital_products: "자료·디지털 상품",
};

const TARGET_RPM_SCENARIOS = [3000, 5000, 10000, 20000];
const MILESTONE_RATIOS = [
  [4, 0.001],
  [8, 0.01],
  [14, 0.1],
  [20, 0.5],
  [24, 1],
] as const;

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(daysAgoStart: number, daysAgoEnd: number) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - daysAgoEnd);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - daysAgoStart);
  return { start, end, periodStart: iso(start), periodEnd: iso(end) };
}

function percentChange(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

function reportValue(data: any, metric: string) {
  const index = (data.headers || []).findIndex(
    (header: any) => header.name === metric,
  );
  return index < 0 ? 0 : Number(data.totals?.cells?.[index]?.value || 0);
}

async function loadAdSenseWindow(
  accountNames: string[],
  daysAgoStart: number,
  daysAgoEnd: number,
): Promise<RevenueWindow> {
  const auth = await getAuthorizedClient();
  const adsense = google.adsense({ version: "v2", auth });
  const range = dateRange(daysAgoStart, daysAgoEnd);
  let estimatedEarnings = 0;
  let pageViews = 0;
  for (const account of accountNames) {
    const { data } = await adsense.accounts.reports.generate({
      account,
      dateRange: "CUSTOM",
      "startDate.year": range.start.getUTCFullYear(),
      "startDate.month": range.start.getUTCMonth() + 1,
      "startDate.day": range.start.getUTCDate(),
      "endDate.year": range.end.getUTCFullYear(),
      "endDate.month": range.end.getUTCMonth() + 1,
      "endDate.day": range.end.getUTCDate(),
      metrics: ["ESTIMATED_EARNINGS", "PAGE_VIEWS"],
      currencyCode: "KRW",
      reportingTimeZone: "ACCOUNT_TIME_ZONE",
    });
    estimatedEarnings += reportValue(data, "ESTIMATED_EARNINGS");
    pageViews += reportValue(data, "PAGE_VIEWS");
  }
  return {
    periodStart: range.periodStart,
    periodEnd: range.periodEnd,
    estimatedEarnings,
    pageViews,
    pageRpm: pageViews ? (estimatedEarnings / pageViews) * 1000 : 0,
    currencyCode: "KRW",
  };
}

async function loadAdSenseBySite(
  accountNames: string[],
): Promise<SiteRevenue[]> {
  const auth = await getAuthorizedClient();
  const adsense = google.adsense({ version: "v2", auth });
  const range = dateRange(30, 1);
  const totals = new Map<string, { earnings: number; views: number }>();
  for (const account of accountNames) {
    const { data } = await adsense.accounts.reports.generate({
      account,
      dateRange: "CUSTOM",
      "startDate.year": range.start.getUTCFullYear(),
      "startDate.month": range.start.getUTCMonth() + 1,
      "startDate.day": range.start.getUTCDate(),
      "endDate.year": range.end.getUTCFullYear(),
      "endDate.month": range.end.getUTCMonth() + 1,
      "endDate.day": range.end.getUTCDate(),
      dimensions: ["OWNED_SITE_DOMAIN_NAME"],
      metrics: ["ESTIMATED_EARNINGS", "PAGE_VIEWS"],
      currencyCode: "KRW",
      reportingTimeZone: "ACCOUNT_TIME_ZONE",
    });
    const headerIndex = Object.fromEntries(
      (data.headers || []).map((header, index) => [header.name, index]),
    );
    for (const row of data.rows || []) {
      const domain =
        row.cells?.[headerIndex.OWNED_SITE_DOMAIN_NAME]?.value || "unassigned";
      const current = totals.get(domain) || { earnings: 0, views: 0 };
      current.earnings += Number(
        row.cells?.[headerIndex.ESTIMATED_EARNINGS]?.value || 0,
      );
      current.views += Number(row.cells?.[headerIndex.PAGE_VIEWS]?.value || 0);
      totals.set(domain, current);
    }
  }
  return [...totals].map(([domain, value]) => ({
    domain,
    estimatedEarnings: value.earnings,
    pageViews: value.views,
    pageRpm: value.views ? (value.earnings / value.views) * 1000 : 0,
  }));
}

async function loadAdSenseSites(
  accountNames: string[],
): Promise<AdSenseSite[]> {
  const auth = await getAuthorizedClient();
  const adsense = google.adsense({ version: "v2", auth });
  const sites: AdSenseSite[] = [];
  for (const account of accountNames) {
    const { data } = await adsense.accounts.sites.list({
      parent: account,
      pageSize: 10000,
    });
    for (const site of data.sites || [])
      if (site.domain)
        sites.push({ domain: site.domain, state: site.state || "UNKNOWN" });
  }
  return sites;
}

async function loadBloggerPortfolio(auth: any): Promise<BloggerPortfolio[]> {
  const blogger = google.blogger({ version: "v3", auth });
  const blogItems = await listCurrentUserBlogs(auth);
  return Promise.all(
    blogItems.map(async (blog) => {
      let pageTitles: string[] = [];
      try {
        const { data: pages } = await blogger.pages.list({
          blogId: blog.id!,
          status: ["live"],
          fields: "items(title)",
        });
        pageTitles = (pages.items || [])
          .map((page) => page.title || "")
          .filter(Boolean);
      } catch {}
      return {
        id: blog.id!,
        name: blog.name || "이름 없는 블로그",
        url: blog.url || "",
        postCount: Number(blog.posts?.totalItems || 0),
        pageTitles,
      };
    }),
  );
}

function normalizedHost(value: string) {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return value.replace(/^www\./, "").toLowerCase();
  }
}

function approvalReadiness(blogs: BloggerPortfolio[], performance: any[]) {
  return blogs.map((blog) => {
    const titles = blog.pageTitles.join(" ").toLowerCase();
    const searchReport = performance.find(
      (report) => report.blogId === blog.id && report.status === "ready",
    );
    const searchPages = Number(searchReport?.summary?.pages || 0);
    const searchImpressions = Number(searchReport?.summary?.impressions || 0);
    const checks = [
      {
        id: "content",
        label: "고품질 공개 글 내부 목표 20개",
        passed: blog.postCount >= 20,
        detail: `${blog.postCount}/20개`,
      },
      {
        id: "about",
        label: "블로그 소개 페이지",
        passed: /소개|about/.test(titles),
        detail: /소개|about/.test(titles) ? "확인" : "미확인",
      },
      {
        id: "contact",
        label: "문의 페이지",
        passed: /문의|연락|contact/.test(titles),
        detail: /문의|연락|contact/.test(titles) ? "확인" : "미확인",
      },
      {
        id: "privacy",
        label: "개인정보처리방침",
        passed: /개인정보|privacy/.test(titles),
        detail: /개인정보|privacy/.test(titles) ? "확인" : "미확인",
      },
      {
        id: "search",
        label: "Search Console 검색 신호",
        passed: searchPages > 0 || searchImpressions > 0,
        detail: `검색 페이지 ${searchPages} · 노출 ${searchImpressions}`,
      },
    ];
    return {
      blogId: blog.id,
      blogName: blog.name,
      ready: checks.every((check) => check.passed),
      score: Math.round(
        (checks.filter((check) => check.passed).length / checks.length) * 100,
      ),
      checks,
    };
  });
}

function siteEconomics(
  blogs: BloggerPortfolio[],
  revenue: SiteRevenue[],
  costs: Awaited<ReturnType<typeof getMonthlyCostSummary>>,
  fixedCost: number,
) {
  const allocatedFixed = blogs.length ? fixedCost / blogs.length : fixedCost;
  const allocatedSharedAi = blogs.length
    ? costs.unassignedCostWon / blogs.length
    : costs.unassignedCostWon;
  const matchedDomains = new Set<string>();
  const sites = blogs.map((blog) => {
    const host = normalizedHost(blog.url);
    const matched = revenue.find((site) => {
      const domain = normalizedHost(site.domain);
      return (
        domain === host ||
        host.endsWith(`.${domain}`) ||
        domain.endsWith(`.${host}`)
      );
    });
    if (matched) matchedDomains.add(matched.domain);
    const grossRevenue = matched?.estimatedEarnings || 0;
    const directAiCost = costs.byBlog[blog.id] || 0;
    const aiCost = directAiCost + allocatedSharedAi;
    const netProfit = grossRevenue - aiCost - allocatedFixed;
    return {
      blogId: blog.id,
      blogName: blog.name,
      domain: host,
      pageViews: matched?.pageViews || 0,
      grossRevenue,
      pageRpm: matched?.pageRpm || 0,
      estimatedAiCost: aiCost,
      directAiCost,
      allocatedSharedAiCost: allocatedSharedAi,
      allocatedFixedCost: allocatedFixed,
      netProfit,
      marginPercent: grossRevenue ? (netProfit / grossRevenue) * 100 : null,
      attribution: matched ? "matched" : "no_adsense_row",
      recommendation:
        grossRevenue > 0 && netProfit > 0
          ? "scale"
          : matched?.pageViews
            ? "repair"
            : "measure",
    };
  });
  return {
    sites,
    unassignedRevenue: revenue
      .filter((site) => !matchedDomains.has(site.domain))
      .reduce((sum, site) => sum + site.estimatedEarnings, 0),
  };
}

function milestones(goal: number, months: number) {
  const result: {
    month: number;
    monthlyRevenueTarget: number;
    label: string;
  }[] = [];
  for (const [baseMonth, ratio] of MILESTONE_RATIOS) {
    const month = Math.max(1, Math.round((baseMonth / 24) * months));
    const item = {
      month,
      monthlyRevenueTarget: Math.round(goal * ratio),
      label: `${month}개월`,
    };
    const duplicate = result.findIndex((entry) => entry.month === month);
    if (duplicate >= 0) result[duplicate] = item;
    else result.push(item);
  }
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function phaseStatus(done: boolean, started: boolean, targetDate: Date) {
  if (done) return "completed";
  if (new Date() > targetDate) return "at_risk";
  return started ? "in_progress" : "waiting";
}

function growthPortfolio(
  config: Awaited<ReturnType<typeof getAutomationConfig>>,
  status: string,
  actual: RevenueWindow,
  progress: Awaited<ReturnType<typeof getStrategyProgressStats>>,
  applicationReady: boolean,
  adsenseApproved: boolean,
) {
  const start = new Date(`${config.goalStartedAt}T00:00:00Z`);
  const adsenseConnected = status === "ready" || status === "ready_without_ai";
  const hasFirstPost = progress.publishedArticles > 0;
  const hasRevenue = actual.estimatedEarnings > 0;
  const base = [
    {
      id: "first-post",
      title: "첫 게시글 공개",
      targetDate: addDays(start, 7),
      expectedWindow: "시작 후 1주 이내",
      periodFromPrevious: "0~7일",
      description:
        "한 주제의 전문 블로그를 열고 자료 근거와 사용자 가치 검수를 통과한 첫 글을 공개합니다.",
      gate: "Blogger 공개 글 1개 이상",
      kpis: [
        "공개 글 1개",
        "소개·문의·개인정보처리방침 등 기본 페이지 점검",
        "Search Console 속성 연결",
      ],
      done: hasFirstPost,
      started: true,
      actualSummary: hasFirstPost
        ? `에이전트 공개 글 ${progress.publishedArticles}개`
        : `임시글 ${progress.draftArticles}개 · 공개 글 0개`,
    },
    {
      id: "approval-ready",
      title: "AdSense 신청 준비",
      targetDate: addDays(start, 42),
      expectedWindow: "첫 글 후 4~8주",
      periodFromPrevious: "약 5주",
      description:
        "공식 글 개수 조건을 꾸미지 않고, 블로그 완성도·독창성·색인·정책 안전성을 내부 신청 게이트로 확인합니다.",
      gate: "필수 페이지·대표 글·색인·정책 점검 통과 후 사람이 신청",
      kpis: [
        "내부 목표: 고품질 공개 글 20~30개",
        "Search Console 노출 발생",
        "얕은 중복 글·저작권·정책 위험 0건",
      ],
      done: applicationReady,
      started: hasFirstPost,
      actualSummary: `공개 글 ${progress.publishedArticles}개 · 검색 페이지 ${progress.searchPages}개 · 노출 ${progress.searchImpressions}회`,
    },
    {
      id: "adsense-approved",
      title: "첫 AdSense 승인",
      targetDate: addDays(start, 70),
      expectedWindow: "첫 글 후 7~14주",
      periodFromPrevious: "신청 후 통상 며칠, 일부 2~4주",
      description:
        "Google의 사이트 전체 검토 결과를 기다립니다. 반려되면 사유를 수정하고 재신청하며 승인일을 보장하지 않습니다.",
      gate: "AdSense 사이트 상태가 READY로 확인됨",
      kpis: [
        "사이트 검토 승인",
        "광고 표시 확인",
        "ads.txt·정책 센터 이상 없음",
      ],
      done: adsenseApproved,
      started: hasFirstPost,
      actualSummary: adsenseApproved
        ? "AdSense 사이트 상태 READY"
        : adsenseConnected
          ? "계정 연결됨 · 사이트 승인 상태 확인 필요"
          : "승인 전 또는 연결 확인 필요",
    },
    {
      id: "first-revenue",
      title: "첫 수익 발생",
      targetDate: addDays(start, 84),
      expectedWindow: "승인 후 1~14일 목표",
      periodFromPrevious: "방문·광고 노출에 따라 달라짐",
      description:
        "광고가 정상 노출되고 유효한 방문이 발생해 예상 수익이 처음 기록되는 단계입니다.",
      gate: "최근 AdSense 예상 수익이 0원 초과",
      kpis: ["예상 수익 1원 이상", "유효 트래픽", "무효 활동 경고 0건"],
      done: hasRevenue,
      started: adsenseApproved,
      actualSummary: hasRevenue
        ? `최근 30일 ₩${Math.round(actual.estimatedEarnings).toLocaleString("ko-KR")}`
        : "아직 확인된 수익 없음",
    },
  ];
  const revenueStages = [
    [4, 100000, "월 10만 원"],
    [8, 1000000, "월 100만 원"],
    [14, 10000000, "월 1,000만 원"],
    [20, 50000000, "월 5,000만 원"],
    [
      24,
      config.revenueGoalMonthly,
      `월 ${(config.revenueGoalMonthly / 100000000).toLocaleString("ko-KR")}억 원`,
    ],
  ] as const;
  let previousDone = hasRevenue;
  for (const [baseMonth, amount, title] of revenueStages) {
    const month = Math.max(
      1,
      Math.round((baseMonth / 24) * config.revenueGoalMonths),
    );
    const done = actual.estimatedEarnings >= amount;
    const rpm = actual.pageRpm || 5000;
    base.push({
      id: `revenue-${amount}`,
      title,
      targetDate: addMonths(start, month),
      expectedWindow: `시작 후 ${month}개월 목표`,
      periodFromPrevious:
        baseMonth === 4
          ? "첫 수익 후 약 1~2개월"
          : `${baseMonth === 8 ? 4 : baseMonth === 14 ? 6 : baseMonth === 20 ? 6 : 4}개월 성장 구간`,
      description:
        "30일 예상 수익과 실제 페이지 RPM을 기준으로 달성 여부를 판정하고, 검증된 블로그 중심으로 확장합니다.",
      gate: `최근 30일 예상 수익 ₩${amount.toLocaleString("ko-KR")} 이상`,
      kpis: [
        `필요 PV 약 ${Math.ceil((amount / rpm) * 1000).toLocaleString("ko-KR")}회${actual.pageRpm ? "(현재 RPM 기준)" : "(RPM 5천 원 가정)"}`,
        "검색 유입·RPM·정책 상태 동시 유지",
        "저성과 글 개선 후 재측정",
      ],
      done,
      started: previousDone,
      actualSummary: `현재 ₩${Math.round(actual.estimatedEarnings).toLocaleString("ko-KR")} / 목표 ₩${amount.toLocaleString("ko-KR")}`,
    });
    previousDone = done;
  }
  const phases = base.map(({ done, started, targetDate, ...phase }) => ({
    ...phase,
    targetDate: iso(targetDate),
    status: phaseStatus(done, started, targetDate),
  }));
  const activeIndex = phases.findIndex((phase) => phase.status !== "completed");
  return {
    planBasis: "공식 보장 기간이 아닌 24개월 공격적 운영 기준",
    officialReviewNote:
      "Google은 사이트 검토가 보통 며칠이지만 경우에 따라 2~4주 걸릴 수 있다고 안내합니다.",
    approvalTarget: "첫 게시글 공개 후 7~14주",
    firstRevenueTarget: "승인 후 1~14일(유효 방문이 있을 때)",
    activePhaseId: phases[activeIndex < 0 ? phases.length - 1 : activeIndex].id,
    progress,
    phases,
  };
}

function baselineReport(
  config: Awaited<ReturnType<typeof getAutomationConfig>>,
  status: string,
  message: string,
  progress: Awaited<ReturnType<typeof getStrategyProgressStats>>,
  businessInput: {
    blogs: BloggerPortfolio[];
    siteRevenue: SiteRevenue[];
    costs: Awaited<ReturnType<typeof getMonthlyCostSummary>>;
    adsenseSites: AdSenseSite[];
    performance: any[];
  },
  current?: RevenueWindow,
  previous?: RevenueWindow,
) {
  const actual = current || {
    periodStart: "",
    periodEnd: "",
    estimatedEarnings: 0,
    pageViews: 0,
    pageRpm: 0,
    currencyCode: "KRW",
  };
  const startedAt = new Date(`${config.goalStartedAt}T00:00:00Z`);
  const deadline = new Date(startedAt);
  deadline.setUTCMonth(deadline.getUTCMonth() + config.revenueGoalMonths);
  const now = new Date();
  const elapsedMonths = Math.max(
    0,
    Math.min(
      config.revenueGoalMonths,
      (now.getUTCFullYear() - startedAt.getUTCFullYear()) * 12 +
        now.getUTCMonth() -
        startedAt.getUTCMonth(),
    ),
  );
  const targetLine = milestones(
    config.revenueGoalMonthly,
    config.revenueGoalMonths,
  );
  const currentMilestone =
    targetLine.find((item) => item.month >= Math.max(1, elapsedMonths)) ||
    targetLine[targetLine.length - 1];
  const trajectory = !actual.estimatedEarnings
    ? "no_data"
    : actual.estimatedEarnings >= currentMilestone.monthlyRevenueTarget
      ? "on_track"
      : "behind";
  const economics = siteEconomics(
    businessInput.blogs,
    businessInput.siteRevenue,
    businessInput.costs,
    config.monthlyFixedCostWon,
  );
  const totalOperatingCost =
    businessInput.costs.aiCostWon + config.monthlyFixedCostWon;
  const readiness = approvalReadiness(
    businessInput.blogs,
    businessInput.performance,
  );
  const bloggerHosts = new Set(
    businessInput.blogs.map((blog) => normalizedHost(blog.url)),
  );
  const approvedSites = businessInput.adsenseSites.filter(
    (site) =>
      site.state === "READY" &&
      (!bloggerHosts.size || bloggerHosts.has(normalizedHost(site.domain))),
  );
  return {
    status,
    goal: {
      monthlyRevenue: config.revenueGoalMonthly,
      months: config.revenueGoalMonths,
      model: config.revenueModel,
      startedAt: config.goalStartedAt,
      deadline: iso(deadline),
      elapsedMonths,
      currentMilestoneTarget: currentMilestone.monthlyRevenueTarget,
      disclaimer: "도전 목표이며 수익을 보장하는 예측이 아닙니다.",
    },
    actual,
    previous: previous || null,
    changes: previous
      ? {
          earningsPercent: percentChange(
            actual.estimatedEarnings,
            previous.estimatedEarnings,
          ),
          pageViewsPercent: percentChange(actual.pageViews, previous.pageViews),
        }
      : null,
    progressPercent: config.revenueGoalMonthly
      ? (actual.estimatedEarnings / config.revenueGoalMonthly) * 100
      : 0,
    requiredPageViewsAtActualRpm:
      actual.pageRpm > 0
        ? Math.ceil((config.revenueGoalMonthly / actual.pageRpm) * 1000)
        : null,
    rpmScenarios: TARGET_RPM_SCENARIOS.map((rpm) => ({
      rpm,
      requiredMonthlyPageViews: Math.ceil(
        (config.revenueGoalMonthly / rpm) * 1000,
      ),
    })),
    milestones: targetLine,
    growthPortfolio: growthPortfolio(
      config,
      status,
      actual,
      progress,
      readiness.some((blog) => blog.ready),
      approvedSites.length > 0,
    ),
    approvalReadiness: readiness,
    business: {
      grossRevenue: actual.estimatedEarnings,
      estimatedAiCost: businessInput.costs.aiCostWon,
      fixedCost: config.monthlyFixedCostWon,
      totalOperatingCost,
      estimatedNetProfit: actual.estimatedEarnings - totalOperatingCost,
      monthlyAiBudget: config.monthlyAiBudgetWon,
      budgetUsedPercent: config.monthlyAiBudgetWon
        ? (businessInput.costs.aiCostWon / config.monthlyAiBudgetWon) * 100
        : 0,
      productionEvents: businessInput.costs.events,
      costMethod:
        "사용자가 설정한 글·주간 조사·성과/전략 분석 예상 비용 × 이번 달 실행 건수",
      ...economics,
      adsenseSites: businessInput.adsenseSites,
      approvedSiteCount: approvedSites.length,
    },
    monetization: {
      streams: (config.revenueStreams || ["adsense"]).map((stream: string) => ({
        id: stream,
        label: REVENUE_STREAM_LABELS[stream] || stream,
        measured: stream === "adsense",
        status:
          stream === "adsense"
            ? approvedSites.length
              ? "측정 중"
              : "AdSense 승인 필요"
            : "연결 설정 필요",
      })),
      nextActions: [
        ...(config.revenueStreams || []).includes("affiliate")
          ? ["검색 의도와 직접 관련된 제휴 상품만 선정하고 제휴 관계를 글에 고지한다."]
          : [],
        ...(config.revenueStreams || []).includes("sponsorship")
          ? ["협찬 글은 광고·협찬 사실과 편집 독립성 고지를 포함하고 별도 계약으로 관리한다."]
          : [],
        ...(config.revenueStreams || []).includes("digital_products")
          ? ["반복 질문을 해결하는 체크리스트·템플릿을 만들고 결제·환불·고지 절차를 먼저 확정한다."]
          : [],
      ],
      disclaimer:
        "현재 자동으로 측정되는 실적은 AdSense입니다. 제휴·협찬·상품 수익은 외부 계정·계약·결제 연동 후 별도 입력해야 하며 수익을 보장하지 않습니다.",
    },
    trajectory,
    forecastConfidence: actual.pageViews >= 10000 ? "중간" : "낮음",
    executiveSummary: message,
    weeklyObjective: "측정 가능한 검색 유입과 정책 안전성을 먼저 검증한다.",
    contentAllocation: { winners: 70, adjacent: 20, experiments: 10 },
    portfolioActions: [],
    actionPlan: [
      {
        priority: 1,
        action: "AdSense와 Search Console 측정을 정상 연결한다.",
        metric: "수익·페이지뷰·검색 노출 수집 성공",
        deadline: "이번 주",
      },
      {
        priority: 2,
        action: "사용자 가치가 분명한 글만 발행하고 초기 노출·CTR을 관찰한다.",
        metric: "색인된 글과 검색 노출 증가",
        deadline: "이번 주",
      },
    ],
    stopRules: [
      "정책 위험 또는 근거 부족 주제는 발행하지 않는다.",
      "충분한 사용자 가치 없는 대량 생성은 중단한다.",
    ],
    policyWarnings: [
      "본인 광고 클릭·클릭 유도·구매 트래픽을 금지한다.",
      "AI 생성 여부보다 독창성·정확성·사용자 가치와 검색 스팸 정책 준수가 우선이다.",
    ],
    assumptions: [
      "페이지 RPM은 수익 ÷ 페이지뷰 × 1,000으로 계산한다.",
      "실제 RPM이 없을 때의 필요 페이지뷰는 시나리오일 뿐 예측이 아니다.",
    ],
  };
}

export async function refreshRevenueStrategy(
  apiKey = process.env.OPENAI_API_KEY,
) {
  const [config, progress, costs, performance] = await Promise.all([
    getAutomationConfig(),
    getStrategyProgressStats(),
    getMonthlyCostSummary(),
    getPerformanceReports(),
  ]);
  let current: RevenueWindow | undefined;
  let previous: RevenueWindow | undefined;
  let bloggerPortfolio: BloggerPortfolio[] = [];
  let siteRevenue: SiteRevenue[] = [];
  let adsenseSites: AdSenseSite[] = [];
  try {
    const auth = await getAuthorizedClient();
    try {
      bloggerPortfolio = await loadBloggerPortfolio(auth);
      const bloggerPostCount = bloggerPortfolio.reduce(
        (sum, blog) => sum + blog.postCount,
        0,
      );
      progress.publishedArticles = Math.max(
        progress.publishedArticles,
        bloggerPostCount,
      );
    } catch {}
    const adsense = google.adsense({ version: "v2", auth });
    const { data } = await adsense.accounts.list({ pageSize: 100 });
    const accountNames = (data.accounts || [])
      .map((account) => account.name)
      .filter(Boolean) as string[];
    if (!accountNames.length) {
      const report = baselineReport(
        config,
        "adsense_not_ready",
        "연결된 AdSense 계정이 없어 현재는 수익 검증 단계입니다. 승인·연결 후 실제 수익과 RPM으로 목표 경로를 보정합니다.",
        progress,
        {
          blogs: bloggerPortfolio,
          siteRevenue,
          costs,
          adsenseSites,
          performance,
        },
      );
      await saveStrategyReport(report.status, report);
      return report;
    }
    [current, previous] = await Promise.all([
      loadAdSenseWindow(accountNames, 30, 1),
      loadAdSenseWindow(accountNames, 60, 31),
    ]);
    try {
      [siteRevenue, adsenseSites] = await Promise.all([
        loadAdSenseBySite(accountNames),
        loadAdSenseSites(accountNames),
      ]);
    } catch {}
    await saveRevenueSnapshot({
      ...current,
      payload: { accountCount: accountNames.length },
    });
  } catch (error: any) {
    const report = baselineReport(
      config,
      "adsense_unavailable",
      `AdSense 실적을 읽지 못해 실제 수익 기반 판단을 보류했습니다: ${error.message}`,
      progress,
      {
        blogs: bloggerPortfolio,
        siteRevenue,
        costs,
        adsenseSites,
        performance,
      },
    );
    await saveStrategyReport(report.status, report);
    return report;
  }

  const base = baselineReport(
    config,
    "ready",
    "최근 30일 실제 AdSense 실적을 기준으로 이번 주 실행안을 계산했습니다.",
    progress,
    {
      blogs: bloggerPortfolio,
      siteRevenue,
      costs,
      adsenseSites,
      performance,
    },
    current,
    previous,
  );
  const workspace = await getWorkspace();
  if (!apiKey) {
    await saveStrategyReport("ready_without_ai", base);
    return { ...base, status: "ready_without_ai" };
  }
  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model:
        process.env.STRATEGY_MODEL ||
        process.env.PERFORMANCE_MODEL ||
        "gpt-5.6-terra",
      reasoning: { effort: "high" },
      text: { format: { type: "json_object" } },
      input: `당신은 Blogger 포트폴리오의 주간 수익 사령탑이다. AdSense를 기본 측정원으로 삼되 설정된 제휴·협찬·디지털 상품 수익원을 함께 단계적으로 준비한다. 아래 입력의 실제 값만 근거로 다음 주 행동을 지시한다.

절대 규칙:
- 목표는 보장이 아닌 공격적 도전 목표다. 데이터가 약하면 낮은 신뢰도로 표시하고 인과를 꾸미지 않는다.
- 본인 광고 클릭, 클릭 유도, 구매·봇 트래픽, 검색 순위 조작, 사용자 가치 없는 대량 AI 콘텐츠를 제안하지 않는다.
- 수익만을 위해 품질·정확성·독창성·정책 안전을 희생하지 않는다. 제휴·협찬은 관계 고지와 편집 독립성을 지키고, 상품은 결제·환불·개인정보 요건을 먼저 확인한다.
- 기본 콘텐츠 배분은 성과 검증 주제 70%, 인접 확장 20%, 신규 실험 10%다. 실제 증거가 있을 때만 조정한다.
- 성과 없는 블로그는 즉시 폐기하지 말고 표본·색인·노출·CTR·순위·콘텐츠 적합성을 순서대로 진단한다.
- 금액은 KRW이며 30일 실적이다.

입력: ${JSON.stringify({ base, performance, plan: workspace.plan, tasks: workspace.tasks.slice(0, 60).map((task: any) => ({ category: task.category, keyword: task.keyword, state: task.state, title: task.article?.title || "" })) }).slice(0, 42000)}

JSON만 출력:
{"trajectory":"ahead|on_track|behind|no_data","forecastConfidence":"높음|중간|낮음","executiveSummary":"실적·격차·판단 요약","weeklyObjective":"이번 주 한 문장 목표","contentAllocation":{"winners":70,"adjacent":20,"experiments":10},"portfolioActions":[{"blogName":"블로그 또는 포트폴리오","action":"scale|hold|repair|stop|measure","reason":"실제 근거와 한계","articleShare":0}],"actionPlan":[{"priority":1,"action":"구체적 행동","metric":"판정 지표","deadline":"기한"}],"stopRules":["중단 기준"],"policyWarnings":["정책 위험"],"assumptions":["가정과 불확실성"]}`,
    });
    const advice = parseJson<any>(response.output_text);
    const allocation = advice.contentAllocation;
    const allocationTotal =
      Number(allocation?.winners || 0) +
      Number(allocation?.adjacent || 0) +
      Number(allocation?.experiments || 0);
    const report = {
      ...base,
      status: "ready",
      trajectory: ["ahead", "on_track", "behind", "no_data"].includes(
        advice.trajectory,
      )
        ? advice.trajectory
        : base.trajectory,
      forecastConfidence: ["높음", "중간", "낮음"].includes(
        advice.forecastConfidence,
      )
        ? advice.forecastConfidence
        : base.forecastConfidence,
      executiveSummary:
        typeof advice.executiveSummary === "string"
          ? advice.executiveSummary.slice(0, 1200)
          : base.executiveSummary,
      weeklyObjective:
        typeof advice.weeklyObjective === "string"
          ? advice.weeklyObjective.slice(0, 300)
          : base.weeklyObjective,
      contentAllocation:
        allocationTotal === 100 &&
        [allocation.winners, allocation.adjacent, allocation.experiments].every(
          (value) => Number(value) >= 0,
        )
          ? {
              winners: Number(allocation.winners),
              adjacent: Number(allocation.adjacent),
              experiments: Number(allocation.experiments),
            }
          : base.contentAllocation,
      portfolioActions: Array.isArray(advice.portfolioActions)
        ? advice.portfolioActions
            .filter((item: any) =>
              ["scale", "hold", "repair", "stop", "measure"].includes(
                item?.action,
              ),
            )
            .slice(0, 20)
        : [],
      actionPlan: Array.isArray(advice.actionPlan)
        ? advice.actionPlan.slice(0, 15)
        : base.actionPlan,
      stopRules: [
        ...new Set([
          ...base.stopRules,
          ...(Array.isArray(advice.stopRules) ? advice.stopRules : []),
        ]),
      ].slice(0, 20),
      policyWarnings: [
        ...new Set([
          ...base.policyWarnings,
          ...(Array.isArray(advice.policyWarnings)
            ? advice.policyWarnings
            : []),
        ]),
      ].slice(0, 20),
      assumptions: [
        ...new Set([
          ...base.assumptions,
          ...(Array.isArray(advice.assumptions) ? advice.assumptions : []),
        ]),
      ].slice(0, 20),
    };
    await saveStrategyReport(report.status, report);
    return report;
  } catch (error: any) {
    const report = {
      ...base,
      status: "ready_without_ai",
      executiveSummary: `${base.executiveSummary} AI 전략 해석은 실패해 규칙 기반 결과만 표시합니다: ${error.message}`,
    };
    await saveStrategyReport(report.status, report);
    return report;
  }
}
