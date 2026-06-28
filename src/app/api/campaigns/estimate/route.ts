import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { callerCan } from "@/lib/permissions-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!(await callerCan("gestionar_campanas"))) {
    return NextResponse.json({ error: "Sin permiso para campañas." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const instanciaId = searchParams.get("instanciaId") ?? "";
  const filtroEtapa = searchParams.get("filtroEtapa") ?? "";

  if (!instanciaId) {
    return NextResponse.json({ total: 0 });
  }

  // Verificar que la instancia pertenece al negocio de la sesión
  const ownsInstance = await prisma.businessInstance.findFirst({
    where: { instanciaId, businessId: session.user.businessId },
    select: { id: true },
  });
  if (!ownsInstance) {
    return NextResponse.json({ total: 0 });
  }

  let total: number;
  if (filtroEtapa) {
    total = await prisma.contactStage.count({
      where: { stageId: filtroEtapa, businessId: session.user.businessId },
    });
  } else {
    total = await prisma.contact.count({ where: { instanciaId } });
  }

  return NextResponse.json({ total });
}
