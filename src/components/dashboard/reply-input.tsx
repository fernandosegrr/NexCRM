"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type MediaPreview = {
  file: File;
  previewUrl: string | null; // only for images
  tipoMedia: "image" | "audio" | "video" | "document";
};

function getMimeCategory(
  file: File,
): "image" | "audio" | "video" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

export function ReplyInput({
  instanciaId,
  uidUsuario,
  canal,
  onSent,
}: {
  instanciaId: string;
  uidUsuario: string;
  canal: string;
  onSent: (msg: {
    id: string;
    contenido: string | null;
    tipoMedia: string;
    mediaUrl: string | null;
    enviadoAt: string;
  }) => void;
}) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState<MediaPreview | null>(null);
  const [sending, setSending] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const tipoMedia = getMimeCategory(file);
    const previewUrl =
      tipoMedia === "image" ? URL.createObjectURL(file) : null;
    setMedia({ file, previewUrl, tipoMedia });
    setText("");
    e.target.value = "";
  }

  function removeMedia() {
    if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
    setMedia(null);
  }

  async function uploadMedia(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Error al subir el archivo");
    }
    const { url } = await res.json();
    return url as string;
  }

  async function handleSend() {
    if (sending) return;
    const contenido = text.trim();
    if (!contenido && !media) return;

    setSending(true);
    try {
      let mediaUrl: string | null = null;
      let tipoMedia: string = "text";

      if (media) {
        mediaUrl = await uploadMedia(media.file);
        tipoMedia = media.tipoMedia;
      }

      const body: Record<string, unknown> = { instanciaId };
      if (contenido) body.contenido = contenido;
      if (mediaUrl) { body.mediaUrl = mediaUrl; body.tipoMedia = tipoMedia; }

      const res = await fetch(
        `/api/conversations/${encodeURIComponent(uidUsuario)}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Error al enviar");
      }
      const data = await res.json();
      onSent({
        id: data.id,
        contenido: contenido || null,
        tipoMedia: data.tipoMedia ?? tipoMedia,
        mediaUrl: data.mediaUrl ?? mediaUrl,
        enviadoAt: data.enviadoAt,
      });
      if (data.sent === false) {
        toast.warning(
          canal === "whatsapp"
            ? "Guardado, pero no se pudo enviar por WhatsApp. Revisa la conexión de Evolution API."
            : "Guardado, pero no se envió: configura el token de Meta para esta instancia.",
        );
      }
      setText("");
      removeMedia();
      textRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !media) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = !sending && (!!text.trim() || !!media);

  return (
    <div className="shrink-0 border-t border-border px-3 py-3 sm:px-4">
      {/* Media preview strip */}
      {media && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          {media.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.previewUrl}
              alt="preview"
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-[10px] font-medium uppercase text-muted-foreground">
              {media.tipoMedia}
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {media.file.name}
          </span>
          <button
            type="button"
            onClick={removeMedia}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* File attachment button */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={handleFileChange}
          disabled={sending}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={sending}
          aria-label="Adjuntar archivo"
        >
          <Paperclip className="size-4" />
        </Button>

        <Textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            media
              ? "Agregar texto opcional…"
              : "Responder como humano… (Enter para enviar)"
          }
          className="min-h-[44px] max-h-32 flex-1 resize-none text-sm"
          rows={1}
          disabled={sending}
        />

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          className="h-11 w-11 shrink-0"
          aria-label="Enviar"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
