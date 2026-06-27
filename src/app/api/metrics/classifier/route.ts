import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { getEmbudoStats } from "@/lib/data";

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

  const stats = await getEmbudoStats(businessId);
  return NextResponse.json(stats);
}
