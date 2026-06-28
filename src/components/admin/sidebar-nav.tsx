"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Store,
  Users,
  Wifi,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/negocios", label: "Negocios", icon: Store },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/mensajes", label: "Mensajes", icon: MessageSquare },
  { href: "/admin/auditoria", label: "Auditoría", icon: ClipboardList },
  { href: "/admin/estado", label: "Estado", icon: Wifi },
];

export function SidebarNav({
  onNavigate,
  incidentCount = 0,
  overduePaymentsCount = 0,
}: {
  onNavigate?: () => void;
  incidentCount?: number;
  overduePaymentsCount?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {ADMIN_NAV.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-[18px]" />
            {item.label}
            {item.href === "/admin/estado" && incidentCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {incidentCount > 99 ? "99+" : incidentCount}
              </span>
            )}
            {item.href === "/admin" && overduePaymentsCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1.5 text-[10px] font-bold text-black">
                {overduePaymentsCount > 99 ? "99+" : overduePaymentsCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
