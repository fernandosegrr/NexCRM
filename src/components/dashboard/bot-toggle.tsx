"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function BotToggle({
  instanciaId,
  uidUsuario,
}: {
  instanciaId: string;
  uidUsuario: string;
}) {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setActivo(null);
    const url = `/api/bot-status?instanciaId=${encodeURIComponent(
      instanciaId,
    )}&uidUsuario=${encodeURIComponent(uidUsuario)}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setActivo(Boolean(d.activo));
      })
      .catch(() => {
        if (alive) setActivo(true);
      });
    return () => {
      alive = false;
    };
  }, [instanciaId, uidUsuario]);

  async function onToggle(v: boolean) {
    const prev = activo;
    setActivo(v);
    setSaving(true);
    try {
      const r = await fetch("/api/bot-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanciaId, uidUsuario, activo: v }),
      });
      if (!r.ok) throw new Error("bad status");
      toast.success(v ? "Bot activado" : "Bot pausado para este contacto");
    } catch {
      setActivo(prev ?? true);
      toast.error("No se pudo cambiar el estado del bot.");
    } finally {
      setSaving(false);
    }
  }

  const loading = activo === null;

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-3 py-1.5">
      {loading || saving ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      ) : (
        <span
          className={cn(
            "size-2 rounded-full",
            activo ? "bg-emerald-400" : "bg-muted-foreground",
          )}
        />
      )}
      <span
        className={cn(
          "hidden text-xs font-medium sm:inline",
          activo ? "text-emerald-400" : "text-muted-foreground",
        )}
      >
        {loading ? "Cargando…" : activo ? "Bot activo" : "Bot pausado"}
      </span>
      <Switch
        checked={!!activo}
        disabled={loading || saving}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-emerald-500"
        aria-label="Activar o pausar el bot para este contacto"
      />
    </div>
  );
}
