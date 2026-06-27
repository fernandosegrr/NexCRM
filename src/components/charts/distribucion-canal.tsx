"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

import type { DistribucionCanal } from "@/lib/data";

const CANAL_COLORS: Record<string, string> = {
  whatsapp: "#25D366",
  instagram: "#E1306C",
  messenger: "#0084FF",
};

const CANAL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { canal: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">
        {CANAL_LABELS[item.payload.canal] ?? item.payload.canal}
      </p>
      <p className="text-muted-foreground">
        {item.value.toLocaleString("es-MX")} mensajes
      </p>
    </div>
  );
}

export function DistribucionCanalChart({ data }: { data: DistribucionCanal[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Sin datos de canales
      </div>
    );
  }

  if (data.length === 1) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-border bg-card/30 text-sm text-muted-foreground">
        Canal único: <span className="ml-1 font-medium text-foreground">
          {CANAL_LABELS[data[0].canal] ?? data[0].canal}
        </span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="canal"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={3}
        >
          {data.map((entry) => (
            <Cell
              key={entry.canal}
              fill={CANAL_COLORS[entry.canal] ?? "#6366F1"}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => CANAL_LABELS[value] ?? value}
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
