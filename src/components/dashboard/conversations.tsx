"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  MessagesSquare,
  RotateCw,
  Search,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { FunnelStageDTO, MessageDTO } from "@/lib/data";

const CANALES = [
  { value: "", label: "Todos" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "messenger", label: "Messenger" },
] as const;

import type { ConversationContact } from "@/lib/data";
import { avatarColor, initialOf, relativeTime, truncate } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelBadge } from "@/components/channel-badge";
import { cn } from "@/lib/utils";
import { ConversationView } from "./conversation-view";
import { KanbanView } from "./kanban-view";
import { PeriodSummaryButton } from "./summary-modal";

const PAGE = 25;
const VIEW_MODE_KEY = "crm-view-mode";

type FollowUpSuggestion = {
  id: string;
  contact: { id: string; nombre: string | null; username: string | null; fotoPerfil: string | null };
  stageId: string;
  stageName: string | null;
  stageColor: string | null;
  mensajeEnviado: string | null;
  razonIA: string | null;
  canal: string;
  uidUsuario: string;
  instanciaId: string;
  creadoAt: string;
  horasSinRespuesta: number;
};

function ListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyList({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Users className="size-6" />
      </div>
      <p className="text-sm font-medium">
        {search ? "Sin resultados" : "Aún no hay conversaciones"}
      </p>
      <p className="mt-1 max-w-[15rem] text-xs text-muted-foreground">
        {search
          ? `No encontramos contactos que coincidan con "${search}".`
          : "Cuando tus bots registren mensajes, tus contactos aparecerán aquí."}
      </p>
    </div>
  );
}

function Placeholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <MessagesSquare className="size-8" />
      </div>
      <h2 className="text-lg font-semibold">Selecciona una conversación</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Elige un contacto de la lista para ver su historial y controlar el bot.
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
        <WifiOff className="size-6" />
      </div>
      <p className="text-sm font-medium">No se pudieron cargar las conversaciones</p>
      <p className="mt-1 max-w-[15rem] text-xs text-muted-foreground">
        Revisa tu conexión e inténtalo de nuevo.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCw /> Reintentar
      </Button>
    </div>
  );
}

export function Conversations() {
  const [contacts, setContacts] = useState<ConversationContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [canal, setCanal] = useState("");
  const [selected, setSelected] = useState<ConversationContact | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [stages, setStages] = useState<FunnelStageDTO[]>([]);
  const [suggestions, setSuggestions] = useState<FollowUpSuggestion[]>([]);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listSseRef = useRef<EventSource | null>(null);
  const processedSugIds = useRef(new Set<string>());

  // Restore view mode from localStorage (hydration-safe)
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "kanban" || saved === "list") setViewMode(saved);
  }, []);

  function switchView(mode: "list" | "kanban") {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    setContacts([]);
    const url = `/api/conversations?take=${PAGE}&skip=0${
      debounced ? `&search=${encodeURIComponent(debounced)}` : ""
    }${canal ? `&canal=${encodeURIComponent(canal)}` : ""}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        const c: ConversationContact[] = d.contacts ?? [];
        setContacts(c);
        setHasMore(c.length === PAGE);
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setContacts([]);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [debounced, canal, reloadKey]);

  // Fetch funnel stages + pending suggestions once we know the businessId
  useEffect(() => {
    const businessId = contacts[0]?.businessId;
    if (!businessId) return;
    fetch(`/api/funnel-stages?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { stages?: FunnelStageDTO[] }) => setStages(d.stages ?? []))
      .catch(() => {});
    fetch(`/api/follow-up/pending?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { suggestions?: FollowUpSuggestion[] }) =>
        setSuggestions((d.suggestions ?? []).filter((s) => !processedSugIds.current.has(s.id))),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts[0]?.businessId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const url = `/api/conversations?take=${PAGE}&skip=${contacts.length}${
        debounced ? `&search=${encodeURIComponent(debounced)}` : ""
      }${canal ? `&canal=${encodeURIComponent(canal)}` : ""}`;
      const d = await (await fetch(url)).json();
      const c: ConversationContact[] = d.contacts ?? [];
      setContacts((prev) => [...prev, ...c]);
      setHasMore(c.length === PAGE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [canal, contacts.length, debounced, hasMore, loadingMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [loadMore]);

  // SSE: update contact list preview when new messages arrive for other contacts
  useEffect(() => {
    if (loading) return;
    listSseRef.current?.close();

    const since = new Date().toISOString();
    const es = new EventSource(`/api/sse?since=${encodeURIComponent(since)}`);
    listSseRef.current = es;

    es.onmessage = (e) => {
      try {
        const newMsgs: MessageDTO[] = JSON.parse(e.data);
        setContacts((prev) => {
          let updated = [...prev];
          for (const msg of newMsgs) {
            const idx = updated.findIndex(
              (c) =>
                c.instanciaId === msg.instanciaId &&
                c.uidUsuario === msg.uidUsuario,
            );
            if (idx >= 0) {
              updated[idx] = {
                ...updated[idx],
                lastContent: msg.contenido,
                lastRol: msg.rol,
                lastTipoMedia: msg.tipoMedia,
                lastAt: msg.enviadoAt,
                total: updated[idx].total + 1,
              };
              const [contact] = updated.splice(idx, 1);
              updated = [contact, ...updated];
            } else {
              updated = [
                {
                  instanciaId: msg.instanciaId,
                  uidUsuario: msg.uidUsuario,
                  canal: msg.canal,
                  businessId: msg.businessId,
                  lastContent: msg.contenido,
                  lastRol: msg.rol,
                  lastTipoMedia: msg.tipoMedia,
                  lastAt: msg.enviadoAt,
                  total: 1,
                  nombre: null,
                  username: null,
                  fotoPerfil: null,
                  stageId: null,
                  stageNombre: null,
                  stageColor: null,
                  sugerenciaStageId: null,
                  sugerenciaNombre: null,
                  sugerenciaColor: null,
                  sugerenciaRazon: null,
                },
                ...updated,
              ];
            }
          }
          return updated;
        });
      } catch {
        // ignore malformed SSE data
      }
    };

    // Contact updates: resolver saves name/photo async after the first message
    es.addEventListener("contact", (e) => {
      try {
        const updates: {
          instanciaId: string;
          uidUsuario: string;
          nombre: string | null;
          username: string | null;
          fotoPerfil: string | null;
        }[] = JSON.parse((e as MessageEvent).data);

        const merge = <T extends { instanciaId: string; uidUsuario: string; nombre: string | null; username: string | null; fotoPerfil: string | null }>(
          c: T,
        ): T => {
          const upd = updates.find(
            (u) => u.instanciaId === c.instanciaId && u.uidUsuario === c.uidUsuario,
          );
          if (!upd) return c;
          return {
            ...c,
            nombre:     upd.nombre     ?? c.nombre,
            username:   upd.username   ?? c.username,
            fotoPerfil: upd.fotoPerfil ?? c.fotoPerfil,
          };
        };

        setContacts((prev) => prev.map(merge));
        setSelected((prev) => (prev ? merge(prev) : prev));
      } catch {
        // ignore malformed contact event
      }
    });

    return () => {
      listSseRef.current?.close();
      listSseRef.current = null;
    };
  }, [loading]);

  // Handler for optimistic kanban stage change
  function handleKanbanStageChange(cardKey: string, newStageId: string | null) {
    const [instanciaId, uidUsuario] = cardKey.split("::");
    const newStage = stages.find((s) => s.id === newStageId);
    setContacts((prev) =>
      prev.map((c) =>
        c.instanciaId === instanciaId && c.uidUsuario === uidUsuario
          ? {
              ...c,
              stageId: newStageId,
              stageNombre: newStage?.nombre ?? null,
              stageColor: newStage?.color ?? null,
            }
          : c,
      ),
    );
  }

  // Sync list/selected when the stage is changed from the conversation header
  function handleSelectedStageChange(change: {
    stageId: string | null;
    nombre: string | null;
    color: string | null;
  }) {
    setContacts((prev) =>
      prev.map((c) =>
        selected &&
        c.instanciaId === selected.instanciaId &&
        c.uidUsuario === selected.uidUsuario
          ? { ...c, stageId: change.stageId, stageNombre: change.nombre, stageColor: change.color }
          : c,
      ),
    );
    setSelected((prev) =>
      prev
        ? { ...prev, stageId: change.stageId, stageNombre: change.nombre, stageColor: change.color }
        : prev,
    );
  }

  async function handleSuggestionSend(id: string) {
    const r = await fetch("/api/follow-up/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpLogId: id }),
    });
    if (r.ok) {
      processedSugIds.current.add(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      toast.success("Mensaje enviado correctamente.");
    } else {
      toast.error("No se pudo enviar el mensaje.");
    }
  }

  async function handleSuggestionDiscard(id: string) {
    const r = await fetch("/api/follow-up/approve", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpLogId: id }),
    });
    if (r.ok) {
      processedSugIds.current.add(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } else {
      toast.error("No se pudo descartar la sugerencia.");
    }
  }

  // En vista kanban cargamos todos los contactos (sin scroll infinito visible)
  useEffect(() => {
    if (viewMode === "kanban" && !loading && !loadingMore && hasMore) {
      void loadMore();
    }
  }, [viewMode, loading, loadingMore, hasMore, loadMore]);

  // Kanban view (full width, no conversation panel alongside)
  if (viewMode === "kanban" && !loading && !error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, usuario o número…"
              className="pl-10"
            />
          </div>
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <button
              onClick={() => switchView("list")}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Vista lista"
            >
              <List className="size-4" />
            </button>
            <button
              onClick={() => switchView("kanban")}
              className="rounded-md bg-accent p-1.5 text-foreground"
              aria-label="Vista kanban"
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
          <PeriodSummaryButton />
        </div>

        {/* Kanban board */}
        <div className="min-h-0 flex-1 overflow-hidden p-3">
          {contacts.length === 0 ? (
            <EmptyList search={debounced} />
          ) : (
            <KanbanView
              contacts={contacts}
              stages={stages}
              onContactSelect={(c) => setSelected(c)}
              onStageChange={handleKanbanStageChange}
            />
          )}
        </div>

        {/* Conversation overlay when a card is clicked */}
        {selected && (
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            <ConversationView
              key={`${selected.instanciaId}::${selected.uidUsuario}`}
              contact={selected}
              onBack={() => setSelected(null)}
              onStageChange={handleSelectedStageChange}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Lista de contactos */}
      <div
        className={cn(
          "flex w-full flex-col border-r border-border md:w-80 lg:w-96",
          selected && "hidden md:flex",
        )}
      >
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, usuario o número…"
                className="pl-10"
              />
            </div>
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button
                onClick={() => switchView("list")}
                className="rounded-md bg-accent p-1.5 text-foreground"
                aria-label="Vista lista"
              >
                <List className="size-4" />
              </button>
              <button
                onClick={() => switchView("kanban")}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Vista kanban"
              >
                <LayoutGrid className="size-4" />
              </button>
            </div>
            <PeriodSummaryButton />
          </div>
          <div className="flex gap-1">
            {CANALES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCanal(c.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  canal === c.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Panel de sugerencias pendientes */}
        {suggestions.length > 0 && (
          <div className="border-b border-border">
            <button
              onClick={() => setSuggestionsExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-violet-500 hover:bg-accent/40"
            >
              <span>✨ {suggestions.length} sugerencia{suggestions.length > 1 ? "s" : ""} de seguimiento pendiente{suggestions.length > 1 ? "s" : ""}</span>
              {suggestionsExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
            {suggestionsExpanded && (
              <div className="space-y-2 px-2 pb-2">
                {suggestions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border bg-card p-2.5 text-xs space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        {s.contact.fotoPerfil && <AvatarImage src={s.contact.fotoPerfil} alt={s.contact.nombre ?? s.uidUsuario} />}
                        <AvatarFallback className={avatarColor(s.uidUsuario)}>
                          {initialOf(s.contact.nombre ?? s.contact.username ?? s.uidUsuario)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <span className="truncate font-medium">{s.contact.nombre ?? s.contact.username ?? s.uidUsuario}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ChannelBadge canal={s.canal} size="xs" />
                          {s.stageName && s.stageColor && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: s.stageColor + "22", color: s.stageColor }}
                            >
                              {s.stageName}
                            </span>
                          )}
                          <span className="text-muted-foreground">Sin respuesta hace {s.horasSinRespuesta}h</span>
                        </div>
                      </div>
                    </div>
                    {s.razonIA && (
                      <p className="text-muted-foreground text-[11px]">IA: {s.razonIA}</p>
                    )}
                    {s.mensajeEnviado && (
                      <p className="rounded bg-muted px-2 py-1 text-[11px] leading-relaxed">{s.mensajeEnviado}</p>
                    )}
                    <div className="flex gap-1.5 pt-0.5">
                      <button
                        onClick={() => void handleSuggestionSend(s.id)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-500/10 py-1 text-[11px] font-medium text-emerald-500 hover:bg-emerald-500/20"
                      >
                        <Check className="size-3" /> Enviar
                      </button>
                      <button
                        onClick={() => void handleSuggestionDiscard(s.id)}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md bg-muted py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                      >
                        <X className="size-3" /> Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState onRetry={() => setReloadKey((n) => n + 1)} />
          ) : contacts.length === 0 ? (
            <EmptyList search={debounced} />
          ) : (
            <>
              <ul className="divide-y divide-border/60">
                {contacts.map((c) => {
                  const active =
                    selected?.instanciaId === c.instanciaId &&
                    selected?.uidUsuario === c.uidUsuario;
                  return (
                    <li key={`${c.instanciaId}::${c.uidUsuario}`}>
                      <button
                        onClick={() => setSelected(c)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50",
                          active && "bg-accent",
                        )}
                      >
                        <Avatar className="h-11 w-11 shrink-0">
                          {c.fotoPerfil && (
                            <AvatarImage src={c.fotoPerfil} alt={c.nombre ?? c.uidUsuario} />
                          )}
                          <AvatarFallback className={avatarColor(c.uidUsuario)}>
                            {initialOf(c.nombre ?? c.username ?? c.uidUsuario)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                              {c.nombre ?? c.username ?? c.uidUsuario}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {relativeTime(c.lastAt)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-1.5">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <ChannelBadge canal={c.canal} size="xs" />
                              {c.stageNombre && c.stageColor && (
                                <span
                                  className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                  style={{
                                    backgroundColor: c.stageColor + "22",
                                    color: c.stageColor,
                                  }}
                                >
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: c.stageColor }}
                                  />
                                  {c.stageNombre}
                                </span>
                              )}
                              <span className="truncate text-xs text-muted-foreground">
                                {c.lastRol === "bot" || c.lastRol === "page"
                                  ? "Bot: "
                                  : c.lastRol === "human"
                                    ? "Tú: "
                                    : ""}
                                {c.lastContent
                                  ? truncate(c.lastContent, 22)
                                  : c.lastTipoMedia === "image"    ? "📷 Imagen"
                                  : c.lastTipoMedia === "audio"    ? "🎵 Audio"
                                  : c.lastTipoMedia === "video"    ? "🎬 Video"
                                  : c.lastTipoMedia === "document" ? "📄 Documento"
                                  : c.lastTipoMedia === "sticker"  ? "🎭 Sticker"
                                  : "(sin texto)"}
                              </span>
                            </div>
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                              {c.total}
                            </span>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div ref={sentinelRef} className="h-px" />
              {loadingMore && (
                <div className="border-t border-border/60">
                  <ListSkeleton rows={2} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Conversación */}
      <div
        className={cn(
          "min-w-0 flex-1 overflow-hidden",
          selected
            ? "flex flex-col max-md:fixed max-md:inset-0 max-md:z-50 max-md:bg-background"
            : "hidden md:flex",
        )}
      >
        {selected ? (
          <ConversationView
            key={`${selected.instanciaId}::${selected.uidUsuario}`}
            contact={selected}
            onBack={() => setSelected(null)}
            onStageChange={handleSelectedStageChange}
          />
        ) : (
          <Placeholder />
        )}
      </div>
    </div>
  );
}
