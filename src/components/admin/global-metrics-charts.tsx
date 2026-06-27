"use client";

import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { MensajesPorDiaChart } from "@/components/charts/mensajes-por-dia";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GlobalStats } from "@/lib/data";

export function GlobalMetricsCharts({ stats }: { stats: GlobalStats }) {
  const chartData = stats.mensajesPorDia.map((d) => ({
    fecha: d.fecha,
    user: d.user,
    bot: d.bot,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Mensajes totales — últimos 14 días
        </h2>
        <div className="rounded-xl border border-border bg-card p-4">
          <MensajesPorDiaChart data={chartData} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Negocios por actividad (últimos 7 días)
        </h2>
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Negocio</TableHead>
                <TableHead className="text-right">Mensajes 7d</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Último mensaje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.negociosPorActividad.map((n) => (
                <TableRow
                  key={n.id}
                  className="cursor-pointer hover:bg-muted/40"
                >
                  <TableCell>
                    <Link
                      href={`/admin/negocios/${n.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {n.nombre}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {n.mensajes7d.toLocaleString("es-MX")}
                  </TableCell>
                  <TableCell className="hidden text-right text-sm text-muted-foreground sm:table-cell">
                    {n.ultimoMensaje
                      ? formatDistanceToNow(parseISO(n.ultimoMensaje), {
                          addSuffix: true,
                          locale: es,
                        })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {stats.negociosPorActividad.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Sin negocios registrados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
