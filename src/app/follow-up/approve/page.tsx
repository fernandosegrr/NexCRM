import { prisma } from "@/lib/prisma";
import { ApproveForm } from "./approve-form";

export const dynamic = "force-dynamic";

function StatusPage({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <main style={{ margin: 0, padding: 0, background: "#f9fafb", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "40px 48px", maxWidth: 460, width: "90%", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>{icon}</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>{title}</h1>
        <p style={{ fontSize: 15, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>{body}</p>
      </div>
    </main>
  );
}

export default async function ApprovePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const logId = typeof searchParams.logId === "string" ? searchParams.logId : undefined;
  if (!logId) {
    return <StatusPage icon="⚠️" title="Enlace inválido" body="No se encontró el identificador de la sugerencia." />;
  }

  const log = await prisma.followUpLog.findUnique({
    where: { id: logId },
    select: {
      id: true,
      businessId: true,
      stageId: true,
      canal: true,
      uidUsuario: true,
      mensajeEnviado: true,
      razonIA: true,
      aprobado: true,
      contact: { select: { nombre: true } },
    },
  });

  if (!log) {
    return <StatusPage icon="⚠️" title="No encontrado" body="No se encontró la sugerencia. Es posible que el enlace haya expirado o sea incorrecto." />;
  }

  if (log.aprobado !== null) {
    return <StatusPage icon="ℹ️" title="Ya procesada" body="Esta sugerencia ya fue aprobada o descartada anteriormente." />;
  }

  const [business, stage] = await Promise.all([
    prisma.business.findUnique({ where: { id: log.businessId }, select: { nombre: true } }),
    prisma.funnelStage.findUnique({ where: { id: log.stageId }, select: { nombre: true } }),
  ]);

  const logData = {
    id: log.id,
    canal: log.canal,
    uidUsuario: log.uidUsuario,
    mensajeEnviado: log.mensajeEnviado,
    razonIA: log.razonIA,
    contactNombre: log.contact?.nombre ?? null,
    businessNombre: business?.nombre ?? "",
    stageNombre: stage?.nombre ?? null,
  };

  return (
    <main style={{ margin: 0, padding: "32px 16px", background: "#f9fafb", fontFamily: "sans-serif", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Header */}
      <div style={{ maxWidth: 560, width: "100%", marginBottom: 20 }}>
        <div style={{ background: "#6366f1", borderRadius: "10px 10px 0 0", padding: "20px 28px" }}>
          <p style={{ margin: 0, color: "#fff", fontSize: 18, fontWeight: 700 }}>💬 Seguimiento sugerido</p>
          <p style={{ margin: "4px 0 0", color: "#e0e7ff", fontSize: 13 }}>
            {logData.businessNombre}
            {logData.stageNombre ? ` · Etapa: ${logData.stageNombre}` : ""}
          </p>
        </div>
        <div style={{ background: "#fff", borderRadius: "0 0 10px 10px", border: "1px solid #e5e7eb", borderTop: "none", padding: "4px 28px 12px", marginBottom: -16 }}>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af" }}>
            Revisa y edita el mensaje antes de enviarlo o descártalo si no corresponde.
          </p>
        </div>
      </div>

      <ApproveForm log={logData} />

      <p style={{ marginTop: 24, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
        NexAI CRM · Este enlace es de un solo uso
      </p>
    </main>
  );
}
