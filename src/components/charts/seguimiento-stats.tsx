"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import type { EmbudoStatItem } from "@/lib/data";

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === "autoEnviados" ? "Automáticos" : "Pendientes manuales"}:{" "}
          {p.value.toLocaleString("es-MX")}
        </p>
      ))}
    </div>
  );
}

export function SeguimientoStatsChart({ data }: { data: EmbudoStatItem[] }) {
  const hasData = data.some((d) => d.autoEnviados > 0 || d.manuales > 0);

  if (!hasData) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Sin datos de seguimientos en este período
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="nombre"
          tick={{ fontSize: 10, fill: "#71717a" }}
          interval={0}
          angle={-15}
          textAnchor="end"
          height={40}
        />
        <YAxis tick={{ fontSize: 11, fill: "#71717a" }} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(v) => (v === "autoEnviados" ? "Automáticos" : "Pendientes manuales")}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="autoEnviados" fill="#6366F1" stackId="a" maxBarSize={32} />
        <Bar
          dataKey="manuales"
          fill="#52525b"
          stackId="a"
          maxBarSize={32}
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
