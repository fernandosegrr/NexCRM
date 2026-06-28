import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type TimelineEvent =
  | { tipo: "mensaje"; rol: string; contenido: string | null; fecha: string }
  | { tipo: "etapa"; nombreEtapa: string; fecha: string }
  | { tipo: "seguimiento"; decision: string; etapaDetectada: string | null; fecha: string }
  | { tipo: "nota"; contenido: string; autor: string; fecha: string };

export async function GET(
  req: NextRequest,
  { params }: { params: { contactId: string } },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const businessId = session.user.businessId;

  const instanceIds = await prisma.businessInstance
    .findMany({ where: { businessId }, select: { instanciaId: true } })
    .then((rows) => rows.map((r) => r.instanciaId));

  const contact = await prisma.contact.findFirst({
    where: {
      id: params.contactId,
      instanciaId: { in: instanceIds },
    },
    select: { id: true, uidUsuario: true, instanciaId: true },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contacto no encontrado." }, { status: 404 });
  }

  const [mensajes, etapas, seguimientos, notas] = await Promise.all([
    prisma.message.findMany({
      where: { instanciaId: contact.instanciaId, uidUsuario: contact.uidUsuario },
      orderBy: { enviadoAt: "desc" },
      take: 30,
      select: { rol: true, contenido: true, enviadoAt: true },
    }),
    prisma.contactStage.findMany({
      where: { contactId: contact.id },
      orderBy: { asignadoAt: "desc" },
      include: { stage: { select: { nombre: true } } },
    }),
    prisma.followUpLog.findMany({
      where: { contactId: contact.id },
      orderBy: { creadoAt: "desc" },
      take: 15,
      select: { decision: true, etapaDetectada: true, creadoAt: true },
    }),
    prisma.contactNote.findMany({
      where: { contactId: contact.id },
      orderBy: { creadoAt: "desc" },
      take: 15,
      select: { contenido: true, creadoPor: true, creadoAt: true },
    }),
  ]);

  const events: TimelineEvent[] = [];

  for (const m of mensajes) {
    events.push({
      tipo: "mensaje",
      rol: m.rol,
      contenido: m.contenido,
      fecha: m.enviadoAt.toISOString(),
    });
  }
  for (const e of etapas) {
    events.push({
      tipo: "etapa",
      nombreEtapa: e.stage.nombre,
      fecha: e.asignadoAt.toISOString(),
    });
  }
  for (const s of seguimientos) {
    events.push({
      tipo: "seguimiento",
      decision: s.decision,
      etapaDetectada: s.etapaDetectada,
      fecha: s.creadoAt.toISOString(),
    });
  }
  for (const n of notas) {
    events.push({
      tipo: "nota",
      contenido: n.contenido,
      autor: n.creadoPor,
      fecha: n.creadoAt.toISOString(),
    });
  }

  events.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return NextResponse.json({ events: events.slice(0, 50) });
}
