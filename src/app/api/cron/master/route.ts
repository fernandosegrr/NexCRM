import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint de testing manual de los jobs. La ejecución programada la maneja el
// scheduler interno (src/lib/scheduler.ts); esto NO requiere cron externo.
//   curl -H "Authorization: Bearer {CRON_SECRET}" .../api/cron/master
//   curl -H "Authorization: Bearer {CRON_SECRET}" .../api/cron/master?job=health-check
export async function GET(req: Request) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const job = url.searchParams.get("job"); // opcional: correr un job específico

  const results: Record<string, unknown> = {};

  if (!job || job === "health-check") {
    const { runHealthCheckJob } = await import("@/lib/jobs/health-check-job");
    results["health-check"] = await runHealthCheckJob().catch((e) => ({ error: String(e) }));
  }
  if (!job || job === "follow-up") {
    const { runFollowUpJob } = await import("@/lib/jobs/follow-up-job");
    results["follow-up"] = await runFollowUpJob().catch((e) => ({ error: String(e) }));
  }
  if (!job || job === "campaigns") {
    const { runCampaignsJob } = await import("@/lib/jobs/campaigns-job");
    results["campaigns"] = await runCampaignsJob().catch((e) => ({ error: String(e) }));
  }
  if (!job || job === "weekly-summary") {
    const { runWeeklySummaryJob } = await import("@/lib/jobs/weekly-summary-job");
    results["weekly-summary"] = await runWeeklySummaryJob().catch((e) => ({ error: String(e) }));
  }
  if (!job || job === "payments") {
    const { runPaymentsJob } = await import("@/lib/jobs/payments-job");
    results["payments"] = await runPaymentsJob().catch((e) => ({ error: String(e) }));
  }

  return NextResponse.json(results);
}
