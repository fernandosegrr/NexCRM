"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MetaTokenStatus = {
  hasToken: boolean;
  pageId: string | null;
  setAt: string | null;
  expiresAt: string | null;
};

function expiryState(
  expiresAt: string | null,
): "permanent" | "ok" | "expiring" | "expired" {
  if (!expiresAt) return "permanent";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff < 0) return "expired";
  if (diff < 7 * 24 * 60 * 60 * 1000) return "expiring";
  return "ok";
}

function StatusBadge({
  status,
  canal,
  expiresAt,
}: {
  status: MetaTokenStatus;
  canal: string;
  expiresAt: string | null;
}) {
  if (!status.hasToken) {
    return (
      <span className="text-xs text-muted-foreground">Sin configurar</span>
    );
  }
  const state = expiryState(expiresAt);
  if (state === "expired") {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <XCircle className="size-3.5" /> Token expirado
      </span>
    );
  }
  if (state === "expiring") {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-400">
        <AlertTriangle className="size-3.5" /> Expira pronto
        {expiresAt && (
          <span className="text-muted-foreground">
            · {new Date(expiresAt).toLocaleDateString("es-MX")}
          </span>
        )}
      </span>
    );
  }
  if (state === "permanent") {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle2 className="size-3.5" /> Permanente
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-emerald-400">
      <CheckCircle2 className="size-3.5" />
      {canal === "instagram" && expiresAt
        ? `Válido hasta ${new Date(expiresAt).toLocaleDateString("es-MX")}`
        : "Configurado"}
    </span>
  );
}

export function MetaTokenForm({
  instanceId,
  canal,
  initialStatus,
}: {
  instanceId: string;
  canal: string;
  initialStatus: MetaTokenStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(!initialStatus.hasToken);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/instances/${instanceId}/token`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaPageAccessToken: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Error al guardar el token.");
        return;
      }
      setStatus({
        hasToken: true,
        pageId: data.metaPageId,
        setAt: data.metaTokenSetAt,
        expiresAt: data.metaTokenExpiresAt,
      });
      setToken("");
      setOpen(false);
      toast.success("Token guardado y verificado.");
    } catch {
      toast.error("Error de red al guardar el token.");
    } finally {
      setSaving(false);
    }
  }

  const state = expiryState(status.expiresAt);
  const showWarning = status.hasToken && (state === "expired" || state === "expiring");

  return (
    <div className="space-y-3">
      {showWarning && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            state === "expired"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-400/40 bg-amber-400/10 text-amber-400"
          }`}
        >
          {state === "expired" ? (
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>
            {state === "expired"
              ? "El token de Instagram ha expirado. Los envíos desde el CRM fallarán hasta que lo renueves."
              : `El token de Instagram expira el ${new Date(status.expiresAt!).toLocaleDateString("es-MX")}. Renuévalo pronto.`}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Page Access Token</p>
            <div className="mt-0.5">
              <StatusBadge
                status={status}
                canal={canal}
                expiresAt={status.expiresAt}
              />
            </div>
            {status.pageId && (
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                Page ID: {status.pageId}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cancelar" : status.hasToken ? "Renovar" : "Configurar"}
        </Button>
      </div>

      {open && (
        <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            Pega el <strong>Page Access Token</strong> de tu página de{" "}
            {canal === "instagram" ? "Instagram" : "Messenger"} obtenido desde
            el panel de Meta Developers. El Page ID se detecta automáticamente.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`token-${instanceId}`} className="text-xs">
              Page Access Token
            </Label>
            <div className="relative">
              <Input
                id={`token-${instanceId}`}
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAWs…  /  IGAA5…"
                required
                className="h-8 pr-9 font-mono text-xs"
                disabled={saving}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? (
                  <EyeOff className="size-3.5" />
                ) : (
                  <Eye className="size-3.5" />
                )}
              </button>
            </div>
          </div>
          <Button type="submit" size="sm" disabled={saving || !token.trim()} className="w-full">
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Verificando…
              </>
            ) : (
              "Guardar y verificar"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
