import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId requerido" }, { status: 400 });
  }

  // CLIENTE solo puede ver las etapas de su propio negocio
  if (
    session.user.rol !== "ADMIN" &&
    session.user.businessId !== businessId
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const stages = await prisma.funnelStage.findMany({
    where: { businessId },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      businessId: true,
      nombre: true,
      orden: true,
      color: true,
      descripcion: true,
      mensajeSeguimiento: true,
    },
  });

  return NextResponse.json({ stages });
}
