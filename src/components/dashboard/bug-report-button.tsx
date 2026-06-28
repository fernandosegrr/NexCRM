"use client";

import { useState } from "react";
import { Bug } from "lucide-react";
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

export function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("bug");
  const [descripcion, setDescripcion] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (descripcion.trim().length < 10) {
      toast.error("Describe el problema con más detalle (mínimo 10 caracteres).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/support/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, descripcion, url: window.location.href }),
      });
      if (!res.ok) throw new Error();
      toast.success("Reporte enviado. ¡Gracias!");
      setOpen(false);
      setDescripcion("");
      setTipo("bug");
    } catch {
      toast.error("No se pudo enviar el reporte. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground"
        title="Reportar un problema o sugerencia"
      >
        <Bug className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
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
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Enviando..." : "Enviar reporte"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
