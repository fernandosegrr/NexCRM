import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { getBusinessMetrics, getEmbudoStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId requerido" }, { status: 400 });
  }

  if (
    session.user.rol !== "ADMIN" &&
    session.user.businessId !== businessId
  ) {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.min(Math.max(Number(daysParam), 1), 90) : 14;

  const [metrics, embudoStats] = await Promise.all([
    getBusinessMetrics(businessId, days),
    getEmbudoStats(businessId),
  ]);

  return NextResponse.json({ metrics, embudoStats });
}
