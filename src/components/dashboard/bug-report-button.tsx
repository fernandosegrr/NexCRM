"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Diálogo de reporte de bugs, controlado por el padre. Antes vivía dentro de un
 * botón flotante (que tapaba otros controles, ver Bug 6). Ahora el disparador
 * vive en el menú "Más" de la navegación móvil y en el UserMenu de desktop.
 */
export function BugReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tipo, setTipo] = useState("bug");
  const [descripcion, setDescripcion] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    e.target.value = "";
  }

  async function handleSubmit() {
    if (descripcion.trim().length < 10) {
      toast.error("Describe el problema con más detalle (mínimo 10 caracteres).");
      return;
    }
    setLoading(true);
    try {
      let screenshot: string | undefined;
      if (screenshotFile) {
        const formData = new FormData();
        formData.append("file", screenshotFile);
        formData.append("folder", "bug-reports");
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          screenshot = data.url;
        }
      }
      const res = await fetch("/api/support/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, descripcion, url: window.location.href, screenshot }),
      });
      if (!res.ok) throw new Error();
      toast.success('Reporte enviado. Puedes ver su estado en "Mis reportes".');
      onOpenChange(false);
      setDescripcion("");
      setTipo("bug");
      setScreenshotFile(null);
    } catch {
      toast.error("No se pudo enviar el reporte. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reportar un problema</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">🐛 Bug — algo no funciona</SelectItem>
                <SelectItem value="sugerencia">💡 Sugerencia de mejora</SelectItem>
                <SelectItem value="pregunta">❓ Tengo una pregunta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea
              placeholder="Describe con detalle qué pasó, qué esperabas que pasara y cómo reproducirlo..."
              rows={5}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Captura de pantalla (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading}
            />
            {screenshotFile ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <span className="truncate text-muted-foreground">{screenshotFile.name}</span>
                <button
                  type="button"
                  onClick={() => setScreenshotFile(null)}
                  disabled={loading}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Quitar captura"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
              >
                <Paperclip className="mr-1.5 size-4" /> Adjuntar imagen
              </Button>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              setScreenshotFile(null);
            }}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Enviando..." : "Enviar reporte"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
