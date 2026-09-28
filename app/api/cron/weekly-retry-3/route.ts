import { NextRequest } from "next/server";
import { GET as runWeekly } from "@/app/api/cron/weekly/route";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return runWeekly(req);
}
