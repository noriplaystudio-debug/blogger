import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
  oauthState?: string;
  apiKeys?: {
    openai?: string;
    anthropic?: string;
    google?: string;
  };
  writerModel?: string;
  reviewerModel?: string;
  styleGuide?: string;
};

function options(): SessionOptions {
  const configured = process.env.SESSION_PASSWORD;
  if (
    process.env.NODE_ENV === "production" &&
    (!configured || configured.length < 32)
  )
    throw new Error("운영 환경에는 32자 이상의 SESSION_PASSWORD가 필요합니다.");
  return {
    cookieName: "blogger_agent_session",
    password: configured || "development-only-password-change-me-now",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}
