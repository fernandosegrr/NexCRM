"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

import type { EmbudoStatItem } from "@/lib/data";

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value: number; payload: EmbudoStatItem }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="mb-1 font-medium text-foreground">{item.nombre}</p>
      <p className="text-muted-foreground">
        {item.totalContactos.toLocaleString("es-MX")} contactos
      </p>
      {item.autoEnviados > 0 && (
        <p className="text-muted-foreground">
          {item.autoEnviados} seguimientos automáticos
        </p>
      )}
    </div>
  );
}

export function EmbudoConversionChart({ data }: { data: EmbudoStatItem[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Sin etapas configuradas
      </div>
    );
  }

  const height = Math.max(data.length * 48 + 40, 200);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#71717a" }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="nombre"
          tick={{ fontSize: 11, fill: "#71717a" }}
          width={100}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="totalContactos" maxBarSize={20} radius={[0, 3, 3, 0]}>
          {data.map((entry) => (
            <Cell key={entry.stageId} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
