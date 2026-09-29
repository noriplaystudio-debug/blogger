import { NextRequest } from "next/server";
import { GET as runDaily } from "../daily/route";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return runDaily(req);
}
