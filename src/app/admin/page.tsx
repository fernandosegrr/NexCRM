import { MessageSquare, Store, TrendingDown, TrendingUp } from "lucide-react";

import { getGlobalStats } from "@/lib/data";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { GlobalMetricsCharts } from "@/components/admin/global-metrics-charts";
import { PaymentOverviewSection } from "@/components/admin/payment-overview-section";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const stats = await getGlobalStats(14);

  const diff = stats.mensajesHoy - stats.mensajesAyer;
  const diffLabel =
    stats.mensajesAyer === 0
      ? undefined
      : diff >= 0
        ? `+${diff.toLocaleString("es-MX")} vs ayer`
        : `${diff.toLocaleString("es-MX")} vs ayer`;

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Store}
          value={stats.totalNegocios}
          label="Negocios activos"
        />
        <StatCard
          icon={MessageSquare}
          value={stats.mensajesHoy}
          label="Mensajes hoy"
          sub={diffLabel}
        />
        <StatCard
          icon={diff >= 0 ? TrendingUp : TrendingDown}
          value={stats.mensajesAyer}
          label="Mensajes ayer"
        />
      </div>

      <GlobalMetricsCharts stats={stats} />

      <PaymentOverviewSection />
    </div>
  );
}
