import { NextRequest, NextResponse } from "next/server";
import {
  getAuthorizedClient,
  listCurrentUserBlogs,
  safeGoogleApiDiagnostic,
} from "@/lib/google";
import { getLocalAgentState } from "@/lib/local-state";
import { getSession } from "@/lib/session";
import { providerFor } from "@/lib/models";
import { getAutomationConfig, getWorkspace, hasDatabase } from "@/lib/store";

export const dynamic = "force-dynamic";

type CheckStatus = "pass" | "warning" | "fail";
type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  action?: string;
  diagnostic?: Record<string, unknown>;
};

function providerKey(
  provider: string,
  session: Awaited<ReturnType<typeof getSession>>,
) {
  if (provider === "openai")
    return session.apiKeys?.openai || process.env.OPENAI_API_KEY;
  if (provider === "anthropic")
    return session.apiKeys?.anthropic || process.env.ANTHROPIC_API_KEY;
  return session.apiKeys?.google || process.env.GEMINI_API_KEY;
}

export async function GET(req: NextRequest) {
  const checks: Check[] = [];
  try {
    const session = await getSession();
    const local = hasDatabase() ? null : await getLocalAgentState();
    const [config, workspace] = hasDatabase()
      ? await Promise.all([getAutomationConfig(), getWorkspace()])
      : [null, local?.workspace || null];

    checks.push({
      id: "storage",
      label: "작업 이력 저장소",
      status: "pass",
      detail: hasDatabase()
        ? "데이터베이스 연결 정상"
        : `로컬 저장소 읽기 정상${local?.savedAt && local.savedAt !== new Date(0).toISOString() ? ` · 마지막 저장 ${local.savedAt}` : ""}`,
    });

    const openaiReady = Boolean(
      session.apiKeys?.openai || process.env.OPENAI_API_KEY,
    );
    checks.push({
      id: "research-key",
      label: "카테고리·키워드 조사",
      status: openaiReady ? "pass" : "fail",
      detail: openaiReady
        ? "OpenAI API 키 확인됨"
        : "OpenAI API 키가 없습니다.",
      action: openaiReady ? undefined : "설정에서 OpenAI API 키를 저장하세요.",
    });

    const writerModel = session.writerModel || config?.writerModel || "";
    const reviewerModel = session.reviewerModel || config?.reviewerModel || "";
    let modelsReady = false;
    let modelDetail = "작성·검수 모델을 선택하지 않았습니다.";
    try {
      const writerProvider = providerFor(writerModel);
      const reviewerProvider = providerFor(reviewerModel);
      modelsReady = Boolean(
        providerKey(writerProvider, session) &&
        providerKey(reviewerProvider, session),
      );
      modelDetail = modelsReady
        ? `${writerModel} 작성 · ${reviewerModel} 검수`
        : "선택한 작성 또는 검수 모델의 API 키가 없습니다.";
    } catch {}
    checks.push({
      id: "models",
      label: "글 작성·검수 모델",
      status: modelsReady ? "pass" : "fail",
      detail: modelDetail,
      action: modelsReady
        ? undefined
        : "모델을 선택하고 해당 회사 API 키를 저장하세요.",
    });

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const configuredRedirect =
      process.env.GOOGLE_REDIRECT_URI?.trim() ||
      "http://localhost:3000/api/auth/google/callback";
    const expectedRedirect = new URL(
      "/api/auth/google/callback",
      req.url,
    ).toString();
    const oauthConfigured = Boolean(clientId && clientSecret);
    const redirectMatches = configuredRedirect === expectedRedirect;
    checks.push({
      id: "oauth-config",
      label: "Google OAuth 설정",
      status: !oauthConfigured ? "fail" : redirectMatches ? "pass" : "fail",
      detail: !oauthConfigured
        ? "GOOGLE_CLIENT_ID 또는 GOOGLE_CLIENT_SECRET이 없습니다."
        : redirectMatches
          ? `리디렉션 주소 일치: ${configuredRedirect}`
          : `현재 주소와 불일치: ${configuredRedirect}`,
      action:
        oauthConfigured && redirectMatches
          ? undefined
          : `Google Cloud와 .env.local에 ${expectedRedirect}를 동일하게 등록하세요.`,
    });

    let blogItems: Awaited<ReturnType<typeof listCurrentUserBlogs>> = [];
    let googleReady = false;
    if (oauthConfigured && redirectMatches) {
      try {
        const auth = await getAuthorizedClient();
        blogItems = await listCurrentUserBlogs(auth);
        googleReady = true;
        checks.push({
          id: "google-live",
          label: "Google 계정 실시간 연결",
          status: "pass",
          detail: "Google 인증 토큰으로 Blogger 목록 요청 성공",
        });
      } catch (error: any) {
        checks.push({
          id: "google-live",
          label: "Google 계정 실시간 연결",
          status: "fail",
          detail:
            error?.response?.data?.error?.message ||
            error?.message ||
            "Google 요청 실패",
          action: "Google Blogger 연결을 다시 누른 뒤 재점검하세요.",
          diagnostic: {
            stage: "blogs.list",
            ...safeGoogleApiDiagnostic(error),
          },
        });
      }
    }

    checks.push({
      id: "blog-list",
      label: "운영 Blogger 목록",
      status: !googleReady ? "fail" : blogItems.length ? "pass" : "warning",
      detail: !googleReady
        ? "Google 실시간 연결이 먼저 필요합니다."
        : blogItems.length
          ? `${blogItems.length}개 확인: ${blogItems.map((blog) => blog.name || blog.id).join(", ")}`
          : "연결된 계정에서 운영 중인 Blogger를 찾지 못했습니다.",
      action:
        googleReady && !blogItems.length
          ? "현재 로그인 계정과 Blogger 관리자 계정이 같은지 확인하세요."
          : undefined,
    });

    const planCategories: string[] =
      workspace?.plan?.categories?.map((category: any) => category.name) || [];
    const blogMap: Record<string, string> =
      workspace?.blogMap || config?.categoryBlogMap || {};
    const validBlogIds = new Set(blogItems.map((blog) => String(blog.id)));
    const invalidMappings = Object.entries(blogMap).filter(
      ([, blogId]) =>
        blogId && googleReady && !validBlogIds.has(String(blogId)),
    );
    const mapped = planCategories.filter(
      (category) => blogMap[category],
    ).length;
    checks.push({
      id: "mapping",
      label: "카테고리별 Blogger 매핑",
      status: invalidMappings.length
        ? "fail"
        : !planCategories.length
          ? "warning"
          : mapped === planCategories.length
            ? "pass"
            : "warning",
      detail: invalidMappings.length
        ? `현재 계정에 없는 Blogger ID가 ${invalidMappings.length}개 연결돼 있습니다.`
        : planCategories.length
          ? `${mapped}/${planCategories.length}개 카테고리 연결`
          : "아직 주간 계획이 없어 매핑 검사를 보류했습니다.",
      action: invalidMappings.length
        ? "해당 카테고리의 Blogger를 다시 선택하세요."
        : mapped < planCategories.length
          ? "계획 생성 후 카테고리마다 운영 Blogger를 선택하세요."
          : undefined,
    });

    const blocking = checks.filter((check) => check.status === "fail");
    return NextResponse.json(
      {
        readyForFirstArticle: blocking.length === 0,
        summary: blocking.length
          ? `${blocking.length}개 필수 항목을 먼저 해결해야 합니다.`
          : "첫 글 작성 전 필수 연결이 모두 정상입니다.",
        checks,
        checkedAt: new Date().toISOString(),
        consumesAiCredits: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        readyForFirstArticle: false,
        summary: "사전 점검 자체를 완료하지 못했습니다.",
        error: error?.message || "사전 점검 실패",
        checks,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
