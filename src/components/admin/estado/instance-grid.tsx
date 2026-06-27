"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import type { InstanceStatusCard } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "open" | "close" | "connecting" | "unknown" | null;

function StatusDot({ status }: { status: Status }) {
  if (status === null) {
    return <span className="h-2.5 w-2.5 rounded-full bg-muted animate-pulse" />;
  }
  return (
    <span
      className={cn("h-2.5 w-2.5 rounded-full", {
        "bg-emerald-500": status === "open",
        "bg-amber-400": status === "connecting",
        "bg-red-500": status === "close" || status === "unknown",
      })}
    />
  );
}

function statusLabel(s: Status): string {
  if (s === null) return "Verificando…";
  if (s === "open") return "Operando";
  if (s === "connecting") return "Reconectando";
  return "Sin conexión";
}

function InstanceCard({ instance }: { instance: InstanceStatusCard }) {
  const [status, setStatus] = useState<Status>(null);
  const [checking, setChecking] = useState(false);

  async function check(silent = false) {
    setChecking(true);
    try {
      const r = await fetch(`/api/admin/instances/${instance.instanceDbId}/status`);
      const d = (await r.json()) as { status?: string };
      const s = (d.status as Status) ?? "unknown";
      setStatus(s);
      if (!silent) {
        if (s === "open") {
          toast.success(`${instance.instanciaId}: conectada`);
        } else {
          toast.error(`${instance.instanciaId}: ${statusLabel(s)}`);
        }
      }
    } catch {
      setStatus("unknown");
      if (!silent) toast.error("No se pudo verificar el estado.");
    } finally {
      setChecking(false);
    }
  }

  // Auto-check silencioso al montar (sin toast para no spamear N instancias)
  useEffect(() => {
    void check(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{instance.businessNombre}</p>
          <code className="text-xs text-muted-foreground">{instance.instanciaId}</code>
        </div>
        {instance.activo ? (
          <Wifi className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <WifiOff className="size-4 shrink-0 text-muted-foreground" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <StatusDot status={status} />
        <span
          className={cn("text-sm font-medium", {
            "text-emerald-500": status === "open",
            "text-amber-400": status === "connecting",
            "text-red-500": status === "close" || status === "unknown",
            "text-muted-foreground": status === null,
          })}
        >
          {statusLabel(status)}
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="mt-auto w-full"
        onClick={() => check()}
        disabled={checking}
      >
        {checking ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="mr-1.5 size-3.5" />
        )}
        Verificar ahora
      </Button>
    </div>
  );
}

export function InstanceGrid({ instances }: { instances: InstanceStatusCard[] }) {
  if (instances.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-card/30 px-4 py-8 text-center text-sm text-muted-foreground">
        No hay instancias de WhatsApp registradas.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {instances.map((inst) => (
        <InstanceCard key={inst.instanceDbId} instance={inst} />
      ))}
    </div>
  );
}
