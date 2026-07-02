"use client";

import { useEffect, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ESTADO_BADGE_CLASS, ESTADO_LABELS, TIPO_LABELS } from "@/lib/bug-report";

type MyReport = {
  id: string;
  tipo: string;
  descripcion: string;
  pagina: string | null;
  estado: string;
  creadoEn: string;
};

export function MyBugReportsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reports, setReports] = useState<MyReport[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/support/my-reports")
      .then((res) => (res.ok ? res.json() : { reports: [] }))
      .then((data) => setReports(data.reports ?? []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mis reportes</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !reports || reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <Inbox className="size-8" />
              <p className="text-sm">Aún no has enviado ningún reporte.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-border bg-card/50 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground">{r.descripcion}</p>
                    <Badge className={ESTADO_BADGE_CLASS[r.estado] ?? ""}>
                      {ESTADO_LABELS[r.estado] ?? r.estado}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {TIPO_LABELS[r.tipo] ?? r.tipo} ·{" "}
                    {new Date(r.creadoEn).toLocaleString("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
