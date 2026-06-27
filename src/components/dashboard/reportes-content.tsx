"use client";

import { useEffect, useState } from "react";
import { BarChart2, Bot, MessageSquare, Users } from "lucide-react";
import { toast } from "sonner";

import { StatCard } from "@/components/admin/stat-card";
import { MensajesPorDiaChart } from "@/components/charts/mensajes-por-dia";
import { HorasPicoChart } from "@/components/charts/horas-pico";
import { DistribucionCanalChart } from "@/components/charts/distribucion-canal";
import { EmbudoConversionChart } from "@/components/charts/embudo-conversion";
import { SeguimientoStatsChart } from "@/components/charts/seguimiento-stats";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BusinessMetrics, EmbudoStatItem } from "@/lib/data";

const PERIODS = [
  { label: "7 días", value: 7 },
  { label: "14 días", value: 14 },
  { label: "30 días", value: 30 },
  { label: "3 meses", value: 90 },
] as const;

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="rounded-xl border border-border bg-card p-4">{children}</div>
    </div>
  );
}

export function ReportesContent({
  businessId,
  initialMetrics,
  initialEmbudo,
}: {
  businessId: string;
  initialMetrics: BusinessMetrics;
  initialEmbudo: EmbudoStatItem[];
}) {
  const [metrics, setMetrics] = useState<BusinessMetrics>(initialMetrics);
  const [embudo, setEmbudo] = useState<EmbudoStatItem[]>(initialEmbudo);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/business?businessId=${businessId}&days=${days}`)
      .then((r) => r.json())
      .then((d: { metrics: BusinessMetrics; embudoStats: EmbudoStatItem[] }) => {
        setMetrics(d.metrics);
        setEmbudo(d.embudoStats);
      })
      .catch(() => toast.error("No se pudieron cargar las métricas."))
      .finally(() => setLoading(false));
  }, [businessId, days]);

  const totalUser = metrics.mensajesPorDia.reduce((s, d) => s + d.user, 0);
  const totalBot = metrics.mensajesPorDia.reduce((s, d) => s + d.bot, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={days === p.value ? "default" : "outline"}
              onClick={() => setDays(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={MessageSquare} value={totalUser + totalBot} label="Total mensajes" />
          <StatCard icon={MessageSquare} value={totalUser} label="Mensajes de usuario" />
          <StatCard icon={Bot} value={totalBot} label="Respuestas bot" />
          <StatCard
            icon={Users}
            value={embudo.reduce((s, e) => s + e.totalContactos, 0)}
            label="Contactos en embudo"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Mensajes por día">
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : (
            <MensajesPorDiaChart data={metrics.mensajesPorDia} />
          )}
        </ChartCard>

        <ChartCard title="Horas pico (últimos 30 días)">
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : (
            <HorasPicoChart data={metrics.horasPico} />
          )}
        </ChartCard>

        <ChartCard title="Distribución por canal">
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : (
            <DistribucionCanalChart data={metrics.distribucionCanal} />
          )}
        </ChartCard>

        <ChartCard title="Contactos por etapa del embudo">
          {loading ? (
            <Skeleton className="h-[220px] w-full rounded-lg" />
          ) : (
            <EmbudoConversionChart data={embudo} />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Seguimientos por etapa">
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-lg" />
        ) : (
          <SeguimientoStatsChart data={embudo} />
        )}
      </ChartCard>
    </div>
  );
}
