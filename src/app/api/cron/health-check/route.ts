import { type NextRequest, NextResponse } from "next/server";
import { runHealthCheckJob } from "@/lib/jobs/health-check-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint de testing manual. La ejecución programada la dispara el scheduler
// interno (src/lib/scheduler.ts) directamente con runHealthCheckJob().
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runHealthCheckJob();
  return NextResponse.json(result);
}
