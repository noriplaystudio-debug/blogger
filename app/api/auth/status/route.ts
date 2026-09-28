import { NextResponse } from "next/server";
import { hasDatabase, hasStoredGoogleCredentials } from "@/lib/store";
import { reportTokenConfigured } from "@/lib/report-auth";

export const dynamic = "force-dynamic";

/** Public, non-secret handoff status used to show the user when interaction is needed. */
export async function GET() {
  let googleConnected = false;
  if (hasDatabase()) {
    try {
      googleConnected = await hasStoredGoogleCredentials();
    } catch {
      googleConnected = false;
    }
  }
  return NextResponse.json(
    {
      dashboardLoginUrl: "/login",
      dashboardPasswordConfigured: Boolean(process.env.APP_PASSWORD),
      googleConnected,
      reportAccessConfigured: reportTokenConfigured(),
      needsUserAction:
        !process.env.APP_PASSWORD || !googleConnected || !reportTokenConfigured(),
      actions: {
        dashboardLogin: !process.env.APP_PASSWORD ? "Vercel APP_PASSWORD 설정" : "/login",
        googleOAuth: googleConnected ? null : "/api/auth/google",
        unattendedReports: reportTokenConfigured()
          ? null
          : "Vercel REPORT_ACCESS_TOKEN 설정",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
