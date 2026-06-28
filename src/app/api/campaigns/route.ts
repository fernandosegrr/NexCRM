import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { callerCan } from "@/lib/permissions-server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!(await callerCan("gestionar_campanas"))) {
    return NextResponse.json({ error: "Sin permiso para campañas." }, { status: 403 });
  }

  const campaigns = await prisma.campaign.findMany({
    where: { businessId: session.user.businessId },
    orderBy: { creadoAt: "desc" },
    select: {
      id: true,
      nombre: true,
      canal: true,
      estado: true,
      totalContactos: true,
      enviados: true,
      fallidos: true,
      creadoAt: true,
      iniciadoAt: true,
      completadoAt: true,
    },
  });

  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!(await callerCan("gestionar_campanas"))) {
    return NextResponse.json({ error: "Sin permiso para campañas." }, { status: 403 });
  }

  const businessId = session.user.businessId;

  let body: {
    nombre?: string;
    mensaje?: string;
    instanciaId?: string;
    filtroEtapa?: string;
    delayMin?: number;
    delayMax?: number;
    riesgoAceptado?: boolean;
  };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { nombre, mensaje, instanciaId, filtroEtapa, delayMin = 8, delayMax = 20, riesgoAceptado } = body;

  if (!nombre?.trim() || !mensaje?.trim() || !instanciaId) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 422 });
  }

  if (!riesgoAceptado) {
    return NextResponse.json({ error: "Debes aceptar los riesgos antes de crear una campaña." }, { status: 422 });
  }

  // Verificar que la instancia pertenece al negocio
  const instance = await prisma.businessInstance.findFirst({
    where: { instanciaId, businessId, canal: "whatsapp", activo: true },
    select: { instanciaId: true },
  });

  if (!instance) {
    return NextResponse.json({ error: "Instancia no encontrada." }, { status: 404 });
  }

  // Contar contactos según filtro
  let totalContactos: number;
  if (filtroEtapa) {
    const stage = await prisma.funnelStage.findFirst({
      where: { id: filtroEtapa, businessId },
      select: { id: true },
    });
    if (!stage) {
      return NextResponse.json({ error: "Etapa no encontrada." }, { status: 404 });
    }
    totalContactos = await prisma.contactStage.count({
      where: { stageId: filtroEtapa, businessId },
    });
  } else {
    totalContactos = await prisma.contact.count({
      where: { instanciaId },
    });
  }

  if (totalContactos === 0) {
    return NextResponse.json({ error: "No hay contactos que cumplan el filtro." }, { status: 422 });
  }

  // Normalizar delays: clamp a [5,60] y garantizar min <= max
  const dMin = Math.max(5, Math.min(60, delayMin));
  const dMax = Math.max(5, Math.min(60, delayMax));

  const campaign = await prisma.campaign.create({
    data: {
      businessId,
      nombre: nombre.trim(),
      mensaje: mensaje.trim(),
      canal: "whatsapp",
      instanciaId,
      filtroEtapa: filtroEtapa ?? null,
      totalContactos,
      delayMin: Math.min(dMin, dMax),
      delayMax: Math.max(dMin, dMax),
      riesgoAceptado: true,
    },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
