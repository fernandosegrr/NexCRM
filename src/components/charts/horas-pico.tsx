"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { HoraPico } from "@/lib/data";

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{label}:00 h</p>
      <p className="text-muted-foreground">
        {payload[0].value.toLocaleString("es-MX")} mensajes
      </p>
    </div>
  );
}

export function HorasPicoChart({ data }: { data: HoraPico[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Aún no hay mensajes en este período
      </div>
    );
  }

  const filled = Array.from({ length: 24 }, (_, i) => {
    const found = data.find((d) => d.hora === i);
    return { hora: i, total: found?.total ?? 0 };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={filled} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="hora"
          tick={{ fontSize: 10, fill: "#71717a" }}
          tickFormatter={(v: number) => `${v}h`}
          interval={2}
        />
        <YAxis tick={{ fontSize: 11, fill: "#71717a" }} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="total" fill="#6366F1" radius={[3, 3, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
