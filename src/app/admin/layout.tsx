import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/admin/admin-shell";

const getIncidentCount = unstable_cache(
  () => prisma.incidentLog.count({ where: { resolvedAt: null } }),
  ["incident-count"],
  { revalidate: 60 },
);

const getOverduePaymentsCount = unstable_cache(
  () =>
    prisma.paymentConfig.count({
      where: { activo: true, suspendido: false, proximoPago: { lt: new Date() } },
    }),
  ["overdue-payments-count"],
  { revalidate: 300 },
);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user || session.user.rol !== "ADMIN") {
    redirect("/login");
  }

  const [incidentCount, overduePaymentsCount] = await Promise.all([
    getIncidentCount(),
    getOverduePaymentsCount(),
  ]);

  return (
    <AdminShell
      nombre={session.user.nombre}
      email={session.user.email}
      incidentCount={incidentCount}
      overduePaymentsCount={overduePaymentsCount}
    >
      {children}
    </AdminShell>
  );
}
