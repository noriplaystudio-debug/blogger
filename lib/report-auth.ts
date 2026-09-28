import type { NextRequest } from "next/server";

/**
 * Authentication for unattended, read-only reports. This is deliberately
 * separate from the browser dashboard cookie: a scheduled run has no browser
 * cookie to forward. Keep REPORT_ACCESS_TOKEN server-side and rotate it when
 * access is revoked.
 */
export function reportAccessToken() {
  return process.env.REPORT_ACCESS_TOKEN?.trim() || "";
}

export function reportTokenConfigured() {
  return reportAccessToken().length >= 32;
}

function constantTimeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export function isValidReportToken(token: string | null | undefined) {
  const expected = reportAccessToken();
  return Boolean(expected) && constantTimeEqual(token || "", expected);
}

export function requestReportToken(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  if (authorization.startsWith("Bearer "))
    return authorization.slice("Bearer ".length).trim();
  return req.headers.get("x-report-token")?.trim() || "";
}

export function isValidReportRequest(req: NextRequest) {
  return isValidReportToken(requestReportToken(req));
}
