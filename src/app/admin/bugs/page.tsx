import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { BugsManager } from "@/components/admin/bugs/bugs-manager";

export const metadata: Metadata = { title: "Bugs" };
export const dynamic = "force-dynamic";

export default async function AdminBugsPage() {
  const [reportsRaw, businesses] = await Promise.all([
    prisma.bugReport.findMany({
      orderBy: { creadoEn: "desc" },
      take: 300,
      include: {
        business: { select: { id: true, nombre: true } },
        _count: { select: { notas: true } },
      },
    }),
    prisma.business.findMany({
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  const reports = reportsRaw.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    businessNombre: r.business.nombre,
    nombreReporta: r.nombreReporta,
    emailReporta: r.emailReporta,
    tipo: r.tipo,
    descripcion: r.descripcion,
    pagina: r.pagina,
    screenshot: r.screenshot,
    estado: r.estado,
    prioridad: r.prioridad,
    creadoEn: r.creadoEn.toISOString(),
    resueltoEn: r.resueltoEn?.toISOString() ?? null,
    notasCount: r._count.notas,
  }));

  return <BugsManager reports={reports} businesses={businesses} />;
}
