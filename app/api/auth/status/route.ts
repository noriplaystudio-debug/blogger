import { NextResponse } from "next/server";
import { reportTokenConfigured } from "@/lib/report-auth";

export const dynamic = "force-dynamic";

/** Public, non-secret handoff status used to show the user when interaction is needed. */
export async function GET() {
  // Keep this lightweight probe independent from the database. The dashboard
  // remains the source of truth for the detailed Google connection state.
  const googleConnected: boolean | null = null;
  return NextResponse.json(
    {
      dashboardLoginUrl: "/login",
      dashboardPasswordConfigured: Boolean(process.env.APP_PASSWORD),
      googleConnected,
      reportAccessConfigured: reportTokenConfigured(),
      needsUserAction:
        !process.env.APP_PASSWORD || !reportTokenConfigured(),
      actions: {
        dashboardLogin: !process.env.APP_PASSWORD ? "Vercel APP_PASSWORD 설정" : "/login",
        googleOAuth: "/api/auth/google",
        unattendedReports: reportTokenConfigured()
          ? null
          : "Vercel REPORT_ACCESS_TOKEN 설정",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
