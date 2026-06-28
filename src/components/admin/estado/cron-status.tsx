"use client";

import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

export type CronJob = {
  id: string;
  ultimaEjecucion: string | null;
  ultimoEstado: string | null;
  ultimoResultado: string | null;
};

const LABELS: Record<string, string> = {
  "health-check": "Health check · cada 5 min",
  "follow-up": "Seguimiento IA · cada 15 min",
  campaigns: "Campañas · cada minuto",
  "weekly-summary": "Resumen semanal · lunes 8 AM",
};

const ORDER = ["health-check", "follow-up", "campaigns", "weekly-summary"];

function relativeTime(iso: string | null): string {
  if (!iso) return "Nunca ejecutado";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "hace unos segundos";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function prettyJson(raw: string | null): string {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function CronStatus({ jobs }: { jobs: CronJob[] }) {
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const sorted = [...jobs].sort(
    (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id),
  );

  if (sorted.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        El scheduler aún no ha registrado ejecuciones. Aparecerán aquí tras el
        primer ciclo.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((job) => {
        const isOpen = expanded === job.id;
        const ok = job.ultimoEstado === "ok";
        const err = job.ultimoEstado === "error";
        return (
          <div key={job.id} className="rounded-xl border border-border bg-card">
            <button
              onClick={() => setExpanded(isOpen ? null : job.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              {err ? (
                <XCircle className="size-4 shrink-0 text-red-500" />
              ) : ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              ) : (
                <Clock className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {LABELS[job.id] ?? job.id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {mounted ? relativeTime(job.ultimaEjecucion) : "…"}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  err
                    ? "bg-red-500/15 text-red-500"
                    : ok
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {job.ultimoEstado ?? "pendiente"}
              </span>
              {isOpen ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
            {isOpen && (
              <div className="border-t border-border px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Último resultado
                </p>
                <pre className="max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed">
                  {prettyJson(job.ultimoResultado)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
