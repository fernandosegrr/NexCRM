"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarNav } from "@/components/admin/sidebar-nav";
import { UserMenu } from "@/components/admin/user-menu";

export function AdminShell({
  nombre,
  email,
  incidentCount = 0,
  overduePaymentsCount = 0,
  openBugsCount = 0,
  children,
}: {
  nombre: string;
  email?: string | null;
  incidentCount?: number;
  overduePaymentsCount?: number;
  openBugsCount?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Sidebar de escritorio */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card/30 md:flex">
        <div className="flex h-16 items-center px-6">
          <Logo imageClassName="h-12" />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto pb-4">
          <SidebarNav
            incidentCount={incidentCount}
            overduePaymentsCount={overduePaymentsCount}
            openBugsCount={openBugsCount}
          />
        </div>
        <div className="border-t border-border p-4 text-xs text-muted-foreground">
          Panel de administración
        </div>
      </aside>

      {/* Drawer de navegación (móvil) */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <div className="flex h-16 items-center px-6">
            <Logo imageClassName="h-12" />
          </div>
          <div className="mt-2">
            <SidebarNav
              onNavigate={() => setOpen(false)}
              incidentCount={incidentCount}
              overduePaymentsCount={overduePaymentsCount}
              openBugsCount={openBugsCount}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Contenido */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </Button>
          <div className="md:hidden">
            <Logo showText={false} />
          </div>
          <div className="flex-1" />
          <UserMenu nombre={nombre} email={email} />
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
