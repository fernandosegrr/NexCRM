import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FunnelStageManager } from "@/components/admin/business/funnel-stage-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Embudo de ventas" };

export default async function DashboardFunnelPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.rol === "ADMIN") redirect("/admin");
  if (!session.user.businessId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No tienes un negocio asignado.
      </div>
    );
  }

  const businessId = session.user.businessId;
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 overflow-y-auto p-4 sm:p-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Conversaciones
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Embudo de ventas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define las etapas de tu embudo. La descripción de cada etapa le sirve al
          clasificador de IA para sugerir en qué etapa va cada contacto. Arrastra para reordenar.
        </p>
      </div>

      <FunnelStageManager businessId={businessId} initialStages={stages} />
    </div>
  );
}
