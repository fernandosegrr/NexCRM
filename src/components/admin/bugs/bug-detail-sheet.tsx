"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fullDateTime } from "@/lib/format";
import { ESTADO_LABELS, PRIORIDAD_LABELS, TIPO_LABELS } from "@/lib/bug-report";
import type { BugReportListItem } from "./bugs-manager";

type Nota = { id: string; contenido: string; creadoEn: string };

type Detail = BugReportListItem & { notas: Nota[] };

const ESTADOS = ["abierto", "en_progreso", "resuelto", "descartado"];
const PRIORIDADES = ["baja", "media", "alta", "critica"];

export function BugDetailSheet({
  report,
  onClose,
}: {
  report: BugReportListItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nuevaNota, setNuevaNota] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!report) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetch(`/api/admin/bugs/${report.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [report]);

  async function updateField(field: "estado" | "prioridad", value: string) {
    if (!detail) return;
    const prev = detail;
    setDetail({ ...detail, [field]: value });
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/bugs/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setDetail((d) => (d ? { ...d, ...updated } : d));
      router.refresh();
    } catch {
      setDetail(prev);
      toast.error("No se pudo actualizar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!detail || nuevaNota.trim().length === 0) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/admin/bugs/${detail.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenido: nuevaNota.trim() }),
      });
      if (!res.ok) throw new Error();
      const note = await res.json();
      setDetail((d) => (d ? { ...d, notas: [...d.notas, note] } : d));
      setNuevaNota("");
      router.refresh();
    } catch {
      toast.error("No se pudo agregar la nota.");
    } finally {
      setAddingNote(false);
    }
  }

  return (
    <Sheet open={!!report} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Reporte de bug</SheetTitle>
        </SheetHeader>

        {loading || !detail ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 space-y-5 p-6">
            <div>
              <Badge variant="outline" className="mb-2">
                {TIPO_LABELS[detail.tipo] ?? detail.tipo}
              </Badge>
              <p className="text-xs text-muted-foreground">
                {detail.businessNombre} &middot; {detail.nombreReporta}
                {detail.emailReporta ? ` (${detail.emailReporta})` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fullDateTime(detail.creadoEn)}
              </p>
              {detail.pagina && (
                <p className="mt-1 truncate text-xs text-muted-foreground" title={detail.pagina}>
                  Página: {detail.pagina}
                </p>
              )}
            </div>

            <div>
              <Label>Descripción</Label>
              <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">
                {detail.descripcion}
              </p>
            </div>

            {detail.screenshot && (
              <div>
                <Label>Captura de pantalla</Label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.screenshot}
                  alt="Captura del reporte"
                  className="mt-1.5 max-h-64 w-full cursor-pointer rounded-lg border border-border object-cover transition-opacity hover:opacity-90"
                  onClick={() => setLightboxUrl(detail.screenshot)}
                />
                {lightboxUrl && (
                  <div
                    className="fixed inset-0 z-[60] flex cursor-pointer items-center justify-center bg-black/80 p-4"
                    onClick={() => setLightboxUrl(null)}
                  >
                    <div className="relative max-h-[90vh] max-w-[90vw]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={lightboxUrl}
                        alt="Captura ampliada"
                        className="max-h-[90vh] max-w-full rounded-lg object-contain"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={() => setLightboxUrl(null)}
                        className="absolute -right-3 -top-3 rounded-full bg-white p-1 shadow-lg"
                      >
                        <X className="h-4 w-4 text-black" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={detail.estado}
                  onValueChange={(v) => updateField("estado", v)}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {ESTADO_LABELS[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Select
                  value={detail.prioridad}
                  onValueChange={(v) => updateField("prioridad", v)}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORIDAD_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {detail.resueltoEn && (
              <p className="text-xs text-muted-foreground">
                Resuelto el {fullDateTime(detail.resueltoEn)}
              </p>
            )}

            <div className="space-y-2 border-t border-border pt-4">
              <Label>Notas internas</Label>
              {detail.notas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin notas todavía.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.notas.map((n) => (
                    <li key={n.id} className="rounded-lg border border-border p-3">
                      <p className="whitespace-pre-wrap text-sm">{n.contenido}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fullDateTime(n.creadoEn)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 pt-1">
                <Textarea
                  placeholder="Agregar una nota interna..."
                  rows={2}
                  value={nuevaNota}
                  onChange={(e) => setNuevaNota(e.target.value)}
                  className="resize-none"
                />
                <Button
                  size="icon"
                  onClick={addNote}
                  disabled={addingNote || nuevaNota.trim().length === 0}
                  aria-label="Agregar nota"
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
