"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BarChart2,
  Bot,
  Filter,
  Loader2,
  Settings,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { setUserActivo, resetUserPassword } from "@/app/actions/users";
import { updateBusinessTablaMemoria } from "@/app/actions/businesses";
import { ChannelBadge } from "@/components/channel-badge";
import { CopyButton } from "@/components/copy-button";
import { DownloadButton } from "@/components/download-button";
import { EditBusinessDrawer } from "@/components/admin/business/edit-business-drawer";
import { FunnelStageManager } from "@/components/admin/business/funnel-stage-manager";
import { EmbudoStatsSection } from "@/components/admin/business/embudo-stats-section";
import { MetaTokenForm, type MetaTokenStatus } from "@/components/admin/meta-token-form";
import { StatCard } from "@/components/admin/stat-card";
import { MensajesPorDiaChart } from "@/components/charts/mensajes-por-dia";
import { HorasPicoChart } from "@/components/charts/horas-pico";
import { DistribucionCanalChart } from "@/components/charts/distribucion-canal";
import { EmbudoConversionChart } from "@/components/charts/embudo-conversion";
import { SeguimientoStatsChart } from "@/components/charts/seguimiento-stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isCanal } from "@/lib/channels";
import type {
  FunnelStageDTO,
  BusinessMetrics,
  EmbudoStatItem,
} from "@/lib/data";
import { MessageSquare, Users } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

type BusinessInstance = {
  id: string;
  canal: string;
  instanciaId: string;
  activo: boolean;
  metaPageId?: string | null;
  metaHasToken?: boolean;
  metaTokenSetAt?: string | null;
  metaTokenExpiresAt?: string | null;
};

type Snippet = { inicio: string; humanReply: string; fin: string };

export type BusinessDetailTabsProps = {
  business: {
    id: string;
    nombre: string;
    canales: string[];
    activo: boolean;
    plan: string;
    tablaMemoria: string | null;
    instancias: BusinessInstance[];
    totalMensajes: number;
    totalUsuarios: number;
  };
  funnelStages: FunnelStageDTO[];
  businessPlan: string;
  waSnippets: Snippet | null;
  igMsgSnippets: Snippet | null;
  llmPrompt: string | null;
  appUrl: string;
  clienteUser: { id: string; nombre: string; email: string; activo: boolean } | null;
};

// ── SnippetBlock ──────────────────────────────────────────────────────────

function SnippetBlock({
  title,
  rol,
  code,
  filename,
  deprecated,
}: {
  title: string;
  rol: "user" | "bot" | "human" | "page";
  code: string;
  filename: string;
  deprecated?: boolean;
}) {
  const badgeVariant =
    rol === "bot"
      ? "default"
      : rol === "human"
        ? "success"
        : rol === "page"
          ? "secondary"
          : "muted";
  return (
    <div className={`overflow-hidden rounded-lg border border-border bg-background/50${deprecated ? " opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant}>{rol}</Badge>
          <span className="text-sm font-medium">{title}</span>
          {deprecated && (
            <Badge variant="muted" className="text-[10px]">Deprecado</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <CopyButton value={code} />
          <DownloadButton value={code} filename={filename} label=".json" />
        </div>
      </div>
      <pre className="max-h-72 overflow-auto p-4 text-xs leading-relaxed text-muted-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Tab Resumen ───────────────────────────────────────────────────────────

function ResumenTab({ businessId }: { businessId: string }) {
  const [metrics, setMetrics] = useState<BusinessMetrics | null>(null);
  const [embudo, setEmbudo] = useState<EmbudoStatItem[] | null>(null);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/business?businessId=${businessId}&days=${days}`)
      .then((r) => r.json())
      .then((d: { metrics: BusinessMetrics; embudoStats: EmbudoStatItem[] }) => {
        setMetrics(d.metrics);
        setEmbudo(d.embudoStats);
      })
      .catch(() => toast.error("No se pudieron cargar las métricas."))
      .finally(() => setLoading(false));
  }, [businessId, days]);

  const PERIODS = [
    { label: "7 días", value: 7 },
    { label: "14 días", value: 14 },
    { label: "30 días", value: 30 },
    { label: "3 meses", value: 90 },
  ] as const;

  const totalUser = metrics?.mensajesPorDia.reduce((s, d) => s + d.user, 0) ?? 0;
  const totalBot = metrics?.mensajesPorDia.reduce((s, d) => s + d.bot, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.value}
            size="sm"
            variant={days === p.value ? "default" : "outline"}
            onClick={() => setDays(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={MessageSquare} value={totalUser + totalBot} label="Total mensajes" />
          <StatCard icon={MessageSquare} value={totalUser} label="Mensajes de usuario" />
          <StatCard icon={Bot} value={totalBot} label="Respuestas bot" />
          <StatCard
            icon={Users}
            value={embudo?.reduce((s, e) => s + e.totalContactos, 0) ?? 0}
            label="Contactos en embudo"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Mensajes por día">
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : (
            <MensajesPorDiaChart data={metrics?.mensajesPorDia ?? []} />
          )}
        </ChartCard>

        <ChartCard title="Horas pico (últimos 30 días)">
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : (
            <HorasPicoChart data={metrics?.horasPico ?? []} />
          )}
        </ChartCard>

        <ChartCard title="Distribución por canal">
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : (
            <DistribucionCanalChart data={metrics?.distribucionCanal ?? []} />
          )}
        </ChartCard>

        <ChartCard title="Contactos por etapa del embudo">
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : (
            <EmbudoConversionChart data={embudo ?? []} />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Seguimientos automáticos por etapa">
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        ) : (
          <SeguimientoStatsChart data={embudo ?? []} />
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="rounded-xl border border-border bg-card p-4">{children}</div>
    </div>
  );
}

// ── Tab Configuración ─────────────────────────────────────────────────────

function ConfiguracionTab({ business }: { business: BusinessDetailTabsProps["business"] }) {
  const [tablaMemoria, setTablaMemoria] = useState(business.tablaMemoria ?? "");
  const [savedTabla, setSavedTabla] = useState(business.tablaMemoria ?? "");
  const [pending, start] = useTransition();

  const igMsgInstances = business.instancias.filter(
    (i) => i.canal === "instagram" || i.canal === "messenger",
  );

  function saveTablaMemoria() {
    start(async () => {
      const r = await updateBusinessTablaMemoria(
        business.id,
        tablaMemoria.trim() || null,
      );
      if (r.ok) {
        setSavedTabla(tablaMemoria);
        toast.success("Tabla de memoria actualizada.");
      } else {
        toast.error(r.error ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Datos generales */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Datos generales</h2>
          <EditBusinessDrawer
            businessId={business.id}
            initialPlan={business.plan}
            initialTablaMemoria={business.tablaMemoria}
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{business.nombre}</span>
            {business.plan === "pro" ? (
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-500">
                PRO
              </span>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                BÁSICO
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {business.canales.map((c) => (
              <ChannelBadge key={c} canal={c} />
            ))}
          </div>
        </div>
      </section>

      {/* Canales e instancias */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Canales e instancias</h2>
        {business.instancias.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Sin instancias registradas
          </p>
        ) : (
          <div className="space-y-3">
            {business.instancias.map((i) => (
              <div
                key={i.id}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ChannelBadge canal={isCanal(i.canal) ? i.canal : "whatsapp"} />
                  <code className="rounded bg-muted px-2 py-1 text-xs">
                    {i.instanciaId}
                  </code>
                  <span
                    className={`ml-auto text-xs font-medium ${i.activo ? "text-emerald-400" : "text-muted-foreground"}`}
                  >
                    {i.activo ? "Activa" : "Inactiva"}
                  </span>
                </div>

                {(i.canal === "instagram" || i.canal === "messenger") && (
                  <MetaTokenForm
                    instanceId={i.id}
                    canal={i.canal}
                    initialStatus={{
                      hasToken: i.metaHasToken ?? false,
                      pageId: i.metaPageId ?? null,
                      setAt: i.metaTokenSetAt ?? null,
                      expiresAt: i.metaTokenExpiresAt ?? null,
                    } satisfies MetaTokenStatus}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tabla de memoria del bot */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Configuración del bot</h2>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="tabla-memoria">Tabla de memoria (n8n)</Label>
            <div className="flex gap-2">
              <Input
                id="tabla-memoria"
                value={tablaMemoria}
                onChange={(e) => setTablaMemoria(e.target.value)}
                placeholder="ej: memory_negocio"
                className="font-mono text-sm"
              />
              <Button
                size="sm"
                onClick={saveTablaMemoria}
                disabled={pending || tablaMemoria === savedTabla}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : "Guardar"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nombre exacto de la tabla en la BD de n8n. Déjalo vacío si no usas
              seguimiento automático.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Tab Bot / n8n ─────────────────────────────────────────────────────────

function BotTab({
  business,
  waSnippets,
  igMsgSnippets,
  llmPrompt,
  appUrl,
}: {
  business: BusinessDetailTabsProps["business"];
  waSnippets: Snippet | null;
  igMsgSnippets: Snippet | null;
  llmPrompt: string | null;
  appUrl: string;
}) {
  const waInstances = business.instancias.filter((i) => i.canal === "whatsapp");
  const igMsgInstances = business.instancias.filter(
    (i) => i.canal === "instagram" || i.canal === "messenger",
  );

  if (business.instancias.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Este negocio no tiene instancias registradas.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Copia estos nodos{" "}
          <span className="font-medium text-foreground">HTTP Request</span> en tu
          flujo de n8n. Apuntan a{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {appUrl}/api/messages
          </code>
        </p>
      </div>

      {llmPrompt && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Prompt para agente IA</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pégalo en un LLM junto con el JSON de tu flujo n8n.
            </p>
          </div>
          <CopyButton
            value={llmPrompt}
            label="Copiar prompt"
            copiedLabel="Copiado"
            className="shrink-0"
          />
        </div>
      )}

      {waSnippets && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge canal="whatsapp" />
            {waInstances.map((i) => (
              <code key={i.id} className="rounded bg-muted px-2 py-1 text-xs">
                {i.instanciaId}
              </code>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <SnippetBlock
              title="Inicio (usuario)"
              rol="user"
              code={waSnippets.inicio}
              filename="crm-whatsapp-inicio.json"
            />
            <SnippetBlock
              title="Respuesta humana (fromMe=true)"
              rol="human"
              code={waSnippets.humanReply}
              filename="crm-whatsapp-human-reply.json"
            />
            <SnippetBlock
              title="Respuesta del bot (fin)"
              rol="bot"
              code={waSnippets.fin}
              filename="crm-whatsapp-fin.json"
            />
          </div>
        </div>
      )}

      {igMsgSnippets && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {igMsgInstances.map((i) => (
              <ChannelBadge key={i.id} canal={isCanal(i.canal) ? i.canal : "instagram"} />
            ))}
            {igMsgInstances.map((i) => (
              <code key={i.id} className="rounded bg-muted px-2 py-1 text-xs">
                {i.instanciaId}
              </code>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <SnippetBlock
              title="Inicio (usuario — is_echo=false)"
              rol="user"
              code={igMsgSnippets.inicio}
              filename="crm-ig-messenger-inicio.json"
            />
            <SnippetBlock
              title="Echo de página (is_echo=true)"
              rol="page"
              code={igMsgSnippets.humanReply}
              filename="crm-ig-messenger-echo.json"
            />
            <SnippetBlock
              title="Respuesta del bot (fin)"
              rol="bot"
              code={igMsgSnippets.fin}
              filename="crm-ig-messenger-fin.json"
              deprecated
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab Usuario ───────────────────────────────────────────────────────────

function UsuarioTab({
  clienteUser,
}: {
  clienteUser: BusinessDetailTabsProps["clienteUser"];
}) {
  const [activo, setActivo] = useState(clienteUser?.activo ?? false);
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pending, start] = useTransition();

  if (!clienteUser) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">Sin usuario cliente asignado</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Ve a{" "}
          <a
            href="/admin/usuarios"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Usuarios
          </a>{" "}
          para crear uno y asignarlo a este negocio.
        </p>
      </div>
    );
  }

  function toggleActivo() {
    start(async () => {
      const newVal = !activo;
      const r = await setUserActivo(clienteUser!.id, newVal);
      if (r.ok) {
        setActivo(newVal);
        toast.success(newVal ? "Usuario activado." : "Usuario desactivado.");
      } else {
        toast.error(r.error ?? "No se pudo actualizar.");
      }
    });
  }

  function changePassword() {
    start(async () => {
      const r = await resetUserPassword(clienteUser!.id, newPassword);
      if (r.ok) {
        toast.success("Contraseña actualizada.");
        setNewPassword("");
        setShowPwForm(false);
      } else {
        toast.error(r.error ?? "No se pudo cambiar la contraseña.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="size-4" />
            </div>
            <div>
              <p className="font-medium leading-none">{clienteUser.nombre}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{clienteUser.email}</p>
            </div>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              activo
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {activo ? "Activo" : "Inactivo"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPwForm(!showPwForm)}
          >
            Cambiar contraseña
          </Button>
          <Button
            size="sm"
            variant={activo ? "destructive" : "outline"}
            onClick={toggleActivo}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : activo ? (
              "Desactivar acceso"
            ) : (
              "Activar acceso"
            )}
          </Button>
        </div>

        {showPwForm && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <div className="flex gap-2">
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
              <Button
                size="sm"
                onClick={changePassword}
                disabled={pending || newPassword.length < 6}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function BusinessDetailTabs({
  business,
  funnelStages,
  businessPlan,
  waSnippets,
  igMsgSnippets,
  llmPrompt,
  appUrl,
  clienteUser,
}: BusinessDetailTabsProps) {
  return (
    <Tabs defaultValue="resumen" className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="resumen">
          <BarChart2 className="size-4" />
          Resumen
        </TabsTrigger>
        <TabsTrigger value="configuracion">
          <Settings className="size-4" />
          Configuración
        </TabsTrigger>
        <TabsTrigger value="embudo">
          <Filter className="size-4" />
          Embudo
        </TabsTrigger>
        <TabsTrigger value="bot">
          <Bot className="size-4" />
          Bot / n8n
        </TabsTrigger>
        <TabsTrigger value="usuario">
          <User className="size-4" />
          Usuario
        </TabsTrigger>
      </TabsList>

      <TabsContent value="resumen">
        <ResumenTab businessId={business.id} />
      </TabsContent>

      <TabsContent value="configuracion">
        <ConfiguracionTab business={business} />
      </TabsContent>

      <TabsContent value="embudo">
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold">Embudo de ventas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Define las etapas del funnel. Arrastra para reordenar.
            </p>
          </div>
          <FunnelStageManager
            businessId={business.id}
            businessPlan={businessPlan as "basico" | "pro"}
            initialStages={funnelStages}
          />
          <EmbudoStatsSection businessId={business.id} />
        </div>
      </TabsContent>

      <TabsContent value="bot">
        <BotTab
          business={business}
          waSnippets={waSnippets}
          igMsgSnippets={igMsgSnippets}
          llmPrompt={llmPrompt}
          appUrl={appUrl}
        />
      </TabsContent>

      <TabsContent value="usuario">
        <UsuarioTab clienteUser={clienteUser} />
      </TabsContent>
    </Tabs>
  );
}
