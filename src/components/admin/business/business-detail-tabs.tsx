"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BarChart2,
  Bot,
  Check,
  Filter,
  Loader2,
  MoreVertical,
  Plus,
  Settings,
  Shield,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { resetUserPassword } from "@/app/actions/users";
import { updateBusinessTablaMemoria } from "@/app/actions/businesses";
import {
  createBusinessRole,
  updateBusinessRole,
  deleteBusinessRole,
  inviteTeamMember,
  updateMemberRole,
  setMemberActivo,
  resetMemberPassword,
} from "@/app/actions/team";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isCanal } from "@/lib/channels";
import {
  PERMISOS_POR_CATEGORIA,
  PERMISO_LABELS,
  TODOS_LOS_PERMISOS,
  type Permiso,
} from "@/lib/permissions";
import type {
  FunnelStageDTO,
  BusinessMetrics,
  EmbudoStatItem,
} from "@/lib/data";
import { MessageSquare } from "lucide-react";

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

type TeamMember = {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  businessRoleId: string | null;
  businessRole: { nombre: string } | null;
};

type BusinessRoleWithCount = {
  id: string;
  businessId: string;
  nombre: string;
  permisos: string[];
  creadoAt: Date;
  _count: { usuarios: number };
};

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
  teamMembers: TeamMember[];
  businessRoles: BusinessRoleWithCount[];
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

                {i.canal === "whatsapp" && (
                  <QrSection instanciaId={i.instanciaId} instanceDbId={i.id} />
                )}

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

// ── QR Section (dentro de ConfiguracionTab, instancias WA) ────────────────

function QrSection({ instanciaId, instanceDbId }: { instanciaId: string; instanceDbId: string }) {
  const [status, setStatus] = useState<"unknown" | "open" | "close">("unknown");
  const [qr, setQr] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/instances/${instanceDbId}/status`)
      .then((r) => r.json())
      .then((d: { status: string }) => {
        // Evolution devuelve "open" cuando la sesión está activa.
        setStatus(d.status === "open" ? "open" : "close");
      })
      .catch(() => setStatus("unknown"));
  }, [instanceDbId]);

  useEffect(() => {
    if (!open || status === "open") return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/instances/${instanceDbId}/status`);
        const d = await r.json() as { status: string };
        if (d.status === "open") {
          setStatus("open");
          setOpen(false);
          toast.success("¡WhatsApp conectado exitosamente!");
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [open, status, instanceDbId]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function generateQr() {
    setLoadingQr(true);
    setQr(null);
    try {
      const r = await fetch(`/api/admin/instances/${instanceDbId}/qr`, { method: "POST" });
      const d = await r.json() as { qr?: string; connected?: boolean; error?: string };
      if (d.connected) {
        setStatus("open");
        toast.success("La instancia ya está conectada.");
        setOpen(false);
      } else if (d.qr) {
        setQr(d.qr);
        setCountdown(30);
      } else {
        toast.error(d.error ?? "No se pudo obtener el QR.");
      }
    } catch {
      toast.error("Error al generar el QR.");
    } finally {
      setLoadingQr(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-t border-border pt-3">
      <span className="text-xs text-muted-foreground">Estado:</span>
      {status === "open" ? (
        <span className="text-xs font-medium text-emerald-400">🟢 Conectado</span>
      ) : status === "close" ? (
        <span className="text-xs font-medium text-red-400">🔴 Desconectado</span>
      ) : (
        <span className="text-xs text-muted-foreground">Verificando…</span>
      )}

      {status !== "open" && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setOpen(true); generateQr(); }}>
              Generar QR
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[380px] sm:w-[420px]">
            <SheetHeader>
              <SheetTitle>Conectar WhatsApp</SheetTitle>
            </SheetHeader>
            <div className="mt-6 flex flex-col items-center gap-6">
              <p className="text-sm text-muted-foreground text-center">
                Abre WhatsApp en tu teléfono → <strong>Dispositivos vinculados</strong> → <strong>Vincular dispositivo</strong>
              </p>

              {loadingQr && (
                <div className="flex h-48 w-48 items-center justify-center">
                  <Loader2 className="size-10 animate-spin text-muted-foreground" />
                </div>
              )}

              {qr && !loadingQr && (
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={`data:image/png;base64,${qr}`}
                    alt="Código QR de WhatsApp"
                    className="h-48 w-48 rounded-lg border border-border"
                  />
                  {countdown > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Expira en <strong className="text-foreground">{countdown}s</strong>
                    </p>
                  ) : (
                    <p className="text-sm text-destructive">QR expirado</p>
                  )}
                </div>
              )}

              <Button
                onClick={generateQr}
                disabled={loadingQr || countdown > 0}
                variant="outline"
                size="sm"
              >
                {loadingQr ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Regenerar QR
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
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

// ── Tab Equipo ────────────────────────────────────────────────────────────

function RoleDrawer({
  businessId,
  role,
  onDone,
}: {
  businessId: string;
  role?: BusinessRoleWithCount;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(role?.nombre ?? "");
  const [selectedPermisos, setSelectedPermisos] = useState<Set<string>>(
    new Set(role?.permisos ?? []),
  );
  const [pending, start] = useTransition();

  function togglePermiso(p: string) {
    setSelectedPermisos((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function handleOpen(v: boolean) {
    if (v) {
      setNombre(role?.nombre ?? "");
      setSelectedPermisos(new Set(role?.permisos ?? []));
    }
    setOpen(v);
  }

  function handleSubmit() {
    start(async () => {
      const data = { nombre, permisos: Array.from(selectedPermisos) };
      const r = role
        ? await updateBusinessRole(role.id, data)
        : await createBusinessRole(businessId, data);
      if (r.ok) {
        toast.success(role ? "Rol actualizado." : "Rol creado.");
        setOpen(false);
        onDone();
      } else {
        toast.error(r.error ?? "No se pudo guardar el rol.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        {role ? (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
            Editar
          </DropdownMenuItem>
        ) : (
          <Button size="sm" variant="outline">
            <Plus className="size-4 mr-1.5" /> Nuevo rol
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden sm:w-[420px]">
        <SheetHeader className="shrink-0">
          <SheetTitle>{role ? "Editar rol" : "Nuevo rol"}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="role-nombre">Nombre del rol</Label>
              <Input
                id="role-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej: Supervisor"
              />
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium">Permisos</p>
              {Object.entries(PERMISOS_POR_CATEGORIA).map(([cat, permisos]) => (
                <div key={cat} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {cat}
                  </p>
                  {permisos.map((p) => (
                    <div key={p} className="flex items-center gap-2.5">
                      <Checkbox
                        id={p}
                        checked={selectedPermisos.has(p)}
                        onCheckedChange={() => togglePermiso(p)}
                      />
                      <Label htmlFor={p} className="text-sm font-normal cursor-pointer">
                        {PERMISO_LABELS[p as Permiso]}
                      </Label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t bg-background pt-4 pb-2">
          <Button
            onClick={handleSubmit}
            disabled={pending || !nombre.trim()}
            className="w-full"
          >
            {pending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {role ? "Guardar cambios" : "Crear rol"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MemberDrawer({
  businessId,
  member,
  roles,
  onDone,
}: {
  businessId: string;
  member?: TeamMember;
  roles: BusinessRoleWithCount[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(member?.nombre ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(member?.businessRoleId ?? "");
  const [pending, start] = useTransition();

  function handleSubmit() {
    start(async () => {
      if (!member) {
        const r = await inviteTeamMember(businessId, {
          nombre,
          email,
          password,
          businessRoleId: roleId,
        });
        if (r.ok) {
          toast.success("Miembro agregado.");
          setOpen(false);
          onDone();
        } else {
          toast.error(r.error ?? "No se pudo agregar el miembro.");
        }
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {member ? (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
            Cambiar contraseña
          </DropdownMenuItem>
        ) : (
          <Button size="sm" variant="outline">
            <Plus className="size-4 mr-1.5" /> Agregar miembro
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px]">
        <SheetHeader>
          <SheetTitle>{member ? "Cambiar contraseña" : "Agregar miembro"}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {!member && (
            <>
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.com" />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>{member ? "Nueva contraseña" : "Contraseña temporal"}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
          {!member && (
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            onClick={member ? async () => {
              start(async () => {
                const r = await resetMemberPassword(member.id, password);
                if (r.ok) { toast.success("Contraseña actualizada."); setOpen(false); onDone(); }
                else toast.error(r.error ?? "No se pudo cambiar.");
              });
            } : handleSubmit}
            disabled={pending || password.length < 6 || (!member && (!nombre || !email || !roleId))}
            className="w-full"
          >
            {pending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {member ? "Guardar contraseña" : "Agregar miembro"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EquipoTab({
  businessId,
  initialMembers,
  initialRoles,
}: {
  businessId: string;
  initialMembers: TeamMember[];
  initialRoles: BusinessRoleWithCount[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [roles, setRoles] = useState(initialRoles);
  const [pending, start] = useTransition();

  async function refresh() {
    // Revalidación pasa por revalidatePath del server action; forzar reload de la sección
    window.location.reload();
  }

  function handleDeleteRole(roleId: string) {
    start(async () => {
      const r = await deleteBusinessRole(roleId);
      if (r.ok) {
        toast.success("Rol eliminado.");
        setRoles((prev) => prev.filter((r) => r.id !== roleId));
      } else {
        toast.error(r.error ?? "No se pudo eliminar.");
      }
    });
  }

  function handleToggleMember(userId: string, activo: boolean) {
    start(async () => {
      const r = await setMemberActivo(userId, activo);
      if (r.ok) {
        toast.success(activo ? "Usuario activado." : "Usuario desactivado.");
        setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, activo } : m));
      } else {
        toast.error(r.error ?? "No se pudo actualizar.");
      }
    });
  }

  return (
    <div className="space-y-10">
      {/* Sección Roles */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Roles</h2>
            <p className="text-sm text-muted-foreground">
              Define los permisos de cada tipo de usuario.
            </p>
          </div>
          <RoleDrawer businessId={businessId} onDone={refresh} />
        </div>

        {roles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Sin roles creados. Crea el primero.
          </p>
        ) : (
          <div className="space-y-3">
            {roles.map((role) => {
              const preview = role.permisos.slice(0, 3);
              const extra = role.permisos.length - 3;
              return (
                <div
                  key={role.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <Shield className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{role.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {role._count.usuarios} usuario{role._count.usuarios !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {preview.map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px]">
                        {PERMISO_LABELS[p as Permiso] ?? p}
                      </Badge>
                    ))}
                    {extra > 0 && (
                      <Badge variant="muted" className="text-[10px]">
                        y {extra} más
                      </Badge>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="size-8 shrink-0">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <RoleDrawer businessId={businessId} role={role} onDone={refresh} />
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={role._count.usuarios > 0 || pending}
                        onSelect={() => handleDeleteRole(role.id)}
                      >
                        <Trash2 className="size-4 mr-2" />
                        Eliminar
                        {role._count.usuarios > 0 && (
                          <span className="ml-2 text-muted-foreground text-xs">(con usuarios)</span>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Sección Miembros */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Miembros</h2>
            <p className="text-sm text-muted-foreground">
              Usuarios con acceso al dashboard de este negocio.
            </p>
          </div>
          <MemberDrawer businessId={businessId} roles={roles} onDone={refresh} />
        </div>

        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Sin miembros. Agrega el primero.
          </p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => {
              const initial = m.nombre.charAt(0).toUpperCase();
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.nombre}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.businessRole && (
                      <Badge variant="secondary" className="text-xs">
                        {m.businessRole.nombre}
                      </Badge>
                    )}
                    <Badge
                      variant={m.activo ? "success" : "muted"}
                      className="text-[10px]"
                    >
                      {m.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="size-8 shrink-0">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <MemberDrawer
                        businessId={businessId}
                        member={m}
                        roles={roles}
                        onDone={refresh}
                      />
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={pending}
                        onSelect={() => handleToggleMember(m.id, !m.activo)}
                        className={!m.activo ? "" : "text-destructive focus:text-destructive"}
                      >
                        {m.activo ? (
                          <><X className="size-4 mr-2" />Desactivar acceso</>
                        ) : (
                          <><Check className="size-4 mr-2" />Activar acceso</>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </section>
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
  teamMembers,
  businessRoles,
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
        <TabsTrigger value="equipo">
          <Users className="size-4" />
          Equipo
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

      <TabsContent value="equipo">
        <EquipoTab
          businessId={business.id}
          initialMembers={teamMembers}
          initialRoles={businessRoles}
        />
      </TabsContent>
    </Tabs>
  );
}
