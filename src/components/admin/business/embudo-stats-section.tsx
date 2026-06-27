"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { EmbudoStatItem } from "@/lib/data";

export function EmbudoStatsSection({ businessId }: { businessId: string }) {
  const [data, setData] = useState<EmbudoStatItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/metrics/classifier?businessId=${businessId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true));
  }, [businessId]);

  if (error) return null;

  if (!data) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const hasStats = data.some((d) => d.totalContactos > 0 || d.autoEnviados > 0);
  if (!hasStats) return null;

  return (
    <div className="mt-6 space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Contactos por etapa
      </h3>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Etapa
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                Contactos
              </th>
              <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">
                Seguimientos
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row) => (
              <tr key={row.stageId} className="hover:bg-muted/20">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                    {row.nombre}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {row.totalContactos.toLocaleString("es-MX")}
                </td>
                <td className="hidden px-3 py-2 text-right text-muted-foreground sm:table-cell">
                  {row.autoEnviados > 0
                    ? `${row.autoEnviados.toLocaleString("es-MX")} auto`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
