import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ConexionClient } from "./conexion-client";

export default async function ConexionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const businessId = session.user.businessId;
  if (!businessId) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Sin negocio asignado.</p>
      </div>
    );
  }

  const paymentConfig = await prisma.paymentConfig.findUnique({
    where: { businessId },
    select: { suspendido: true, activo: true },
  });

  if (paymentConfig?.suspendido) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-4xl">⛔</div>
        <h2 className="text-xl font-semibold">Servicio suspendido</h2>
        <p className="max-w-sm text-muted-foreground">
          Tu servicio está suspendido por falta de pago.
          Para reactivarlo, contáctanos directamente.
        </p>
        <a
          href="mailto:soporte@nexaisolutions.dev"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Contactar a NexAI
        </a>
      </div>
    );
  }

  return <ConexionClient />;
}
