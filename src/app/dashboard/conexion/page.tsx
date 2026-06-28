"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Wifi, WifiOff, RefreshCw, QrCode } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ErrorBoundary from "@/components/ui/error-boundary";

type QrState =
  | { stage: "idle" }
  | { stage: "loading" }
  | { stage: "qr"; base64: string; expiraEn: number }
  | { stage: "connected" }
  | { stage: "error"; message: string };

type Instance = {
  instanciaId: string;
  nombre: string;
  connected: boolean;
};

function QrSection({ instanciaId }: { instanciaId: string }) {
  const [qrState, setQrState] = useState<QrState>({ stage: "idle" });
  const [countdown, setCountdown] = useState(0);

  const generateQR = useCallback(async () => {
    setQrState({ stage: "loading" });
    try {
      const res = await fetch(`/api/dashboard/instances/${instanciaId}/qr`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        connected?: boolean;
        qr?: string;
        expiraEn?: number;
        error?: string;
      };
      if (data.connected) {
        setQrState({ stage: "connected" });
      } else if (data.qr) {
        setQrState({ stage: "qr", base64: data.qr, expiraEn: data.expiraEn ?? 30 });
        setCountdown(data.expiraEn ?? 30);
      } else {
        setQrState({ stage: "error", message: data.error ?? "Error desconocido." });
      }
    } catch {
      setQrState({ stage: "error", message: "No se pudo conectar con el servidor." });
    }
  }, [instanciaId]);

  useEffect(() => {
    if (qrState.stage !== "qr") return;
    if (countdown <= 0) {
      setQrState({ stage: "idle" });
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [qrState.stage, countdown]);

  // Polling para detectar reconexión. Consulta SOLO el estado (no regenera el QR,
  // que invalidaría el código que el usuario está escaneando).
  useEffect(() => {
    if (qrState.stage !== "qr") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/dashboard/instances/status");
        const data = (await res.json()) as {
          instances?: Array<{ instanciaId: string; connected: boolean }>;
        };
        const me = data.instances?.find((i) => i.instanciaId === instanciaId);
        if (me?.connected) {
          setQrState({ stage: "connected" });
          toast.success("¡WhatsApp reconectado exitosamente!");
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [qrState.stage, instanciaId]);

  if (qrState.stage === "connected") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 dark:bg-green-950">
        <Wifi className="size-5 text-green-600" />
        <span className="text-sm font-medium text-green-700 dark:text-green-400">
          ¡Conectado!
        </span>
      </div>
    );
  }

  if (qrState.stage === "qr") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative rounded-xl border p-4 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${qrState.base64}`}
            alt="Código QR de WhatsApp"
            className="mx-auto h-auto w-full max-w-[256px]"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {countdown > 0 ? (
            <>Escanea el QR con WhatsApp · Expira en <strong>{countdown}s</strong></>
          ) : (
            "QR expirado"
          )}
        </p>
        {countdown <= 0 && (
          <Button variant="outline" onClick={generateQR} className="gap-2">
            <RefreshCw className="size-4" /> Regenerar QR
          </Button>
        )}
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          Abre WhatsApp en tu celular → Dispositivos vinculados → Vincular dispositivo
          → escanea este código.
        </p>
      </div>
    );
  }

  if (qrState.stage === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{qrState.message}</p>
        <Button variant="outline" onClick={generateQR} className="gap-2">
          <RefreshCw className="size-4" /> Reintentar
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={generateQR} disabled={qrState.stage === "loading"} className="gap-2">
      {qrState.stage === "loading" ? (
        <RefreshCw className="size-4 animate-spin" />
      ) : (
        <QrCode className="size-4" />
      )}
      {qrState.stage === "loading" ? "Generando..." : "Generar QR para reconectar"}
    </Button>
  );
}

export default function ConexionPage() {
  return (
    <ErrorBoundary page="conexion">
      <ConexionPageInner />
    </ErrorBoundary>
  );
}

function ConexionPageInner() {
  const { data: session } = useSession();
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("[Conexion] montado correctamente");
  }, []);

  useEffect(() => {
    async function load() {
      if (!session?.user?.businessId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/dashboard/instances/status");
        const data = (await res.json()) as { instances?: Instance[] };
        setInstances(data.instances ?? []);
      } catch {
        setInstances([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [session?.user?.businessId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!session?.user?.businessId) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Sin negocio asignado.</p>
      </div>
    );
  }

  const waInstances = instances?.filter(() => true) ?? [];

  return (
    <div
      className="mx-auto h-full w-full max-w-2xl space-y-6 overflow-y-auto p-4 sm:p-6"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div>
        <h1 className="text-2xl font-semibold">Estado de conexión</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Si tu asistente de WhatsApp se desconectó, genera un QR para reconectarlo.
        </p>
      </div>

      {waInstances.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No tienes instancias de WhatsApp configuradas.
            </p>
          </CardContent>
        </Card>
      )}

      {waInstances.map((inst) => (
        <Card key={inst.instanciaId}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{inst.nombre}</CardTitle>
              {inst.connected ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <Wifi className="size-4" /> Conectado
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <WifiOff className="size-4" /> Desconectado
                </span>
              )}
            </div>
            <CardDescription>
              {inst.connected
                ? "Tu asistente está operando con normalidad."
                : "Tu asistente no puede responder mensajes. Reconéctalo escaneando el QR."}
            </CardDescription>
          </CardHeader>
          {!inst.connected && (
            <CardContent>
              <QrSection instanciaId={inst.instanciaId} />
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
