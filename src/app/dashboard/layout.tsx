import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/admin/user-menu";
import { Providers } from "@/components/providers";
import {
  DashboardDesktopNav,
  DashboardMobileNav,
  type NavPermisos,
} from "@/components/dashboard/dashboard-nav";

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

  const permisos: NavPermisos = {
    embudo: hasPermission(session.user, "ver_embudo"),
    reportes: hasPermission(session.user, "ver_reportes"),
    campanas: hasPermission(session.user, "gestionar_campanas"),
    config:
      hasPermission(session.user, "gestionar_contactos") ||
      hasPermission(session.user, "gestionar_roles") ||
      hasPermission(session.user, "gestionar_usuarios"),
  };

  return (
    <Providers session={session}>
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
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
        {session.user.businessId && <DashboardDesktopNav permisos={permisos} />}
        <UserMenu nombre={session.user.nombre} email={session.user.email} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      {session.user.businessId && <DashboardMobileNav permisos={permisos} />}
    </div>
    </Providers>
  );
}
