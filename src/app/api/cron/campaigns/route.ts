import { type NextRequest, NextResponse } from "next/server";
import { runCampaignsJob } from "@/lib/jobs/campaigns-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint de testing manual. La ejecución programada la dispara el scheduler
// interno (src/lib/scheduler.ts) directamente con runCampaignsJob().
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runCampaignsJob();
  return NextResponse.json(result);
}
