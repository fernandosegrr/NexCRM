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
import { DeleteBusinessButton } from "@/components/admin/business/delete-business-button";
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
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const [
    business,
    funnelStages,
    businessPlanData,
    teamMembers,
    businessRoles,
    paymentConfigRaw,
    paymentNotificationsRaw,
  ] = await Promise.all([
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
    prisma.user.findMany({
      where: { businessId: params.id, rol: "CLIENTE" },
      select: {
        id: true,
        nombre: true,
        email: true,
        activo: true,
        businessRoleId: true,
        businessRole: { select: { nombre: true } },
      },
      orderBy: { creadoAt: "asc" },
    }),
    prisma.businessRole.findMany({
      where: { businessId: params.id },
      include: { _count: { select: { usuarios: true } } },
      orderBy: { creadoAt: "asc" },
    }),
    prisma.paymentConfig.findUnique({
      where: { businessId: params.id },
      include: { pagos: { orderBy: { fechaPago: "desc" }, take: 12 } },
    }),
    prisma.paymentNotification.findMany({
      where: { businessId: params.id },
      orderBy: { enviadoAt: "desc" },
      take: 10,
    }),
  ]);

  if (!business) notFound();

  // Serializar datos de pago (Date → ISO) para el componente cliente.
  const paymentConfig = paymentConfigRaw
    ? {
        id: paymentConfigRaw.id,
        montoMensual: paymentConfigRaw.montoMensual,
        diasGracia: paymentConfigRaw.diasGracia,
        proximoPago: paymentConfigRaw.proximoPago.toISOString(),
        activo: paymentConfigRaw.activo,
        suspendido: paymentConfigRaw.suspendido,
        suspendidoAt: paymentConfigRaw.suspendidoAt?.toISOString() ?? null,
      }
    : null;
  const payments = (paymentConfigRaw?.pagos ?? []).map((p) => ({
    id: p.id,
    monto: p.monto,
    periodo: p.periodo,
    fechaPago: p.fechaPago.toISOString(),
    notas: p.notas,
  }));
  const paymentNotifications = paymentNotificationsRaw.map((n) => ({
    id: n.id,
    tipo: n.tipo,
    enviadoAt: n.enviadoAt.toISOString(),
    exitoso: n.exitoso,
  }));
  const defaultTab = searchParams?.tab ?? "resumen";

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
            <DeleteBusinessButton
              businessId={business.id}
              businessNombre={business.nombre}
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
        teamMembers={teamMembers}
        businessRoles={businessRoles}
        paymentConfig={paymentConfig}
        payments={payments}
        paymentNotifications={paymentNotifications}
        defaultTab={defaultTab}
      />
    </div>
  );
}
