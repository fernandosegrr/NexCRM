import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { callerCan } from "@/lib/permissions-server";

export const runtime = "nodejs";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!(await callerCan("gestionar_campanas"))) {
    return NextResponse.json({ error: "Sin permiso para campañas." }, { status: 403 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, businessId: session.user.businessId },
    select: { id: true, estado: true },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
  }

  if (!["borrador", "enviando"].includes(campaign.estado)) {
    return NextResponse.json(
      { error: "No se puede cancelar una campaña completada." },
      { status: 422 },
    );
  }

  await prisma.campaign.update({
    where: { id: params.id },
    data: { estado: "cancelada" },
  });

  return NextResponse.json({ ok: true });
}
