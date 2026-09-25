import { NextRequest } from "next/server";

export function assertCron(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    throw new Error("UNAUTHORIZED_CRON");
}

export function serverKeys() {
  return {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GEMINI_API_KEY,
  };
}
