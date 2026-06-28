import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { Conversations } from "@/components/dashboard/conversations";
import { AccessDenied } from "@/components/dashboard/access-denied";

export const metadata: Metadata = { title: "Conversaciones" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.rol === "ADMIN") redirect("/admin");

  if (!session.user.businessId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Inbox className="size-7" />
          </div>
          <h2 className="text-lg font-semibold">Sin negocio asignado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu cuenta todavía no está vinculada a un negocio. Pide a un
            administrador de NexAI que te asigne uno.
          </p>
        </div>
      </div>
    );
  }

  if (!hasPermission(session.user, "ver_conversaciones")) {
    return <AccessDenied mensaje="No tienes acceso a las conversaciones." />;
  }

  return <Conversations />;
}
