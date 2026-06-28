import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId requerido" }, { status: 400 });
  }

  if (session.user.rol !== "ADMIN" && session.user.businessId !== businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const logs = await prisma.followUpLog.findMany({
    where: { businessId, decision: "omitido", aprobado: null },
    include: { contact: { select: { id: true, nombre: true, username: true, fotoPerfil: true } } },
    orderBy: { creadoAt: "desc" },
    take: 50,
  });

  if (logs.length === 0) return NextResponse.json({ suggestions: [] });

  // Deduplicar: un solo log por contactId (el más reciente ya viene primero)
  const seenContacts = new Set<string>();
  const deduped = logs.filter((l) => {
    if (seenContacts.has(l.contactId)) return false;
    seenContacts.add(l.contactId);
    return true;
  });

  const stageIds = Array.from(new Set(deduped.map((l) => l.stageId)));
  const stages = await prisma.funnelStage.findMany({
    where: { id: { in: stageIds } },
    select: { id: true, nombre: true, color: true, mensajeSeguimiento: true },
  });

  const stageMap = Object.fromEntries(stages.map((s) => [s.id, s]));

  const now = new Date();
  const suggestions = deduped.map((l) => {
    const stage = stageMap[l.stageId];
    const horasSinRespuesta = Math.round((now.getTime() - l.creadoAt.getTime()) / 3600000);
    return {
      id: l.id,
      contact: l.contact,
      stageId: l.stageId,
      stageName: stage?.nombre ?? null,
      stageColor: stage?.color ?? null,
      mensajeEnviado: l.mensajeEnviado,
      razonIA: l.razonIA,
      canal: l.canal,
      uidUsuario: l.uidUsuario,
      instanciaId: l.instanciaId,
      creadoAt: l.creadoAt.toISOString(),
      horasSinRespuesta,
    };
  });

  return NextResponse.json({ suggestions });
}
