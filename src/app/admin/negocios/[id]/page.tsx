import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getBusinessById } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { buildN8nSnippets, buildN8nPrompt } from "@/lib/n8n-snippets";
import { shortDate } from "@/lib/format";
import { ChannelBadge } from "@/components/channel-badge";
import { EditBusinessDrawer } from "@/components/admin/business/edit-business-drawer";
import { BusinessDetailTabs } from "@/components/admin/business/business-detail-tabs";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const business = await getBusinessById(params.id);
  return { title: business?.nombre ?? "Negocio" };
}

export default async function BusinessDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [business, funnelStages, businessPlanData, clienteUser] = await Promise.all([
    getBusinessById(params.id),
    prisma.funnelStage.findMany({
      where: { businessId: params.id },
      orderBy: { orden: "asc" },
      select: {
        id: true,
        businessId: true,
        nombre: true,
        orden: true,
        color: true,
        descripcion: true,
        mensajeSeguimiento: true,
        followUpConfig: {
          select: {
            activo: true,
            modoEnvio: true,
            tiempoInactividad: true,
            maxEnviosPorDia: true,
            maxEnviosTotal: true,
          },
        },
      },
    }),
    prisma.business.findUnique({
      where: { id: params.id },
      select: { plan: true },
    }),
    prisma.user.findFirst({
      where: { businessId: params.id, rol: "CLIENTE" },
      select: { id: true, nombre: true, email: true, activo: true },
    }),
  ]);

  if (!business) notFound();

  const appUrl =
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://postgres-nexcrm.d6cr6o.easypanel.host";

  const waInstances = business.instancias.filter((i) => i.canal === "whatsapp");
  const igMsgInstances = business.instancias.filter(
    (i) => i.canal === "instagram" || i.canal === "messenger",
  );

  const waSnippets = waInstances.length > 0
    ? buildN8nSnippets("whatsapp", appUrl)
    : null;
  const igMsgSnippets = igMsgInstances.length > 0
    ? buildN8nSnippets("instagram", appUrl)
    : null;

  const llmPrompt = business.instancias.length > 0
    ? buildN8nPrompt({
        whatsapp: waSnippets ?? undefined,
        igMsg: igMsgSnippets ?? undefined,
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/negocios"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Negocios
        </Link>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {business.nombre}
            </h1>
            {businessPlanData?.plan === "pro" ? (
              <span className="shrink-0 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-500">
                PRO
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                BÁSICO
              </span>
            )}
            <Badge variant={business.activo ? "success" : "muted"} className="shrink-0">
              {business.activo ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <p className="text-sm text-muted-foreground">
              Creado el {shortDate(business.creadoAt)}
            </p>
            <EditBusinessDrawer
              businessId={business.id}
              initialPlan={businessPlanData?.plan ?? "basico"}
              initialTablaMemoria={business.tablaMemoria}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {business.canales.map((c) => (
            <ChannelBadge key={c} canal={c} />
          ))}
        </div>
      </div>

      {/* Tabs */}
      <BusinessDetailTabs
        business={business}
        funnelStages={funnelStages}
        businessPlan={businessPlanData?.plan ?? "basico"}
        waSnippets={waSnippets}
        igMsgSnippets={igMsgSnippets}
        llmPrompt={llmPrompt}
        appUrl={appUrl}
        clienteUser={clienteUser}
      />
    </div>
  );
}
