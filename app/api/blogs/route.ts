import { NextResponse } from "next/server";
import { google } from "googleapis";
import {
  getAuthorizedClient,
  listCurrentUserBlogs,
  safeGoogleApiDiagnostic,
} from "@/lib/google";

export const dynamic = "force-dynamic";

function errorStatus(error: any) {
  return Number(error?.response?.status || error?.code || 0);
}

function errorMessage(error: any) {
  return String(
    error?.response?.data?.error?.message ||
      error?.message ||
      "Blogger API 요청에 실패했습니다.",
  );
}

export async function GET() {
  try {
    const auth = await getAuthorizedClient();
    const blogger = google.blogger({ version: "v3", auth });
    const blogItems = await listCurrentUserBlogs(auth);
    const blogs = await Promise.all(
      blogItems.map(async (blog) => {
        try {
          const { data: pageViews } = await blogger.pageViews.get({
            blogId: blog.id!,
            range: ["7DAYS", "30DAYS", "all"],
          });
          const counts = Object.fromEntries(
            (pageViews.counts || []).map((item) => [
              item.timeRange,
              Number(item.count || 0),
            ]),
          );
          const postCount = Number(blog.posts?.totalItems || 0);
          const views30Days = counts.THIRTY_DAYS || 0;
          return {
            id: blog.id,
            name: blog.name,
            url: blog.url,
            description: blog.description || "",
            published: blog.published,
            updated: blog.updated,
            postCount,
            views7Days: counts.SEVEN_DAYS || 0,
            views30Days,
            viewsAllTime: counts.ALL_TIME || 0,
            viewsPerPost30Days: postCount
              ? Math.round((views30Days / postCount) * 10) / 10
              : 0,
            metricsAvailable: true,
          };
        } catch {
          return {
            id: blog.id,
            name: blog.name,
            url: blog.url,
            description: blog.description || "",
            published: blog.published,
            updated: blog.updated,
            postCount: Number(blog.posts?.totalItems || 0),
            views7Days: 0,
            views30Days: 0,
            viewsAllTime: 0,
            viewsPerPost30Days: 0,
            metricsAvailable: false,
          };
        }
      }),
    );
    return NextResponse.json(
      {
        connected: true,
        blogs,
        summary: {
          blogCount: blogs.length,
          postCount: blogs.reduce((sum, blog) => sum + blog.postCount, 0),
          views7Days: blogs.reduce((sum, blog) => sum + blog.views7Days, 0),
          views30Days: blogs.reduce((sum, blog) => sum + blog.views30Days, 0),
          viewsAllTime: blogs.reduce((sum, blog) => sum + blog.viewsAllTime, 0),
        },
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    const status = errorStatus(error);
    const detail = errorMessage(error);
    const configMissing = detail.includes("Google OAuth 설정이 없습니다");
    const loginRequired =
      detail.includes("Google 로그인이 필요합니다") ||
      detail.includes("invalid_grant") ||
      status === 401;
    const permissionDenied = status === 403;
    const code = configMissing
      ? "GOOGLE_OAUTH_CONFIG_REQUIRED"
      : loginRequired
        ? "GOOGLE_LOGIN_REQUIRED"
        : permissionDenied
          ? "BLOGGER_PERMISSION_REQUIRED"
          : "BLOGGER_API_REQUEST_FAILED";
    const message = configMissing
      ? detail
      : loginRequired
        ? "Google 로그인이 필요하거나 연결이 만료되었습니다. 다시 연결하세요."
        : permissionDenied
          ? "Google 계정은 연결됐지만 Blogger API 권한이 없습니다. Blogger API 활성화와 로그인 계정을 확인하세요."
          : `Google 계정은 연결됐지만 Blogger 목록을 불러오지 못했습니다. ${detail}`;
    return NextResponse.json(
      {
        connected: !loginRequired && !configMissing,
        code,
        error: message,
        diagnostic: {
          stage: "blogs.list",
          ...safeGoogleApiDiagnostic(error),
        },
      },
      {
        status: configMissing
          ? 500
          : loginRequired
            ? 401
            : status === 403
              ? 403
              : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
