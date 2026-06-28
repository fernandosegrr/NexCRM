"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  RotateCw,
  Sparkles,
  User,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { ConversationContact, MessageDTO } from "@/lib/data";
import { applyStageSuggestion, dismissStageSuggestion } from "@/app/actions/businesses";
import {
  createContactNote,
  deleteContactNote,
  createContactTag,
  deleteContactTag,
  upsertContactFieldValue,
} from "@/app/actions/contacts";
import { avatarColor, dayLabel, initialOf, timeOnly } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ChannelBadge } from "@/components/channel-badge";
import { cn } from "@/lib/utils";
import { BotToggle } from "./bot-toggle";
import { ReplyInput } from "./reply-input";
import { ConversationSummaryButton } from "./summary-modal";
import { StageSelector } from "./stage-selector";

function MessageMedia({
  tipoMedia,
  mediaUrl,
  dark,
}: {
  tipoMedia: string;
  mediaUrl: string | null;
  dark: boolean;
}) {
  if (!mediaUrl || tipoMedia === "text") return null;

  if (tipoMedia === "image") {
    return (
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt="imagen"
          className="mb-1 max-h-64 w-full rounded-lg object-cover"
        />
      </a>
    );
  }
  if (tipoMedia === "video") {
    return (
      <video
        src={mediaUrl}
        controls
        className="mb-1 max-h-64 w-full rounded-lg"
      />
    );
  }
  if (tipoMedia === "audio") {
    return <audio src={mediaUrl} controls className="mb-1 w-full" />;
  }
  // document u otro
  return (
    <a
      href={mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs underline-offset-2 hover:underline",
        dark ? "bg-white/15" : "bg-background/60",
      )}
    >
      <FileText className="size-4 shrink-0" />
      <span className="truncate">{mediaUrl.split("/").pop() ?? "archivo"}</span>
    </a>
  );
}

function MessagesSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-2">
      {[
        { side: "left", w: "w-48" },
        { side: "right", w: "w-56" },
        { side: "left", w: "w-40" },
        { side: "right", w: "w-64" },
        { side: "left", w: "w-52" },
      ].map((s, i) => (
        <div
          key={i}
          className={cn("flex", s.side === "right" ? "justify-end" : "justify-start")}
        >
          <Skeleton className={cn("h-10 rounded-2xl", s.w)} />
        </div>
      ))}
    </div>
  );
}

export function ConversationView({
  contact,
  onBack,
  onStageChange,
}: {
  contact: ConversationContact;
  onBack: () => void;
  onStageChange?: (change: {
    stageId: string | null;
    nombre: string | null;
    color: string | null;
  }) => void;
}) {
  const [messages, setMessages] = useState<MessageDTO[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  // Desktop ≥768px usa un sidebar inline; móvil usa un Sheet desde abajo.
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Sugerencia de etapa (IA). El componente se remonta por contacto (key),
  // así que el estado inicial desde `contact` es siempre el correcto.
  const [sug, setSug] = useState<
    { stageId: string; nombre: string | null; color: string | null; razon: string | null } | null
  >(
    contact.sugerenciaStageId
      ? {
          stageId: contact.sugerenciaStageId,
          nombre: contact.sugerenciaNombre,
          color: contact.sugerenciaColor,
          razon: contact.sugerenciaRazon,
        }
      : null,
  );
  const [sugBusy, setSugBusy] = useState(false);
  const [classifying, setClassifying] = useState(false);

  async function applySug() {
    if (!sug || !contact.businessId) return;
    const applied = sug;
    setSugBusy(true);
    const r = await applyStageSuggestion(
      contact.instanciaId,
      contact.uidUsuario,
      contact.canal,
      contact.businessId,
    );
    setSugBusy(false);
    if (r.ok) {
      setSug(null);
      onStageChange?.({ stageId: applied.stageId, nombre: applied.nombre, color: applied.color });
      toast.success(`Movido a "${applied.nombre}"`);
    } else {
      toast.error(r.error ?? "No se pudo aplicar la sugerencia.");
    }
  }

  async function dismissSug() {
    if (!contact.businessId) return;
    setSugBusy(true);
    const r = await dismissStageSuggestion(
      contact.instanciaId,
      contact.uidUsuario,
      contact.businessId,
    );
    setSugBusy(false);
    if (r.ok) setSug(null);
    else toast.error(r.error ?? "No se pudo descartar.");
  }

  async function runClassify() {
    setClassifying(true);
    try {
      const res = await fetch("/api/funnel/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanciaId: contact.instanciaId,
          uidUsuario: contact.uidUsuario,
        }),
      });
      if (!res.ok) {
        toast.error("No se pudo clasificar con IA.");
        return;
      }
      const d = await res.json();
      if (d.suggestion) {
        setSug({
          stageId: d.suggestion.stageId,
          nombre: d.suggestion.stageNombre,
          color: d.suggestion.stageColor,
          razon: d.suggestion.razon,
        });
        toast.success(`La IA sugiere: ${d.suggestion.stageNombre}`);
      } else {
        toast.info("La IA no sugirió un cambio de etapa.");
      }
    } catch {
      toast.error("No se pudo clasificar con IA.");
    } finally {
      setClassifying(false);
    }
  }

  function handleReplySent(msg: {
    id: string;
    contenido: string | null;
    tipoMedia: string;
    mediaUrl: string | null;
    enviadoAt: string;
  }) {
    const newMsg: MessageDTO = {
      id: msg.id,
      instanciaId: contact.instanciaId,
      businessId: "",
      nombreNegocio: "",
      canal: contact.canal,
      uidUsuario: contact.uidUsuario,
      rol: "human",
      contenido: msg.contenido,
      tipoMedia: msg.tipoMedia,
      mediaUrl: msg.mediaUrl,
      enviadoAt: msg.enviadoAt,
      latenciaMs: null,
    };
    setMessages((prev) => (prev ? [...prev, newMsg] : [newMsg]));
  }
  const bottomRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let alive = true;
    setMessages(null);
    setError(false);
    // Close any previous SSE connection for this contact
    sseRef.current?.close();
    sseRef.current = null;

    const url = `/api/conversations/${encodeURIComponent(
      contact.uidUsuario,
    )}?instanciaId=${encodeURIComponent(contact.instanciaId)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        const loaded: MessageDTO[] = d.messages ?? [];
        setMessages(loaded);

        // Open SSE after initial load to stream new messages
        const since = loaded.at(-1)?.enviadoAt ?? new Date().toISOString();
        const sseUrl =
          `/api/sse?since=${encodeURIComponent(since)}` +
          `&instanciaId=${encodeURIComponent(contact.instanciaId)}` +
          `&uidUsuario=${encodeURIComponent(contact.uidUsuario)}`;
        const es = new EventSource(sseUrl);
        sseRef.current = es;
        es.onmessage = (e) => {
          try {
            const newMsgs: MessageDTO[] = JSON.parse(e.data);
            if (newMsgs.length > 0) {
              setMessages((prev) => {
                if (!prev) return newMsgs;
                const existingIds = new Set(prev.map((m) => m.id));
                const fresh = newMsgs.filter((m) => !existingIds.has(m.id));
                return fresh.length > 0 ? [...prev, ...fresh] : prev;
              });
            }
          } catch {
            // ignore malformed SSE data
          }
        };
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setMessages([]);
        }
      });
    return () => {
      alive = false;
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [contact.instanciaId, contact.uidUsuario, reload]);

  useEffect(() => {
    if (messages && !error) {
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ behavior: "auto" }),
      );
    }
  }, [messages, error]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      {/* Encabezado de la conversación */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
        <button
          onClick={onBack}
          className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          aria-label="Volver"
        >
          <ArrowLeft className="size-5" />
        </button>
        <Avatar className="h-9 w-9">
          {contact.fotoPerfil && (
            <AvatarImage src={contact.fotoPerfil} alt={contact.nombre ?? contact.uidUsuario} />
          )}
          <AvatarFallback className={avatarColor(contact.uidUsuario)}>
            {initialOf(contact.nombre ?? contact.username ?? contact.uidUsuario)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">
            {contact.nombre ?? contact.username ?? contact.uidUsuario}
          </p>
          <div className="mt-1">
            <ChannelBadge canal={contact.canal} size="xs" />
          </div>
        </div>
        <ConversationSummaryButton
          instanciaId={contact.instanciaId}
          uidUsuario={contact.uidUsuario}
        />
        {contact.businessId && (
          <>
            <StageSelector
              instanciaId={contact.instanciaId}
              uidUsuario={contact.uidUsuario}
              canal={contact.canal}
              businessId={contact.businessId}
              currentStageId={contact.stageId ?? null}
              onChanged={(change) => {
                onStageChange?.(change);
                setSug(null); // una asignación manual supersede la sugerencia
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={runClassify}
              disabled={classifying}
              title="Clasificar etapa con IA"
            >
              {classifying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </Button>
          </>
        )}
        <BotToggle
          instanciaId={contact.instanciaId}
          uidUsuario={contact.uidUsuario}
        />
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8 shrink-0", panelOpen && "bg-accent")}
          onClick={() => setPanelOpen((p) => !p)}
          title="Ficha del contacto"
        >
          <User className="size-4" />
        </Button>
      </div>

      {/* Franja de sugerencia de IA */}
      {sug && (
        <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-3 py-2 sm:px-4">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 truncate text-xs">
            <span className="text-muted-foreground">IA sugiere mover a </span>
            <span className="inline-flex items-center gap-1 font-medium">
              <span
                className="inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: sug.color ?? "#888" }}
              />
              {sug.nombre}
            </span>
            {sug.razon && <span className="text-muted-foreground"> · {sug.razon}</span>}
          </p>
          <Button
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={applySug}
            disabled={sugBusy}
          >
            <Check className="mr-1 size-3" /> Aplicar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={dismissSug}
            disabled={sugBusy}
            aria-label="Descartar sugerencia"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/* Mensajes */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-4 sm:px-6"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {error ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <WifiOff className="mb-3 size-8 opacity-60" />
            <p className="text-sm">No se pudieron cargar los mensajes.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setReload((n) => n + 1)}
            >
              <RotateCw /> Reintentar
            </Button>
          </div>
        ) : messages === null ? (
          <MessagesSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <MessageSquare className="mb-3 size-8 opacity-50" />
            <p className="text-sm">Aún no hay mensajes con este contacto.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map((m, i) => {
              const isBot = m.rol === "bot";
              const isHuman = m.rol === "human";
              const isPage = m.rol === "page";
              const showDay =
                i === 0 ||
                dayLabel(messages[i - 1].enviadoAt) !== dayLabel(m.enviadoAt);
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
                        {dayLabel(m.enviadoAt)}
                      </span>
                    </div>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className={cn(
                      "flex",
                      isBot || isHuman || isPage ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%] md:max-w-[60%]",
                        isBot || isPage
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : isHuman
                            ? "rounded-br-md bg-emerald-700 text-white"
                            : "rounded-bl-md bg-secondary text-secondary-foreground",
                      )}
                    >
                      <MessageMedia
                        tipoMedia={m.tipoMedia}
                        mediaUrl={m.mediaUrl}
                        dark={isBot || isHuman || isPage}
                      />
                      {m.contenido && m.contenido.trim() ? (
                        <p className="whitespace-pre-wrap break-words">
                          {m.contenido}
                        </p>
                      ) : !m.mediaUrl && m.tipoMedia !== "text" ? (
                        <p className="whitespace-pre-wrap break-words italic opacity-80">
                          [{m.tipoMedia}]
                        </p>
                      ) : null}
                      <p
                        className={cn(
                          "mt-1 text-right text-[10px]",
                          isBot || isHuman || isPage
                            ? "text-white/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {timeOnly(m.enviadoAt)}
                      </p>
                    </div>
                  </motion.div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <ReplyInput
        instanciaId={contact.instanciaId}
        uidUsuario={contact.uidUsuario}
        canal={contact.canal}
        onSent={handleReplySent}
      />
    </div>

    {/* Panel de contacto — desktop: sidebar lateral inline */}
    {panelOpen && isDesktop && (
      <div
        className="hidden w-80 shrink-0 overflow-y-auto border-l border-border md:flex md:flex-col"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <ContactPanel
          instanciaId={contact.instanciaId}
          uidUsuario={contact.uidUsuario}
        />
      </div>
    )}

    {/* Panel de contacto — móvil: bottom sheet */}
    <Sheet open={panelOpen && !isDesktop} onOpenChange={setPanelOpen}>
      <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0">
        <SheetHeader className="shrink-0 p-4 pb-3 text-left">
          <SheetTitle>Ficha del contacto</SheetTitle>
        </SheetHeader>
        <div
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <ContactPanel
            instanciaId={contact.instanciaId}
            uidUsuario={contact.uidUsuario}
          />
        </div>
      </SheetContent>
    </Sheet>
    </div>
  );
}

// ---------- ContactPanel ----------

type ContactInfo = {
  id: string;
  nombre: string | null;
  username: string | null;
  fotoPerfil: string | null;
  canal: string;
  uidUsuario: string;
};

type ContactNote = { id: string; contenido: string; creadoPor: string; creadoAt: string };
type ContactTag = { id: string; etiqueta: string };
type CustomField = { id: string; nombre: string; tipo: string; opciones: string[] };
type FieldValue = { fieldId: string; valor: string; field: CustomField };
type TimelineEvent =
  | { tipo: "mensaje"; rol: string; contenido: string | null; fecha: string }
  | { tipo: "etapa"; nombreEtapa: string; fecha: string }
  | { tipo: "seguimiento"; decision: string; etapaDetectada: string | null; fecha: string }
  | { tipo: "nota"; contenido: string; autor: string; fecha: string };

function ContactPanel({
  instanciaId,
  uidUsuario,
}: {
  instanciaId: string;
  uidUsuario: string;
}) {
  const [contactId, setContactId] = useState<string | null>(null);
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const [notas, setNotas] = useState<ContactNote[]>([]);
  const [etiquetas, setEtiquetas] = useState<ContactTag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldValues, setFieldValues] = useState<FieldValue[]>([]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState("info");
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [newNota, setNewNota] = useState("");
  const [newTag, setNewTag] = useState("");
  const [savingNota, setSavingNota] = useState(false);
  const [savingTag, setSavingTag] = useState(false);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/contacts?instanciaId=${encodeURIComponent(instanciaId)}&uidUsuario=${encodeURIComponent(uidUsuario)}`,
      );
      const data = (await res.json()) as {
        contact?: ContactInfo;
        notas?: ContactNote[];
        etiquetas?: ContactTag[];
        customFields?: CustomField[];
        camposCustom?: FieldValue[];
      };
      if (data.contact) {
        setContactId(data.contact.id);
        setInfo(data.contact);
        setNotas(data.notas ?? []);
        setEtiquetas(data.etiquetas ?? []);
        setCustomFields(data.customFields ?? []);
        setFieldValues(data.camposCustom ?? []);
      }
    } catch { /* ignore */ }
  }, [instanciaId, uidUsuario]);

  useEffect(() => { void load(); }, [load]);

  async function loadTimeline() {
    if (!contactId) return;
    setLoadingTimeline(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/timeline`);
      const data = (await res.json()) as { events?: TimelineEvent[] };
      setTimeline(data.events ?? []);
    } catch { /* ignore */ }
    setLoadingTimeline(false);
  }

  useEffect(() => {
    if (activeTab === "timeline") void loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, contactId]);

  async function handleAddNota() {
    if (!contactId || !newNota.trim() || savingNota) return;
    setSavingNota(true);
    try {
      await createContactNote(contactId, newNota);
      setNewNota("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingNota(false);
    }
  }

  async function handleDeleteNota(noteId: string) {
    startTransition(async () => {
      try {
        await deleteContactNote(noteId);
        setNotas((n) => n.filter((x) => x.id !== noteId));
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  async function handleAddTag() {
    if (!contactId || !newTag.trim() || savingTag) return;
    setSavingTag(true);
    try {
      await createContactTag(contactId, newTag);
      setNewTag("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingTag(false);
    }
  }

  async function handleDeleteTag(tagId: string) {
    startTransition(async () => {
      try {
        await deleteContactTag(tagId);
        setEtiquetas((t) => t.filter((x) => x.id !== tagId));
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  const persistField = useCallback(
    async (fieldId: string, valor: string) => {
      if (!contactId) return;
      try {
        await upsertContactFieldValue(contactId, fieldId, valor);
        setFieldValues((prev) => {
          const existing = prev.find((f) => f.fieldId === fieldId);
          const field = customFields.find((f) => f.id === fieldId);
          if (!field) return prev;
          if (existing) return prev.map((f) => (f.fieldId === fieldId ? { ...f, valor } : f));
          return [...prev, { fieldId, valor, field }];
        });
      } catch { /* silencioso */ }
    },
    [contactId, customFields],
  );

  // Edición de texto/número/fecha: actualiza el draft al instante y persiste
  // con debounce para no disparar un server action por cada tecla.
  function handleFieldInput(fieldId: string, valor: string) {
    setDraftValues((d) => ({ ...d, [fieldId]: valor }));
    if (saveTimers.current[fieldId]) clearTimeout(saveTimers.current[fieldId]);
    saveTimers.current[fieldId] = setTimeout(() => {
      void persistField(fieldId, valor);
    }, 600);
  }

  // Select: persiste de inmediato (no hay tecleo continuo).
  function handleFieldSelect(fieldId: string, valor: string) {
    setDraftValues((d) => ({ ...d, [fieldId]: valor }));
    void persistField(fieldId, valor);
  }

  // Limpiar timers pendientes al desmontar
  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  if (!info) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">Cargando ficha...</p>
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
      <div className="border-b px-3 pt-3 pb-0">
        <div className="flex items-center gap-2 pb-3">
          <Avatar className="size-8">
            {info.fotoPerfil && <AvatarImage src={info.fotoPerfil} />}
            <AvatarFallback className={avatarColor(info.uidUsuario)}>
              {initialOf(info.nombre ?? info.username ?? info.uidUsuario)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {info.nombre ?? info.username ?? info.uidUsuario}
            </p>
            <p className="text-xs text-muted-foreground">{info.canal}</p>
          </div>
        </div>
        <TabsList className="w-full h-8 rounded-none bg-transparent p-0 border-0">
          <TabsTrigger value="info" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none text-xs h-8">Info</TabsTrigger>
          <TabsTrigger value="notas" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none text-xs h-8">Notas</TabsTrigger>
          <TabsTrigger value="etiquetas" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none text-xs h-8">Etiquetas</TabsTrigger>
          <TabsTrigger value="timeline" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none text-xs h-8">Timeline</TabsTrigger>
        </TabsList>
      </div>

      {/* Tab Info */}
      <TabsContent value="info" className="m-0 flex-1 overflow-y-auto p-3 space-y-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">ID</p>
          <p className="text-xs font-mono break-all text-muted-foreground">{info.uidUsuario}</p>
        </div>
        {customFields.map((field) => {
          const fv = fieldValues.find((v) => v.fieldId === field.id);
          const current = draftValues[field.id] ?? fv?.valor ?? "";
          return (
            <div key={field.id} className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {field.nombre}
              </p>
              {field.tipo === "select" ? (
                <select
                  value={current}
                  onChange={(e) => handleFieldSelect(field.id, e.target.value)}
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                >
                  <option value="">—</option>
                  {field.opciones.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type={field.tipo === "numero" ? "number" : field.tipo === "fecha" ? "date" : "text"}
                  value={current}
                  onChange={(e) => handleFieldInput(field.id, e.target.value)}
                  className="h-7 text-xs"
                />
              )}
            </div>
          );
        })}
        {customFields.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Sin campos personalizados. Configúralos en{" "}
            <a href="/dashboard/configuracion" className="underline">Configuración</a>.
          </p>
        )}
      </TabsContent>

      {/* Tab Notas */}
      <TabsContent value="notas" className="m-0 flex-1 overflow-y-auto p-3 space-y-3 flex flex-col">
        <div className="flex gap-2">
          <Textarea
            value={newNota}
            onChange={(e) => setNewNota(e.target.value)}
            placeholder="Agrega una nota..."
            rows={2}
            className="resize-none text-xs"
          />
          <Button
            size="icon"
            className="size-8 shrink-0 self-end"
            onClick={handleAddNota}
            disabled={savingNota || !newNota.trim()}
          >
            {savingNota ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          </Button>
        </div>
        <div className="space-y-2 flex-1">
          {notas.map((nota) => (
            <div key={nota.id} className="group rounded-lg bg-muted/60 p-2.5">
              <p className="text-xs whitespace-pre-wrap">{nota.contenido}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">{nota.creadoPor}</p>
                <button
                  className="hidden group-hover:block text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteNota(nota.id)}
                >
                  <X className="size-3" />
                </button>
              </div>
            </div>
          ))}
          {notas.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin notas aún.</p>
          )}
        </div>
      </TabsContent>

      {/* Tab Etiquetas */}
      <TabsContent value="etiquetas" className="m-0 flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Nueva etiqueta..."
            className="h-7 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter") void handleAddTag(); }}
          />
          <Button
            size="icon"
            className="size-7 shrink-0"
            onClick={handleAddTag}
            disabled={savingTag || !newTag.trim()}
          >
            <Plus className="size-3" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map((tag) => (
            <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {tag.etiqueta}
              <button onClick={() => handleDeleteTag(tag.id)} className="hover:text-destructive">
                <X className="size-3" />
              </button>
            </span>
          ))}
          {etiquetas.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin etiquetas.</p>
          )}
        </div>
      </TabsContent>

      {/* Tab Timeline */}
      <TabsContent value="timeline" className="m-0 flex-1 overflow-y-auto p-3 space-y-2">
        {loadingTimeline ? (
          <p className="text-xs text-muted-foreground">Cargando...</p>
        ) : timeline.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin eventos registrados.</p>
        ) : (
          timeline.map((event, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <div className="flex flex-col items-center">
                <div className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                {i < timeline.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
              </div>
              <div className="pb-2 min-w-0">
                {event.tipo === "mensaje" && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground capitalize">{event.rol}</span>
                    {": "}
                    <span className="truncate">{event.contenido ?? "[media]"}</span>
                  </p>
                )}
                {event.tipo === "etapa" && (
                  <p>
                    <ChevronRight className="inline size-3 text-primary" />
                    {" Movido a "}
                    <span className="font-medium">{event.nombreEtapa}</span>
                  </p>
                )}
                {event.tipo === "seguimiento" && (
                  <p>
                    <span className="text-violet-500">Seguimiento</span>
                    {": "}
                    {event.decision}
                    {event.etapaDetectada && <span className="text-muted-foreground"> · {event.etapaDetectada}</span>}
                  </p>
                )}
                {event.tipo === "nota" && (
                  <p>
                    <span className="font-medium">Nota</span> por {event.autor}
                    {": "}
                    <span className="text-muted-foreground">{event.contenido}</span>
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {new Date(event.fecha).toLocaleString("es-MX", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </div>
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}
