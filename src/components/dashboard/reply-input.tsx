"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ReplyInput({
  instanciaId,
  uidUsuario,
  canal,
  onSent,
}: {
  instanciaId: string;
  uidUsuario: string;
  canal: string;
  onSent: (msg: { id: string; contenido: string; enviadoAt: string }) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const contenido = text.trim();
    if (!contenido || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(uidUsuario)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instanciaId, contenido }),
        },
      );
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      onSent({ id: data.id, contenido, enviadoAt: data.enviadoAt });
      setText("");
      ref.current?.focus();
    } catch {
      // TODO: toast de error
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="shrink-0 border-t border-border px-3 py-3 sm:px-4">
      {canal !== "whatsapp" && (
        <p className="mb-2 text-[11px] text-amber-400/80">
          Solo se registra en el CRM — envío por Meta API requiere configuración adicional.
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Responder como humano… (Enter para enviar, Shift+Enter para salto de línea)"
          className="min-h-[44px] max-h-32 resize-none text-sm"
          rows={1}
          disabled={sending}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="h-11 w-11 shrink-0"
          aria-label="Enviar"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
