"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessagesSquare, RotateCw, Search, Users, WifiOff } from "lucide-react";

import type { ConversationContact } from "@/lib/data";
import { avatarColor, initialOf, relativeTime, truncate } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelBadge } from "@/components/channel-badge";
import { cn } from "@/lib/utils";
import { ConversationView } from "./conversation-view";

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
  const [selected, setSelected] = useState<ConversationContact | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    const url = `/api/conversations?take=${PAGE}&skip=0${
      debounced ? `&search=${encodeURIComponent(debounced)}` : ""
    }`;
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
  }, [debounced, reloadKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const url = `/api/conversations?take=${PAGE}&skip=${contacts.length}${
        debounced ? `&search=${encodeURIComponent(debounced)}` : ""
      }`;
      const d = await (await fetch(url)).json();
      const c: ConversationContact[] = d.contacts ?? [];
      setContacts((prev) => [...prev, ...c]);
      setHasMore(c.length === PAGE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [contacts.length, debounced, hasMore, loadingMore]);

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

  return (
    <div className="flex h-full">
      {/* Lista de contactos */}
      <div
        className={cn(
          "flex w-full flex-col border-r border-border md:w-80 lg:w-96",
          selected && "hidden md:flex",
        )}
      >
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contacto…"
              className="pl-10"
            />
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
                          <AvatarFallback className={avatarColor(c.uidUsuario)}>
                            {initialOf(c.uidUsuario)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                              {c.uidUsuario}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {relativeTime(c.lastAt)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <ChannelBadge canal={c.canal} size="xs" />
                            <span className="truncate text-xs text-muted-foreground">
                              {c.lastRol === "bot" ? "Bot: " : ""}
                              {truncate(c.lastContent ?? "", 26) || "(sin texto)"}
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
          "min-w-0 flex-1",
          selected
            ? "flex max-md:fixed max-md:inset-0 max-md:z-50 max-md:bg-background"
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
