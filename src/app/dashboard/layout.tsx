import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/admin/user-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.rol === "ADMIN") redirect("/admin");

  let nombreNegocio = "Sin negocio asignado";
  if (session.user.businessId) {
    const b = await prisma.business.findUnique({
      where: { id: session.user.businessId },
      select: { nombre: true },
    });
    if (b) nombreNegocio = b.nombre;
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
        <Logo showText={false} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            {nombreNegocio}
          </p>
          <p className="text-xs leading-tight text-muted-foreground">
            NexAI CRM
          </p>
        </div>
        <div className="flex-1" />
        <UserMenu nombre={session.user.nombre} email={session.user.email} />
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
