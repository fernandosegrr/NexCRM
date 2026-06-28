import dynamic from "next/dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart2, Filter, Megaphone, MessageSquare, Settings, Wifi } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/admin/user-menu";

const BugReportButton = dynamic(
  () =>
    import("@/components/dashboard/bug-report-button").then(
      (m) => m.BugReportButton,
    ),
  { ssr: false },
);

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
        {session.user.businessId && (
          <div className="hidden items-center gap-1 sm:flex">
            {hasPermission(session.user, "ver_embudo") && (
              <Link
                href="/dashboard/embudo"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Configurar embudo de ventas"
              >
                <Filter className="size-4" />
                <span>Embudo</span>
              </Link>
            )}
            {hasPermission(session.user, "ver_reportes") && (
              <Link
                href="/dashboard/reportes"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Reportes y métricas"
              >
                <BarChart2 className="size-4" />
                <span>Reportes</span>
              </Link>
            )}
            {hasPermission(session.user, "gestionar_campanas") && (
              <Link
                href="/dashboard/campanas"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Campañas de mensajes"
              >
                <Megaphone className="size-4" />
                <span>Campañas</span>
              </Link>
            )}
            <Link
              href="/dashboard/conexion"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Estado de conexión WhatsApp"
            >
              <Wifi className="size-4" />
              <span>Conexión</span>
            </Link>
            {hasPermission(session.user, "gestionar_contactos") && (
              <Link
                href="/dashboard/configuracion"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Configuración"
              >
                <Settings className="size-4" />
                <span>Config.</span>
              </Link>
            )}
          </div>
        )}
        <UserMenu nombre={session.user.nombre} email={session.user.email} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      <BugReportButton />
      {session.user.businessId && (
        <nav className="flex h-14 shrink-0 items-center justify-around border-t bg-background/95 px-2 backdrop-blur-md sm:hidden">
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <MessageSquare className="size-5" />
            <span className="text-[10px] font-medium">Chats</span>
          </Link>
          {hasPermission(session.user, "ver_embudo") && (
            <Link
              href="/dashboard/embudo"
              className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Filter className="size-5" />
              <span className="text-[10px] font-medium">Embudo</span>
            </Link>
          )}
          {hasPermission(session.user, "ver_reportes") && (
            <Link
              href="/dashboard/reportes"
              className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <BarChart2 className="size-5" />
              <span className="text-[10px] font-medium">Reportes</span>
            </Link>
          )}
          {hasPermission(session.user, "gestionar_campanas") && (
            <Link
              href="/dashboard/campanas"
              className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Megaphone className="size-5" />
              <span className="text-[10px] font-medium">Campañas</span>
            </Link>
          )}
          <Link
            href="/dashboard/conexion"
            className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Wifi className="size-5" />
            <span className="text-[10px] font-medium">Conexión</span>
          </Link>
          {hasPermission(session.user, "gestionar_contactos") && (
            <Link
              href="/dashboard/configuracion"
              className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings className="size-5" />
              <span className="text-[10px] font-medium">Config.</span>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
