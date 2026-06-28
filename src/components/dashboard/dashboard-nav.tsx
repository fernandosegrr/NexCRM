"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Bug,
  LayoutGrid,
  LogOut,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Wifi,
} from "lucide-react";

import { doSignOut } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BugReportDialog } from "./bug-report-button";

const ACTIVE = "text-[#6366F1]";

export type NavPermisos = {
  embudo: boolean;
  reportes: boolean;
  campanas: boolean;
  config: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof MessageCircle;
  show: boolean;
  exact?: boolean;
};

function buildItems(permisos: NavPermisos): NavItem[] {
  return [
    { href: "/dashboard", label: "Chats", icon: MessageCircle, show: true, exact: true },
    { href: "/dashboard/embudo", label: "Embudo", icon: LayoutGrid, show: permisos.embudo },
    { href: "/dashboard/campanas", label: "Campañas", icon: Megaphone, show: permisos.campanas },
    { href: "/dashboard/reportes", label: "Reportes", icon: BarChart2, show: permisos.reportes },
    { href: "/dashboard/conexion", label: "Conexión", icon: Wifi, show: true },
  ];
}

function isActive(pathname: string, item: Pick<NavItem, "href" | "exact">): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** Navegación del header — solo desktop (hidden sm:flex). */
export function DashboardDesktopNav({ permisos }: { permisos: NavPermisos }) {
  const pathname = usePathname();
  const [bugOpen, setBugOpen] = useState(false);
  const items = buildItems(permisos).filter((i) => i.show);

  return (
    <div className="hidden items-center gap-1 sm:flex">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground",
              active ? ACTIVE : "text-muted-foreground",
            )}
          >
            <item.icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button
        onClick={() => setBugOpen(true)}
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Reportar un problema"
        aria-label="Reportar un problema"
      >
        <Bug className="size-4" />
      </button>
      <BugReportDialog open={bugOpen} onOpenChange={setBugOpen} />
    </div>
  );
}

/**
 * Bottom nav móvil (sm:hidden): Chats, Embudo, Campañas, Reportes y un menú
 * "Más" que abre un Sheet con Conexión, Configuración, Reportar bug y Cerrar
 * sesión. Active state en violeta (#6366F1).
 */
export function DashboardMobileNav({ permisos }: { permisos: NavPermisos }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);

  const primary = buildItems(permisos).filter(
    (i) =>
      i.show &&
      ["/dashboard", "/dashboard/embudo", "/dashboard/campanas", "/dashboard/reportes"].includes(
        i.href,
      ),
  );

  // El menú "Más" está activo cuando estamos en una de sus rutas internas.
  const moreActive = pathname.startsWith("/dashboard/conexion");

  return (
    <>
      <nav className="relative z-50 flex h-14 shrink-0 items-center justify-around border-t bg-background/95 px-1 backdrop-blur-md sm:hidden">
        {primary.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors",
                active ? ACTIVE : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger
            className={cn(
              "flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors",
              moreActive ? ACTIVE : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="Más opciones"
          >
            <MoreHorizontal className="size-5" />
            <span className="text-[10px] font-medium">Más</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[max(16px,env(safe-area-inset-bottom))]">
            <SheetHeader className="border-0 p-4 pb-2 text-left">
              <SheetTitle>Más opciones</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1 p-2">
              <SheetClose asChild>
                <Link
                  href="/dashboard/conexion"
                  className={cn(
                    "flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-accent",
                    pathname.startsWith("/dashboard/conexion") ? ACTIVE : "text-foreground",
                  )}
                >
                  <Wifi className="size-5 shrink-0" /> Conexión
                </Link>
              </SheetClose>
              <button
                onClick={() => {
                  setMoreOpen(false);
                  setBugOpen(true);
                }}
                className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <span className="text-base leading-none">🐛</span> Reportar un problema
              </button>
              <form action={doSignOut}>
                <button
                  type="submit"
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut className="size-5 shrink-0" /> Cerrar sesión
                </button>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      <BugReportDialog open={bugOpen} onOpenChange={setBugOpen} />
    </>
  );
}
