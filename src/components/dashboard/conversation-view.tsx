"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, MessageSquare, RotateCw, WifiOff } from "lucide-react";

import type { ConversationContact, MessageDTO } from "@/lib/data";
import { avatarColor, dayLabel, initialOf, timeOnly } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelBadge } from "@/components/channel-badge";
import { cn } from "@/lib/utils";
import { BotToggle } from "./bot-toggle";

function MessagesSkeleton() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3 py-2">
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setMessages(null);
    setError(false);
    const url = `/api/conversations/${encodeURIComponent(
      contact.uidUsuario,
    )}?instanciaId=${encodeURIComponent(contact.instanciaId)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then((d) => {
        if (alive) setMessages(d.messages ?? []);
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setMessages([]);
        }
      });
    return () => {
      alive = false;
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
    <div className="flex h-full flex-col">
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
          <AvatarFallback className={avatarColor(contact.uidUsuario)}>
            {initialOf(contact.uidUsuario)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">
            {contact.uidUsuario}
          </p>
          <div className="mt-1">
            <ChannelBadge canal={contact.canal} size="xs" />
          </div>
        </div>
        <BotToggle
          instanciaId={contact.instanciaId}
          uidUsuario={contact.uidUsuario}
        />
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
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
          <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
            {messages.map((m, i) => {
              const isBot = m.rol === "bot";
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
                      isBot ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%]",
                        isBot
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md bg-secondary text-secondary-foreground",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {m.contenido && m.contenido.trim()
                          ? m.contenido
                          : m.tipoMedia !== "text"
                            ? `[${m.tipoMedia}]`
                            : ""}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-right text-[10px]",
                          isBot
                            ? "text-primary-foreground/70"
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
    </div>
  );
}
