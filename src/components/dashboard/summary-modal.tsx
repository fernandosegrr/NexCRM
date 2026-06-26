"use client";

import { useRef, useState } from "react";
import { Bot, Calendar, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Period = "conversation" | "day" | "week" | "month" | "quarter";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day",      label: "Hoy" },
  { value: "week",     label: "Últimos 7 días" },
  { value: "month",    label: "Último mes" },
  { value: "quarter",  label: "Último trimestre" },
];

// ── Conversation summary ─────────────────────────────────────────────────────

export function ConversationSummaryButton({
  instanciaId,
  uidUsuario,
}: {
  instanciaId: string;
  uidUsuario: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ period: string; count?: number } | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "conversation", instanciaId, uidUsuario }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al generar resumen");
      setSummary(data.summary);
      setMeta({ period: data.period, count: data.count });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    if (!summary && !loading) generate();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-xs"
        onClick={handleOpen}
        title="Resumir conversación con IA"
      >
        <Sparkles className="size-3.5" />
        <span className="hidden sm:inline">Resumir</span>
      </Button>

      {open && (
        <SummaryDialog
          title="Resumen de la conversación"
          meta={meta}
          loading={loading}
          summary={summary}
          error={error}
          onRetry={generate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Period summary ────────────────────────────────────────────────────────────

export function PeriodSummaryButton() {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("day");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ period: string; conversations?: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function generate(p: Period) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: p }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al generar resumen");
      setSummary(data.summary);
      setMeta({ period: data.period, conversations: data.conversations });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    generate(period);
  }

  function handlePeriodChange(p: Period) {
    setPeriod(p);
    setSummary(null);
    setError(null);
    generate(p);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-xs"
        onClick={handleOpen}
        title="Resumen del período"
      >
        <Calendar className="size-3.5" />
        <span className="hidden sm:inline">Resumen</span>
      </Button>

      {open && (
        <SummaryDialog
          title="Resumen del período"
          meta={meta}
          loading={loading}
          summary={summary}
          error={error}
          onRetry={() => generate(period)}
          onClose={() => setOpen(false)}
          periodSelector={
            <div className="flex flex-wrap gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => handlePeriodChange(p.value)}
                  disabled={loading}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    period === p.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          }
        />
      )}
    </>
  );
}

// ── Shared dialog ─────────────────────────────────────────────────────────────

function SummaryDialog({
  title,
  meta,
  loading,
  summary,
  error,
  onRetry,
  onClose,
  periodSelector,
}: {
  title: string;
  meta: { period?: string; count?: number; conversations?: number } | null;
  loading: boolean;
  summary: string | null;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  periodSelector?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Bot className="size-4 text-primary" />
          <span className="flex-1 text-sm font-semibold">{title}</span>
          {meta && (
            <span className="text-xs text-muted-foreground">
              {meta.period}
              {meta.conversations != null ? ` · ${meta.conversations} conv.` : ""}
              {meta.count != null ? ` · ${meta.count} msgs` : ""}
            </span>
          )}
          <button onClick={onClose} className="ml-2 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Period selector */}
        {periodSelector && (
          <div className="border-b border-border px-4 py-2">
            {periodSelector}
          </div>
        )}

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm">Generando resumen con IA…</p>
            </div>
          )}
          {error && !loading && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={onRetry}>
                Reintentar
              </Button>
            </div>
          )}
          {summary && !loading && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {summary}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
