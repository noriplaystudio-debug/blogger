import { NextRequest, NextResponse } from "next/server";const SESSION_COOKIE = "blogger_agent_auth";
const SESSION_MESSAGE = "blogger-agent-dashboard-v1";

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function sessionToken(password: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(SESSION_MESSAGE),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signed)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function loginPage(message = "") {
  const error = message
    ? \`<p role="alert" style="color:#a33">\${error}</p>\`
    : "";
  return \`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blogger 에이전트 로그인</title></head><body style="font-family:system-ui,sans-serif;background:#f6f4ed;margin:0;min-height:100vh;display:grid;place-items:center"><main style="width:min(420px,calc(100% - 40px));background:white;border:1px solid #d9ded8;border-radius:20px;padding:32px;box-sizing:border-box"><h1 style="margin-top:0">Blogger 에이전트 로그인</h1><p>대시보드 비밀번호를 입력하세요.</p>\${error}<form method="post" action="/login"><label for="password" style="display:block;margin-bottom:8px">비밀번호</label><input id="password" name="password" type="password" autocomplete="current-password" required style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #aab2ad;border-radius:10px"><button type="submit" style="width:100%;margin-top:16px;padding:12px;border:0;border-radius:10px;background:#14231d;color:white;font-weight:700">로그인</button></form></main></body></html>\`;
}

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/cron/")) return NextResponse.next();

  // Google redirects back here from accounts.google.com as a top-level
  // navigation. The OAuth state and iron-session cookie validate this route;
  // requiring the dashboard HMAC cookie here can reject legitimate callbacks
  // when the browser uses a separate OAuth tab/context.
  if (
    req.nextUrl.pathname === "/api/auth/google/callback" &&
    req.method === "GET"
  ) {
    return withSecurityHeaders(NextResponse.next());
  }

  const password = process.env.APP_PASSWORD;
  if (process.env.NODE_ENV === "production" && !password)
    return withSecurityHeaders(
      new NextResponse("APP_PASSWORD 설정이 필요합니다.", { status: 503 }),
    );
  if (!password) return NextResponse.next();

  const expectedSession = await sessionToken(password);
  const hasSession =
    req.cookies.get(SESSION_COOKIE)?.value === expectedSession;
  let hasBasicAuth = false;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const [username, supplied] = atob(auth.slice(6)).split(":");
      hasBasicAuth = username === "admin" && supplied === password;
    } catch {}
  }

  if (req.nextUrl.pathname === "/login") {
    if (hasSession || hasBasicAuth)
      return NextResponse.redirect(new URL("/", req.url));
    if (req.method === "POST") {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== req.nextUrl.host)
        return withSecurityHeaders(
          new NextResponse("허용되지 않은 요청 출처입니다.", { status: 403 }),
        );
      const form = await req.formData();
      if (form.get("password") === password) {
        const response = NextResponse.redirect(new URL("/", req.url), 303);
        response.cookies.set(SESSION_COOKIE, expectedSession, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
        return withSecurityHeaders(response);
      }
      return withSecurityHeaders(
        new NextResponse(loginPage("비밀번호가 올바르지 않습니다."), {
          status: 401,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      );
    }
    return withSecurityHeaders(
      new NextResponse(loginPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
  }

  if (hasSession || hasBasicAuth) {
    if (
      req.nextUrl.pathname.startsWith("/api/") &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      const origin = req.headers.get("origin");
      if (origin) {
        try {
          if (new URL(origin).host !== req.nextUrl.host)
            return new NextResponse("허용되지 않은 요청 출처입니다.", {
              status: 403,
            });
        } catch {
          return new NextResponse("유효하지 않은 요청 출처입니다.", {
            status: 403,
          });
        }
      }
    }
    return withSecurityHeaders(NextResponse.next());
  }

  if (req.nextUrl.pathname.startsWith("/api/"))
    return withSecurityHeaders(
      NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    );
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
