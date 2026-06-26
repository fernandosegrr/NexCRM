"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessagesSquare, RotateCw, Search, Users, WifiOff } from "lucide-react";
import type { MessageDTO } from "@/lib/data";

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
import { PeriodSummaryButton } from "./summary-modal";

const PAGE = 25;

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
          ? `No encontramos contactos que coincidan con “${search}”.`
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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listSseRef = useRef<EventSource | null>(null);

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
                  lastContent: msg.contenido,
                  lastRol: msg.rol,
                  lastTipoMedia: msg.tipoMedia,
                  lastAt: msg.enviadoAt,
                  total: 1,
                  nombre: null,
                  username: null,
                  fotoPerfil: null,
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

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Lista de contactos */}
      <div
        className={cn(
          "flex w-full flex-col border-r border-border md:w-80 lg:w-96",
          selected && "hidden md:flex",
        )}
      >
        <div className="border-b border-border p-3 space-y-2">
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

        <div className="flex-1 overflow-y-auto">
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
          />
        ) : (
          <Placeholder />
        )}
      </div>
    </div>
  );
}
