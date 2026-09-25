import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createOAuthClient } from "@/lib/google";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    session.oauthState = randomBytes(20).toString("hex");
    await session.save();
    const url = createOAuthClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/blogger",
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/adsense.readonly",
      ],
      state: session.oauthState,
    });
    return NextResponse.redirect(url);
  } catch (error: any) {
    return NextResponse.redirect(
      new URL(
        `/?google_error=${encodeURIComponent(error?.message || "Google 연결을 시작하지 못했습니다.")}`,
        req.url,
      ),
    );
  }
}
