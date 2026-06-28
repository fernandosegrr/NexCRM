"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Plus,
  AlertTriangle,
  Megaphone,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
  Upload,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

import { hasPermission } from "@/lib/permissions";
import { AccessDenied } from "@/components/dashboard/access-denied";
import ErrorBoundary from "@/components/ui/error-boundary";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

type Campaign = {
  id: string;
  nombre: string;
  canal: string;
  estado: string;
  totalContactos: number;
  enviados: number;
  fallidos: number;
  creadoAt: string;
  iniciadoAt: string | null;
  completadoAt: string | null;
};

type Instance = { instanciaId: string };
type Stage = { id: string; nombre: string };

const ESTADO_CONFIG: Record<string, { label: string; icon: React.ReactNode; variant: string }> = {
  borrador: { label: "Borrador", icon: <Clock className="size-3" />, variant: "muted" },
  enviando: { label: "Enviando...", icon: <Megaphone className="size-3" />, variant: "warning" },
  completada: { label: "Completada", icon: <CheckCircle2 className="size-3" />, variant: "success" },
  cancelada: { label: "Cancelada", icon: <Ban className="size-3" />, variant: "destructive" },
};

export default function CampanasPage() {
  return (
    <ErrorBoundary page="campanas">
      <CampanasPageInner />
    </ErrorBoundary>
  );
}

function CampanasPageInner() {
  const { data: session, status } = useSession();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    console.log("[Campanas] montado correctamente");
  }, []);

  const canManage =
    status === "loading" || !session
      ? null
      : hasPermission(session.user, "gestionar_campanas");

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      const data = (await res.json()) as { campaigns?: Campaign[] };
      setCampaigns(data.campaigns ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  async function handleCancel(id: string) {
    if (!confirm("¿Cancelar esta campaña?")) return;
    const res = await fetch(`/api/campaigns/${id}/cancel`, { method: "PATCH" });
    if (res.ok) {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, estado: "cancelada" } : c)),
      );
      toast.success("Campaña cancelada.");
    } else {
      toast.error("No se pudo cancelar.");
    }
  }

  if (canManage === false) {
    return <AccessDenied mensaje="No tienes acceso a las campañas." />;
  }

  return (
    <div
      className="mx-auto h-full w-full max-w-3xl space-y-6 overflow-y-auto p-4 sm:p-6"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campañas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Envía mensajes masivos a tus contactos de WhatsApp.
          </p>
        </div>
        <Button onClick={() => setShowWizard(true)} className="gap-2">
          <Plus className="size-4" /> Nueva campaña
        </Button>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      )}

      {!loading && campaigns.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Megaphone className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="text-sm font-medium">No hay campañas aún</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crea tu primera campaña para enviar mensajes a múltiples contactos.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {campaigns.map((c) => {
          const cfg = ESTADO_CONFIG[c.estado] ?? ESTADO_CONFIG.borrador;
          const progress =
            c.totalContactos > 0
              ? Math.round((c.enviados / c.totalContactos) * 100)
              : 0;
          return (
            <div key={c.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/campanas/${c.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {c.nombre}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium
                        ${c.estado === "completada" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : ""}
                        ${c.estado === "enviando" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : ""}
                        ${c.estado === "cancelada" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : ""}
                        ${c.estado === "borrador" ? "bg-muted text-muted-foreground" : ""}
                      `}
                    >
                      {cfg.icon} {cfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.enviados}/{c.totalContactos} enviados
                    </span>
                    {c.fallidos > 0 && (
                      <span className="text-xs text-destructive">{c.fallidos} fallidos</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {["borrador", "enviando"].includes(c.estado) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCancel(c.id)}
                      className="gap-1 text-muted-foreground hover:text-destructive"
                    >
                      <XCircle className="size-3.5" /> Cancelar
                    </Button>
                  )}
                  <Link href={`/dashboard/campanas/${c.id}`}>
                    <Button size="sm" variant="outline">Ver</Button>
                  </Link>
                </div>
              </div>
              {c.estado === "enviando" && (
                <div className="mt-3">
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{progress}% completado</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CampanaWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={(campaign) => {
          setCampaigns((prev) => [campaign, ...prev]);
          setShowWizard(false);
        }}
      />
    </div>
  );
}

function CampanaWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Campaign) => void;
}) {
  const [step, setStep] = useState(0);
  const [riesgoAceptado, setRiesgoAceptado] = useState(false);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [instanciaId, setInstanciaId] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("todos");
  const [delayMin, setDelayMin] = useState(8);
  const [delayMax, setDelayMax] = useState(20);
  const [totalEstimado, setTotalEstimado] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [tipoMensaje, setTipoMensaje] = useState<"texto" | "imagen" | "documento">("texto");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    async function load() {
      try {
        const [instsRes, stagesRes] = await Promise.all([
          fetch("/api/dashboard/instances/status"),
          fetch("/api/funnel/stages"),
        ]);
        const instsData = (await instsRes.json()) as { instances?: Instance[] };
        const stagesData = (await stagesRes.json()) as { stages?: Stage[] };
        setInstances(instsData.instances ?? []);
        setStages(stagesData.stages ?? []);
      } catch { /* ignore */ }
    }
    void load();
  }, [open]);

  function reset() {
    setStep(0);
    setRiesgoAceptado(false);
    setNombre("");
    setMensaje("");
    setInstanciaId("");
    setFiltroEtapa("todos");
    setDelayMin(8);
    setDelayMax(20);
    setTotalEstimado(null);
    setTipoMensaje("texto");
    setMediaUrl("");
    setMediaCaption("");
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "nexai-campaigns");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al subir archivo");
      setMediaUrl(data.url ?? "");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleNext() {
    if (step === 0 && !riesgoAceptado) return;
    if (step === 1) {
      if (!nombre.trim() || !instanciaId) {
        toast.error("Completa el nombre e instancia.");
        return;
      }
      if (tipoMensaje === "texto" && !mensaje.trim()) {
        toast.error("Escribe el mensaje de la campaña.");
        return;
      }
      if ((tipoMensaje === "imagen" || tipoMensaje === "documento") && !mediaUrl) {
        toast.error("Sube el archivo antes de continuar.");
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/campaigns/estimate?instanciaId=${instanciaId}&filtroEtapa=${filtroEtapa === "todos" ? "" : filtroEtapa}`,
        );
        const data = (await res.json()) as { total?: number };
        setTotalEstimado(data.total ?? 0);
      } catch {
        setTotalEstimado(0);
      } finally {
        setLoading(false);
      }
    }
    setStep((s) => s + 1);
  }

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          mensaje,
          instanciaId,
          filtroEtapa: filtroEtapa === "todos" ? undefined : filtroEtapa,
          delayMin,
          delayMax,
          riesgoAceptado: true,
          tipoMensaje,
          mediaUrl: mediaUrl || undefined,
          mediaCaption: mediaCaption || undefined,
        }),
      });
      const data = (await res.json()) as { campaign?: Campaign; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al crear campaña.");

      const campaign = data.campaign!;

      // Iniciar campaña
      await fetch(`/api/campaigns/${campaign.id}/start`, { method: "POST" });

      toast.success("Campaña iniciada.");
      onCreated({ ...campaign, estado: "enviando" });
      reset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) { onClose(); reset(); }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 0 && "⚠️ Antes de continuar"}
            {step === 1 && "Nueva campaña — Configuración"}
            {step === 2 && "Nueva campaña — Confirmar"}
          </DialogTitle>
        </DialogHeader>

        {/* Paso 0: aviso de riesgo */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-yellow-600" />
                <div className="space-y-2 text-sm text-yellow-800 dark:text-yellow-300">
                  <p className="font-semibold">Los mensajes masivos tienen riesgos reales:</p>
                  <ul className="list-disc space-y-1 pl-4">
                    <li>WhatsApp puede bloquear el número si detecta spam.</li>
                    <li>Los contactos pueden reportar el mensaje como no deseado.</li>
                    <li>Los envíos no se pueden deshacer una vez iniciados.</li>
                    <li>Asegúrate de tener el consentimiento de los contactos.</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="riesgo"
                checked={riesgoAceptado}
                onCheckedChange={(v) => setRiesgoAceptado(v === true)}
              />
              <label htmlFor="riesgo" className="cursor-pointer text-sm">
                Entiendo los riesgos y acepto la responsabilidad de los mensajes enviados.
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { onClose(); reset(); }}>Cancelar</Button>
              <Button onClick={handleNext} disabled={!riesgoAceptado}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Paso 1: configuración */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre de la campaña</Label>
              <Input
                placeholder="Ej: Promoción de verano"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instancia de WhatsApp</Label>
              <Select value={instanciaId} onValueChange={setInstanciaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una instancia" />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((i) => (
                    <SelectItem key={i.instanciaId} value={i.instanciaId}>
                      {i.instanciaId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destinatarios</Label>
              <Select value={filtroEtapa} onValueChange={setFiltroEtapa}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los contactos de la instancia</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Etapa: {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de mensaje</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["texto", "imagen", "documento"] as const).map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => { setTipoMensaje(tipo); setMediaUrl(""); setMediaCaption(""); }}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors ${
                      tipoMensaje === tipo
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {tipo === "texto" ? <span className="text-base">📝</span> : tipo === "imagen" ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}
                    {tipo === "texto" ? "Solo texto" : tipo === "imagen" ? "Imagen" : "Documento"}
                  </button>
                ))}
              </div>
            </div>

            {tipoMensaje === "texto" && (
              <div className="space-y-1.5">
                <Label>Mensaje</Label>
                <Textarea
                  placeholder="Escribe el mensaje que recibirán los contactos..."
                  rows={4}
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Puedes usar *negritas*, _cursiva_ (formato WhatsApp).
                </p>
              </div>
            )}

            {(tipoMensaje === "imagen" || tipoMensaje === "documento") && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>
                    {tipoMensaje === "imagen" ? "Imagen" : "Documento"} (Cloudinary)
                  </Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={tipoMensaje === "imagen" ? "image/jpeg,image/png,image/webp" : ".pdf,.doc,.docx,.xlsx"}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileUpload(file);
                    }}
                  />
                  {mediaUrl ? (
                    <div className="flex items-center gap-2 rounded-lg border p-3">
                      {tipoMensaje === "imagen" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl} alt="preview" className="h-16 w-16 rounded object-cover" />
                      ) : (
                        <FileText className="size-8 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-muted-foreground">{mediaUrl.split("/").pop()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setMediaUrl(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="text-xs text-destructive hover:underline"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      <Upload className="size-4" />
                      {uploading ? "Subiendo..." : `Seleccionar ${tipoMensaje === "imagen" ? "imagen" : "documento"}`}
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Caption (opcional)</Label>
                  <Input
                    placeholder="Texto que acompaña el archivo..."
                    value={mediaCaption}
                    onChange={(e) => setMediaCaption(e.target.value)}
                    maxLength={1024}
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Delay entre mensajes: {delayMin}–{delayMax} segundos</Label>
              <p className="text-xs text-muted-foreground">
                Un delay más largo reduce el riesgo de bloqueo.
              </p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={5}
                  max={60}
                  value={delayMin}
                  onChange={(e) => setDelayMin(Number(e.target.value))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">a</span>
                <Input
                  type="number"
                  min={5}
                  max={60}
                  value={delayMax}
                  onChange={(e) => setDelayMax(Number(e.target.value))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">segundos</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep(0)}>Atrás</Button>
              <Button onClick={handleNext} disabled={loading}>
                {loading ? "Calculando..." : "Revisar y confirmar"}
              </Button>
            </div>
          </div>
        )}

        {/* Paso 2: confirmación */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/60 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nombre</span>
                <span className="font-medium">{nombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Instancia</span>
                <span className="font-medium">{instanciaId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Destinatarios estimados</span>
                <span className="font-medium">{totalEstimado ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delay entre mensajes</span>
                <span className="font-medium">{delayMin}–{delayMax}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo</span>
                <span className="font-medium capitalize">{tipoMensaje}</span>
              </div>
              <div className="pt-1 border-t">
                {tipoMensaje === "texto" ? (
                  <>
                    <p className="text-xs text-muted-foreground">Mensaje:</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{mensaje}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Archivo:</p>
                    {tipoMensaje === "imagen" && mediaUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl} alt="preview" className="mt-1 h-24 w-full rounded object-cover" />
                    )}
                    {tipoMensaje === "documento" && (
                      <div className="mt-1 flex items-center gap-2 text-sm">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{mediaUrl.split("/").pop()}</span>
                      </div>
                    )}
                    {mediaCaption && <p className="mt-1 text-xs text-muted-foreground">Caption: {mediaCaption}</p>}
                  </>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Una vez iniciada, la campaña se procesa en segundo plano. Puedes cancelarla desde la lista.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
                Atrás
              </Button>
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? "Iniciando..." : "Iniciar campaña"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
