import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/cron/")) return NextResponse.next();
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
  const password = process.env.APP_PASSWORD;
  if (process.env.NODE_ENV === "production" && !password)
    return new NextResponse("APP_PASSWORD 설정이 필요합니다.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  if (!password) return NextResponse.next();
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const [username, supplied] = atob(auth.slice(6)).split(":");
      if (username === "admin" && supplied === password) {
        const response = NextResponse.next();
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Frame-Options", "DENY");
        response.headers.set(
          "Referrer-Policy",
          "strict-origin-when-cross-origin",
        );
        response.headers.set(
          "Permissions-Policy",
          "camera=(), microphone=(), geolocation=()",
        );
        return response;
      }
    } catch {}
  }
  return new NextResponse("로그인이 필요합니다.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Blogger Agent", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
