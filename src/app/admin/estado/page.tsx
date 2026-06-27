import type { Metadata } from "next";

import { getWhatsAppInstances, getRecentIncidents } from "@/lib/data";
import { InstanceGrid } from "@/components/admin/estado/instance-grid";
import { IncidentTable } from "@/components/admin/estado/incident-table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Estado del sistema" };

export default async function EstadoPage() {
  const [instances, incidents] = await Promise.all([
    getWhatsAppInstances(),
    getRecentIncidents(50),
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
