"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";

import {
  upsertPaymentConfig,
  togglePaymentAlerts,
  registerPayment,
  reactivateBusiness,
} from "@/app/actions/payments";
import { paymentEstado, type PaymentEstado } from "@/lib/payment-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PaymentConfigDTO = {
  id: string;
  montoMensual: number;
  diasGracia: number;
  proximoPago: string;
  activo: boolean;
  suspendido: boolean;
  suspendidoAt: string | null;
} | null;

export type PaymentDTO = {
  id: string;
  monto: number;
  periodo: string;
  fechaPago: string;
  notas: string | null;
};

export type PaymentNotificationDTO = {
  id: string;
  tipo: string;
  enviadoAt: string;
  exitoso: boolean;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

function todayInputValue(): string {
  const now = new Date();
  const mex = new Date(now.getTime() - 6 * 3_600_000);
  return mex.toISOString().slice(0, 10);
}

function isoToInputDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

// ── Badge de estado grande ──────────────────────────────────────────────────

const ESTADO_BADGE: Record<
  PaymentEstado,
  { emoji: string; label: string; className: string }
> = {
  al_corriente: { emoji: "🟢", label: "Al corriente", className: "bg-emerald-500/15 text-emerald-500" },
  por_vencer: { emoji: "🟡", label: "Vence pronto", className: "bg-yellow-500/15 text-yellow-500" },
  vencido: { emoji: "🔴", label: "Vencido", className: "bg-red-500/15 text-red-500" },
  suspendido: { emoji: "⛔", label: "Suspendido", className: "bg-red-600/20 text-red-500" },
  sin_config: { emoji: "⚪", label: "Sin configuración", className: "bg-muted text-muted-foreground" },
};

function EstadoBadge({ config }: { config: PaymentConfigDTO }) {
  const { estado, dias } = paymentEstado(config);
  const cfg = ESTADO_BADGE[estado];

  let detalle = "";
  if (estado === "al_corriente" && config) {
    detalle = `Próximo pago: ${fmtDate(config.proximoPago)} · en ${dias} día${dias !== 1 ? "s" : ""}`;
  } else if (estado === "por_vencer" && config) {
    detalle = `Vence en ${dias} día${dias !== 1 ? "s" : ""} · ${fmtDate(config.proximoPago)}`;
  } else if (estado === "vencido") {
    detalle = `Venció hace ${dias} día${dias !== 1 ? "s" : ""}`;
  } else if (estado === "suspendido" && config?.suspendidoAt) {
    detalle = `Bot suspendido desde ${fmtDate(config.suspendidoAt)}`;
  } else if (estado === "suspendido") {
    detalle = "Bot suspendido";
  }

  return (
    <div className={`flex flex-col gap-1 rounded-xl px-4 py-3 ${cfg.className}`}>
      <span className="text-base font-semibold">
        {cfg.emoji} {cfg.label}
      </span>
      {detalle && <span className="text-sm opacity-90">{detalle}</span>}
    </div>
  );
}

// ── Badges de notificaciones ────────────────────────────────────────────────

const NOTIF_META: Record<
  string,
  { label: string; variant: "secondary" | "outline" | "destructive"; className?: string }
> = {
  aviso_7d: { label: "Aviso 7 días", variant: "secondary" },
  aviso_3d: { label: "Aviso 3 días", variant: "secondary" },
  aviso_1d: { label: "Aviso 1 día", variant: "secondary" },
  dia_vencimiento: { label: "Día de vencimiento", variant: "outline", className: "border-yellow-500/50 text-yellow-500" },
  mora_1d: { label: "Mora 1 día", variant: "destructive" },
  mora_3d: { label: "Mora 3 días", variant: "destructive" },
  suspendido: { label: "Suspendido", variant: "destructive" },
  pago_confirmado: { label: "Pago confirmado", variant: "secondary", className: "bg-emerald-500/15 text-emerald-500" },
};

// ── Componente principal ────────────────────────────────────────────────────

export function PaymentsTab({
  businessId,
  businessNombre,
  config: initialConfig,
  pagos,
  notifications,
}: {
  businessId: string;
  businessNombre: string;
  config: PaymentConfigDTO;
  pagos: PaymentDTO[];
  notifications: PaymentNotificationDTO[];
}) {
  const [config, setConfig] = useState<PaymentConfigDTO>(initialConfig);
  const [alertas, setAlertas] = useState(initialConfig?.activo ?? true);
  const [showConfig, setShowConfig] = useState(!initialConfig);
  const [showPago, setShowPago] = useState(false);
  const [pending, start] = useTransition();

  function handleToggle(v: boolean) {
    if (!config) {
      toast.error("Configura primero el cobro mensual.");
      return;
    }
    setAlertas(v);
    start(async () => {
      const r = await togglePaymentAlerts(businessId, v);
      if (!r.ok) {
        setAlertas(!v);
        toast.error(r.error ?? "No se pudo actualizar.");
      } else {
        toast.success(v ? "Alertas de cobro activadas." : "Alertas de cobro desactivadas.");
      }
    });
  }

  function handleReactivate() {
    start(async () => {
      const r = await reactivateBusiness(businessId);
      if (r.ok) {
        setConfig((c) => (c ? { ...c, suspendido: false, suspendidoAt: null } : c));
        toast.success("Bot reactivado correctamente.");
      } else {
        toast.error(r.error ?? "No se pudo reactivar.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* ── Sección 1: Toggle + estado ── */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold">Alertas de cobro activas</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Al desactivar, no se enviarán recordatorios de pago ni se suspenderá el
              bot automáticamente.
            </p>
          </div>
          <Switch
            checked={alertas}
            onCheckedChange={handleToggle}
            disabled={pending || !config}
            aria-label="Alertas de cobro"
            className="scale-125 data-[state=checked]:bg-emerald-500"
          />
        </div>

        <EstadoBadge config={config} />

        {config?.suspendido && (
          <Button
            onClick={handleReactivate}
            disabled={pending}
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
            Reactivar manualmente
          </Button>
        )}
      </section>

      {/* ── Sección 2: Registrar pago ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Registrar pago</h2>
        <Button
          onClick={() => {
            if (!config) {
              toast.error("Configura primero el cobro mensual.");
              return;
            }
            setShowPago(true);
          }}
          size="lg"
          className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
        >
          <CheckCircle2 className="size-5" /> Registrar pago
        </Button>
      </section>

      {/* ── Sección 3: Configuración ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Configuración de cobro</h2>
          {config && (
            <Button variant="ghost" size="sm" onClick={() => setShowConfig((v) => !v)}>
              {showConfig ? "Ocultar" : "Editar"}
            </Button>
          )}
        </div>
        {showConfig && (
          <ConfigForm
            businessId={businessId}
            config={config}
            alertas={alertas}
            onSaved={(updated) => {
              setConfig(updated);
              setAlertas(updated.activo);
              setShowConfig(false);
            }}
          />
        )}
      </section>

      {/* ── Sección 4: Historial de pagos ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Historial de pagos</h2>
        {pagos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Sin pagos registrados.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Fecha de pago</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="capitalize">{p.periodo}</TableCell>
                    <TableCell>{fmtMoney(p.monto)}</TableCell>
                    <TableCell>{fmtDate(p.fechaPago)}</TableCell>
                    <TableCell className="text-muted-foreground">{p.notas ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ── Sección 5: Notificaciones enviadas ── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Notificaciones enviadas</h2>
        {notifications.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Aún no se han enviado notificaciones.
          </p>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const meta = NOTIF_META[n.tipo] ?? {
                label: n.tipo,
                variant: "secondary" as const,
              };
              return (
                <div
                  key={n.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2.5"
                >
                  <Badge variant={meta.variant} className={meta.className}>
                    {meta.label}
                  </Badge>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {new Date(n.enviadoAt).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    <span className={n.exitoso ? "text-emerald-500" : "text-red-500"}>
                      {n.exitoso ? "✓" : "✗"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Dialog registrar pago */}
      <RegisterPaymentDialog
        open={showPago}
        onOpenChange={setShowPago}
        businessId={businessId}
        montoSugerido={config?.montoMensual ?? 0}
        onRegistered={(nuevoProximo) => {
          setConfig((c) =>
            c ? { ...c, proximoPago: nuevoProximo, suspendido: false, suspendidoAt: null } : c,
          );
        }}
      />
    </div>
  );
}

// ── Formulario de configuración ─────────────────────────────────────────────

function ConfigForm({
  businessId,
  config,
  alertas,
  onSaved,
}: {
  businessId: string;
  config: PaymentConfigDTO;
  alertas: boolean;
  onSaved: (c: NonNullable<PaymentConfigDTO>) => void;
}) {
  const [monto, setMonto] = useState(config ? String(config.montoMensual) : "");
  const [proximoPago, setProximoPago] = useState(
    config ? isoToInputDate(config.proximoPago) : todayInputValue(),
  );
  const [diasGracia, setDiasGracia] = useState(config ? String(config.diasGracia) : "7");
  const [pending, start] = useTransition();

  function handleSave() {
    start(async () => {
      const r = await upsertPaymentConfig(businessId, {
        montoMensual: Number(monto),
        diasGracia: Number(diasGracia),
        proximoPago,
        activo: alertas,
      });
      if (r.ok) {
        toast.success("Configuración guardada.");
        onSaved({
          id: r.id ?? config?.id ?? "",
          montoMensual: Number(monto),
          diasGracia: Number(diasGracia),
          proximoPago: new Date(proximoPago).toISOString(),
          activo: alertas,
          suspendido: config?.suspendido ?? false,
          suspendidoAt: config?.suspendidoAt ?? null,
        });
      } else {
        toast.error(r.error ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Monto mensual (MXN)</Label>
          <Input
            type="number"
            min={1}
            step="0.01"
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Próximo vencimiento</Label>
          <Input
            type="date"
            value={proximoPago}
            onChange={(e) => setProximoPago(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Días de gracia</Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={diasGracia}
            onChange={(e) => setDiasGracia(e.target.value)}
          />
        </div>
      </div>
      <Button onClick={handleSave} disabled={pending || !monto}>
        {pending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
        Guardar configuración
      </Button>
    </div>
  );
}

// ── Dialog registrar pago ───────────────────────────────────────────────────

function RegisterPaymentDialog({
  open,
  onOpenChange,
  businessId,
  montoSugerido,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId: string;
  montoSugerido: number;
  onRegistered: (nuevoProximoPagoIso: string) => void;
}) {
  const [fechaPago, setFechaPago] = useState(todayInputValue());
  const [monto, setMonto] = useState(montoSugerido ? String(montoSugerido) : "");
  const [notas, setNotas] = useState("");
  const [pending, start] = useTransition();

  function handleConfirm() {
    start(async () => {
      const r = await registerPayment(businessId, {
        fechaPago,
        monto: Number(monto),
        notas,
      });
      if (r.ok) {
        const nuevoProximo = new Date(
          new Date(fechaPago).getTime() + 30 * 86_400_000,
        ).toISOString();
        onRegistered(nuevoProximo);
        toast.success(
          `Pago registrado. Próximo vencimiento: ${fmtDate(nuevoProximo)}`,
        );
        onOpenChange(false);
        setNotas("");
      } else {
        toast.error(r.error ?? "No se pudo registrar el pago.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Fecha en que pagó</Label>
            <Input
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Monto recibido (MXN)</Label>
            <Input
              type="number"
              min={1}
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Input
              placeholder="Ej: Transferencia BBVA"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={pending || !monto}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {pending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Confirmar pago
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
