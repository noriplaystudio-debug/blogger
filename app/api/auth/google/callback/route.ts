import { NextRequest, NextResponse } from "next/server";
import { createOAuthClient } from "@/lib/google";
import { getSession } from "@/lib/session";
import { hasDatabase, saveGoogleCredentials } from "@/lib/store";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    if (!code || !state || state !== session.oauthState)
      return NextResponse.redirect(
        new URL(
          "/?google_error=" +
            encodeURIComponent("유효하지 않은 OAuth 요청입니다. 다시 연결하세요."),
          req.url,
        ),
      );
    const { tokens } = await createOAuthClient().getToken(code);
    session.oauthState = undefined;
    if (hasDatabase()) {
      session.accessToken = undefined;
      session.refreshToken = undefined;
      session.tokenExpiry = undefined;
      await saveGoogleCredentials({
        accessToken: tokens.access_token || undefined,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiry: tokens.expiry_date || undefined,
      });
    } else {
      session.accessToken = tokens.access_token || undefined;
      session.refreshToken = tokens.refresh_token || session.refreshToken;
      session.tokenExpiry = tokens.expiry_date || undefined;
    }
    await session.save();
    return NextResponse.redirect(new URL("/?google_connected=1", req.url));
  } catch (error: any) {
    return NextResponse.redirect(
      new URL(
        "/?google_error=" +
          encodeURIComponent(
            error?.message || "Google 연결을 완료하지 못했습니다.",
          ),
        req.url,
      ),
    );
  }
}
