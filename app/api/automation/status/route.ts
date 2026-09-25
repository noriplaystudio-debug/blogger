import { NextResponse } from "next/server";
import { providerFor } from "@/lib/models";
import {
  getAutomationConfig,
  getOperationalStats,
  getWorkspace,
  hasDatabase,
  hasStoredGoogleCredentials,
  recentAuditEvents,
  recentRuns,
} from "@/lib/store";

function serverProviderConnected(provider: string) {
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY);
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function GET() {
  if (!hasDatabase())
    return NextResponse.json({
      configured: false,
      enabled: false,
      plan: null,
      tasks: [],
      runs: [],
      readiness: [
        {
          id: "database",
          label: "자동 실행 데이터베이스",
          ready: false,
          detail: "DATABASE_URL 미설정",
        },
      ],
    });
  try {
    const [config, workspace, runs, operational, googleConnected, auditEvents] =
      await Promise.all([
        getAutomationConfig(),
        getWorkspace(),
        recentRuns(),
        getOperationalStats(),
        hasStoredGoogleCredentials(),
        recentAuditEvents(),
      ]);
    const writerProvider = providerFor(config.writerModel);
    const reviewerProvider = providerFor(config.reviewerModel);
    const plannedCategories: string[] =
      workspace.plan?.categories?.map((category: any) => category.name) || [];
    const mappingTarget = plannedCategories.length
      ? plannedCategories
      : Object.keys(config.categoryBlogMap).slice(0, config.categoryCount);
    const mappedCount = mappingTarget.filter(
      (category) => config.categoryBlogMap[category],
    ).length;
    const total = workspace.plan
      ? workspace.plan.categories.reduce(
          (sum: number, category: any) =>
            sum +
            category.keywords.reduce(
              (keywordSum: number, keyword: any) =>
                keywordSum + keyword.angles.length,
              0,
            ),
          0,
        )
      : config.categoryCount *
        config.keywordsPerCategory *
        config.articlesPerKeyword;
    const readiness = [
      {
        id: "database",
        label: "자동 실행 데이터베이스",
        ready: true,
        detail: "연결됨",
      },
      {
        id: "research-key",
        label: "주간 조사 OpenAI 키",
        ready: Boolean(process.env.OPENAI_API_KEY),
        detail: process.env.OPENAI_API_KEY ? "연결됨" : "OPENAI_API_KEY 필요",
      },
      {
        id: "production-keys",
        label: "예약 작성·검수 모델 키",
        ready:
          serverProviderConnected(writerProvider) &&
          serverProviderConnected(reviewerProvider),
        detail: `${writerProvider} 작성 · ${reviewerProvider} 검수`,
      },
      {
        id: "google",
        label: "Google 장기 연결",
        ready: googleConnected,
        detail: googleConnected
          ? "저장된 OAuth 연결 있음"
          : "Google 재연결 필요",
      },
      {
        id: "cron",
        label: "예약 실행 보안키",
        ready: Boolean(process.env.CRON_SECRET),
        detail: process.env.CRON_SECRET ? "설정됨" : "CRON_SECRET 필요",
      },
      {
        id: "security",
        label: "운영 화면·세션 보안",
        ready:
          Boolean(process.env.APP_PASSWORD) &&
          Boolean(
            process.env.SESSION_PASSWORD?.length &&
            process.env.SESSION_PASSWORD.length >= 32,
          ) &&
          Boolean(
            process.env.APP_ENCRYPTION_KEY?.length &&
            process.env.APP_ENCRYPTION_KEY.length >= 32,
          ),
        detail: "APP_PASSWORD 및 32자 이상 세션·암호화 키",
      },
      {
        id: "mapping",
        label: "카테고리별 Blogger 연결",
        ready: mappingTarget.length > 0 && mappedCount >= mappingTarget.length,
        detail: `${mappedCount}/${mappingTarget.length || config.categoryCount}개 매핑`,
      },
    ];
    return NextResponse.json({
      configured: true,
      ...config,
      ...workspace,
      runs,
      auditEvents,
      operational,
      readiness,
      readyForUnattendedRun: readiness.every((item) => item.ready),
      schedule: {
        weekly: "매주 월요일 00:05 (한국시간)",
        daily: "매일 09:00 (한국시간)",
        dailyLimit: config.dailyArticleLimit,
        total,
        estimatedDays: Math.ceil(total / config.dailyArticleLimit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "자동화 상태 조회 실패" },
      { status: 500 },
    );
  }
}
