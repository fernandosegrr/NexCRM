import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESTADOS = ["abierto", "en_progreso", "resuelto", "descartado"] as const;
const PRIORIDADES = ["baja", "media", "alta", "critica"] as const;

const patchSchema = z.object({
  estado: z.enum(ESTADOS).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
});

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) return { ok: false as const, status: 401, error: "No autorizado." };
  if (session.user.rol !== "ADMIN") return { ok: false as const, status: 403, error: "Acceso denegado." };
  return { ok: true as const };
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const report = await prisma.bugReport.findUnique({
    where: { id: params.id },
    include: {
      business: { select: { nombre: true } },
      notas: { orderBy: { creadoEn: "asc" } },
    },
  });
  if (!report) {
    return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    id: report.id,
    businessId: report.businessId,
    businessNombre: report.business.nombre,
    nombreReporta: report.nombreReporta,
    emailReporta: report.emailReporta,
    descripcion: report.descripcion,
    pagina: report.pagina,
    screenshot: report.screenshot,
    estado: report.estado,
    prioridad: report.prioridad,
    creadoEn: report.creadoEn.toISOString(),
    resueltoEn: report.resueltoEn?.toISOString() ?? null,
    notas: report.notas.map((n) => ({
      id: n.id,
      contenido: n.contenido,
      creadoEn: n.creadoEn.toISOString(),
    })),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 422 });
  }
  if (!parsed.data.estado && !parsed.data.prioridad) {
    return NextResponse.json({ error: "Nada para actualizar." }, { status: 422 });
  }

  const existing = await prisma.bugReport.findUnique({
    where: { id: params.id },
    select: { id: true, estado: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });
  }

  const data: { estado?: string; prioridad?: string; resueltoEn?: Date | null } = {};
  if (parsed.data.prioridad) data.prioridad = parsed.data.prioridad;
  if (parsed.data.estado) {
    data.estado = parsed.data.estado;
    if (parsed.data.estado === "resuelto" && existing.estado !== "resuelto") {
      data.resueltoEn = new Date();
    } else if (parsed.data.estado !== "resuelto") {
      data.resueltoEn = null;
    }
  }

  const updated = await prisma.bugReport.update({
    where: { id: params.id },
    data,
    select: { id: true, estado: true, prioridad: true, resueltoEn: true },
  });

  return NextResponse.json({
    id: updated.id,
    estado: updated.estado,
    prioridad: updated.prioridad,
    resueltoEn: updated.resueltoEn?.toISOString() ?? null,
  });
}
