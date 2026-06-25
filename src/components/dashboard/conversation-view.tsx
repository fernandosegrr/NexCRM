"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, FileText, MessageSquare, RotateCw, WifiOff } from "lucide-react";

import type { ConversationContact, MessageDTO } from "@/lib/data";
import { avatarColor, dayLabel, initialOf, timeOnly } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelBadge } from "@/components/channel-badge";
import { cn } from "@/lib/utils";
import { BotToggle } from "./bot-toggle";
import { ReplyInput } from "./reply-input";
import { ConversationSummaryButton } from "./summary-modal";

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
}: {
  contact: ConversationContact;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<MessageDTO[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

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
    <div className="flex h-full min-h-0 w-full flex-col">
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
        <BotToggle
          instanciaId={contact.instanciaId}
          uidUsuario={contact.uidUsuario}
        />
      </div>

      {/* Mensajes */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 sm:px-6">
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
                      className={cn(
                        "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%]",
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
  );
}
