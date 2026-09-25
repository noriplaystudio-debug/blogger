import { google } from "googleapis";
import { getSession } from "@/lib/session";
import {
  getGoogleCredentials,
  hasDatabase,
  saveGoogleCredentials,
} from "@/lib/store";

export function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    "http://localhost:3000/api/auth/google/callback";
  if (!clientId || !clientSecret)
    throw new Error(
      "Google OAuth 설정이 없습니다. .env.local의 GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 입력하고 npm run dev를 다시 시작하세요.",
    );
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function getAuthorizedClient() {
  const session = await getSession();
  const stored: {
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: number;
  } = hasDatabase() ? await getGoogleCredentials() : {};
  const accessToken = session.accessToken || stored.accessToken;
  const refreshToken =
    session.refreshToken ||
    stored.refreshToken ||
    process.env.GOOGLE_REFRESH_TOKEN;
  const tokenExpiry = session.tokenExpiry || stored.tokenExpiry;
  if (!accessToken && !refreshToken)
    throw new Error("Google 로그인이 필요합니다.");
  const auth = createOAuthClient();
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: tokenExpiry,
  });
  auth.on("tokens", async (tokens) => {
    if (hasDatabase()) {
      await saveGoogleCredentials({
        accessToken: tokens.access_token || undefined,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiry: tokens.expiry_date || undefined,
      });
    } else {
      if (tokens.access_token) session.accessToken = tokens.access_token;
      if (tokens.refresh_token) session.refreshToken = tokens.refresh_token;
      if (tokens.expiry_date) session.tokenExpiry = tokens.expiry_date;
      await session.save();
    }
  });
  return auth;
}

export type BloggerListItem = {
  id?: string | null;
  name?: string | null;
  url?: string | null;
  description?: string | null;
  published?: string | null;
  updated?: string | null;
  posts?: { totalItems?: number | null } | null;
};

/**
 * Blogger의 공식 최소 요청을 그대로 사용한다. 선택 필드나 보기 옵션을
 * 붙이지 않아 계정별 API 해석 차이로 목록 전체가 실패하지 않게 한다.
 */
export async function listCurrentUserBlogs(auth: any) {
  const { data } = await auth.request({
    method: "GET",
    url: "https://www.googleapis.com/blogger/v3/users/self/blogs",
    timeout: 15000,
  });
  return (Array.isArray(data?.items) ? data.items : []) as BloggerListItem[];
}

export function safeGoogleApiDiagnostic(error: any) {
  const first = error?.response?.data?.error?.errors?.[0] || {};
  return {
    status: Number(error?.response?.status || error?.code || 0) || undefined,
    reason: String(first.reason || "").slice(0, 120) || undefined,
    location: String(first.location || "").slice(0, 120) || undefined,
  };
}

export async function createBloggerDraft(
  blogId: string,
  article: { title: string; html: string; labels?: string[] },
  jobId?: string,
) {
  const auth = await getAuthorizedClient();
  const blogger = google.blogger({ version: "v3", auth });
  const safeJobId = jobId?.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 160);
  const marker = safeJobId ? `<!-- blogger-agent-job:${safeJobId} -->` : "";
  if (marker) {
    try {
      const { data: existing } = await blogger.posts.list({
        blogId,
        status: ["draft", "live"],
        fetchBodies: true,
        maxResults: 500,
        fields: "items(id,url,title,content,status)",
      });
      const matched = (existing.items || []).find((post) =>
        post.content?.includes(marker),
      );
      if (matched)
        return {
          id: matched.id || undefined,
          url: matched.url || undefined,
          title: matched.title || article.title,
          reused: true,
          published: matched.status === "LIVE",
        };
    } catch {}
  }
  const { data } = await blogger.posts.insert({
    blogId,
    isDraft: true,
    requestBody: {
      title: article.title,
      content: `${marker}${article.html}`,
      labels: article.labels,
    },
  });
  return {
    id: data.id || undefined,
    url: data.url || undefined,
    title: data.title || article.title,
  };
}

export async function publishBloggerDraft(blogId: string, postId: string) {
  const auth = await getAuthorizedClient();
  const blogger = google.blogger({ version: "v3", auth });
  const current = await blogger.posts.get({ blogId, postId });
  if (current.data.status === "LIVE")
    return {
      id: current.data.id || postId,
      url: current.data.url || undefined,
      title: current.data.title || "",
      reused: true,
    };
  const { data } = await blogger.posts.publish({ blogId, postId });
  return {
    id: data.id || postId,
    url: data.url || undefined,
    title: data.title || "",
    reused: false,
  };
}

export async function updateBloggerDraft(
  blogId: string,
  postId: string,
  article: { title: string; html: string; labels?: string[] },
  jobId?: string,
) {
  const auth = await getAuthorizedClient();
  const blogger = google.blogger({ version: "v3", auth });
  const safeJobId = jobId?.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 160);
  const marker = safeJobId ? `<!-- blogger-agent-job:${safeJobId} -->` : "";
  const { data } = await blogger.posts.update({
    blogId,
    postId,
    requestBody: {
      id: postId,
      title: article.title,
      content: `${marker}${article.html}`,
      labels: article.labels,
    },
  });
  return {
    id: data.id || postId,
    url: data.url || undefined,
    title: data.title || article.title,
    updated: true,
  };
}
