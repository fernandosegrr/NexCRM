import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user || session.user.rol !== "ADMIN") {
    redirect("/login");
  }

  return (
    <AdminShell nombre={session.user.nombre} email={session.user.email}>
      {children}
    </AdminShell>
  );
}
