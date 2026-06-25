"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, MessageSquare, Store, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/negocios", label: "Negocios", icon: Store },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/mensajes", label: "Mensajes", icon: MessageSquare },
  { href: "/admin/auditoria", label: "Auditoría", icon: ClipboardList },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {ADMIN_NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
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
          </Link>
        );
      })}
    </nav>
  );
}
