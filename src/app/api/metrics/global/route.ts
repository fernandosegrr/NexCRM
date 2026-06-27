import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getGlobalStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const stats = await getGlobalStats(14);
  return NextResponse.json(stats);
}
