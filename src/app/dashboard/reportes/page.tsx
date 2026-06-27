import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getBusinessMetrics, getEmbudoStats } from "@/lib/data";
import { ReportesContent } from "@/components/dashboard/reportes-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportes" };

export default async function ReportesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.rol === "ADMIN") redirect("/admin");

  const businessId = session.user.businessId;
  if (!businessId) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold">Sin negocio asignado</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Contacta a tu administrador para que te asigne a un negocio.
          </p>
        </div>
      </div>
    );
  }

  const [initialMetrics, initialEmbudo] = await Promise.all([
    getBusinessMetrics(businessId, 14),
    getEmbudoStats(businessId),
  ]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <ReportesContent
        businessId={businessId}
        initialMetrics={initialMetrics}
        initialEmbudo={initialEmbudo}
      />
    </div>
  );
}
