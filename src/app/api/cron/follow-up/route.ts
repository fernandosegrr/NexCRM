import { type NextRequest, NextResponse } from "next/server";
import { runFollowUpJob } from "@/lib/jobs/follow-up-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint de testing manual. La ejecución programada la dispara el scheduler
// interno (src/lib/scheduler.ts) directamente con runFollowUpJob().
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await runFollowUpJob();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 },
    );
  }
}
