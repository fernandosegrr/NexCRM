import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { callerCan } from "@/lib/permissions-server";

export const runtime = "nodejs";

export async function GET(
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
    include: {
      logs: {
        orderBy: { enviadoAt: "desc" },
        take: 20,
        select: { uidUsuario: true, estado: true, error: true, enviadoAt: true },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}
