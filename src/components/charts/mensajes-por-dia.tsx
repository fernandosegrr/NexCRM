"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import type { MensajesPorDia } from "@/lib/data";

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
      <p className="mb-1.5 font-medium text-foreground">
        {label ? format(parseISO(label), "d MMM yyyy", { locale: es }) : ""}
      </p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === "user" ? "Usuario" : "Bot"}: {p.value.toLocaleString("es-MX")}
        </p>
      ))}
    </div>
  );
}

export function MensajesPorDiaChart({ data }: { data: MensajesPorDia[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Aún no hay mensajes en este período
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="fecha"
          tick={{ fontSize: 11, fill: "#71717a" }}
          tickFormatter={(v: string) => format(parseISO(v), "d MMM", { locale: es })}
        />
        <YAxis tick={{ fontSize: 11, fill: "#71717a" }} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(v) => (v === "user" ? "Usuario" : "Bot")}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="user"
          stroke="#6366F1"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="bot"
          stroke="#52525b"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
