import { NextRequest } from "next/server";

// Temporary maintenance stop requested by the user on 2026-10-01.
// Keep this code-level guard in addition to removing Vercel schedules so an
// accidental/manual cron invocation cannot spend provider tokens while the
// article pipeline is being stabilized.
export const AUTOMATION_MAINTENANCE_PAUSED = true;

export function assertCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    throw new Error("UNAUTHORIZED_CRON");
  if (AUTOMATION_MAINTENANCE_PAUSED)
    throw new Error("AUTOMATION_MAINTENANCE_PAUSED");
}

export function serverKeys() {
  return {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GEMINI_API_KEY,
  };
}
