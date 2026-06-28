import type { Metadata } from "next";

import { getWhatsAppInstances, getRecentIncidents } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { InstanceGrid } from "@/components/admin/estado/instance-grid";
import { IncidentTable } from "@/components/admin/estado/incident-table";
import { CronStatus } from "@/components/admin/estado/cron-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estado del sistema" };

export default async function EstadoPage() {
  const [instances, incidents, cronJobs] = await Promise.all([
    getWhatsAppInstances(),
    getRecentIncidents(50),
    prisma.cronExecution.findMany(),
  ]);

  const unresolvedCount = incidents.filter((i) => !i.resolvedAt).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estado del sistema</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estado en tiempo real de las instancias de WhatsApp.
          {unresolvedCount > 0 && (
            <span className="ml-2 font-medium text-red-500">
              {unresolvedCount} incidente{unresolvedCount > 1 ? "s" : ""} sin resolver.
            </span>
          )}
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Motor de crons</h2>
        <p className="-mt-2 text-sm text-muted-foreground">
          Scheduler interno (node-cron). No depende de servicios externos.
        </p>
        <CronStatus
          jobs={cronJobs.map((j) => ({
            id: j.id,
            ultimaEjecucion: j.ultimaEjecucion?.toISOString() ?? null,
            ultimoEstado: j.ultimoEstado,
            ultimoResultado: j.ultimoResultado,
          }))}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Instancias WhatsApp</h2>
        <InstanceGrid instances={instances} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Historial de incidentes</h2>
        <IncidentTable incidents={incidents} />
      </section>
    </div>
  );
}
