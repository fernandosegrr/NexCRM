"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type CampaignDetail = {
  id: string;
  nombre: string;
  mensaje: string;
  estado: string;
  totalContactos: number;
  enviados: number;
  fallidos: number;
  contactoActual: number;
  creadoAt: string;
  iniciadoAt: string | null;
  completadoAt: string | null;
  logs: Array<{
    uidUsuario: string;
    estado: string;
    error: string | null;
    enviadoAt: string;
  }>;
};

export default function CampanaDetailPage({ params }: { params: { id: string } }) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${params.id}`);
      const data = (await res.json()) as { campaign?: CampaignDetail };
      setCampaign(data.campaign ?? null);
    } catch { /* ignore */ }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);

  // Polling mientras está enviando
  useEffect(() => {
    if (campaign?.estado !== "enviando") return;
    const interval = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(interval);
  }, [campaign?.estado, load]);

  async function handleCancel() {
    if (!confirm("¿Cancelar esta campaña?")) return;
    const res = await fetch(`/api/campaigns/${params.id}/cancel`, { method: "PATCH" });
    if (res.ok) {
      setCampaign((c) => c ? { ...c, estado: "cancelada" } : c);
      toast.success("Campaña cancelada.");
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Campaña no encontrada.</p>
      </div>
    );
  }

  const progress =
    campaign.totalContactos > 0
      ? Math.round((campaign.enviados / campaign.totalContactos) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link
          href="/dashboard/campanas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Campañas
        </Link>

        <div className="mt-4 flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold">{campaign.nombre}</h1>
          {["borrador", "enviando"].includes(campaign.estado) && (
            <Button size="sm" variant="outline" onClick={handleCancel}>
              Cancelar campaña
            </Button>
          )}
        </div>
      </div>

      {/* Progreso */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {campaign.estado === "enviando" && "Enviando..."}
            {campaign.estado === "completada" && "✅ Completada"}
            {campaign.estado === "cancelada" && "❌ Cancelada"}
            {campaign.estado === "borrador" && "Borrador"}
          </span>
          <span className="text-muted-foreground">
            {campaign.enviados}/{campaign.totalContactos} enviados
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="size-3 text-green-500" /> {campaign.enviados} enviados
          </span>
          {campaign.fallidos > 0 && (
            <span className="flex items-center gap-1">
              <XCircle className="size-3 text-destructive" /> {campaign.fallidos} fallidos
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {progress}% completado
          </span>
        </div>
      </div>

      {/* Mensaje */}
      <div className="rounded-lg border p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Mensaje</p>
        <p className="text-sm whitespace-pre-wrap">{campaign.mensaje}</p>
      </div>

      {/* Logs */}
      {campaign.logs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Últimos envíos
          </p>
          <div className="divide-y rounded-lg border">
            {campaign.logs.map((log, idx) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
                {log.estado === "enviado" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-destructive" />
                )}
                <span className="flex-1 truncate text-sm font-mono text-muted-foreground">
                  {log.uidUsuario}
                </span>
                {log.error && (
                  <span className="text-xs text-destructive">{log.error}</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(log.enviadoAt).toLocaleTimeString("es-MX", { timeStyle: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
