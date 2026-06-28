"use client";

import { useState } from "react";

type LogData = {
  id: string;
  canal: string;
  uidUsuario: string;
  mensajeEnviado: string | null;
  razonIA: string | null;
  contactNombre: string | null;
  businessNombre: string;
  stageNombre: string | null;
};

const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
};

export function ApproveForm({ log }: { log: LogData }) {
  const [mensaje, setMensaje] = useState(log.mensajeEnviado ?? "");
  const [status, setStatus] = useState<"idle" | "sending" | "done_approve" | "done_discard" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleAction(action: "approve" | "discard") {
    setStatus("sending");
    try {
      const res = await fetch("/api/follow-up/approve-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logId: log.id,
          action,
          mensaje: action === "approve" ? mensaje : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setStatus(action === "approve" ? "done_approve" : "done_discard");
      } else if (res.status === 409) {
        setStatus("error");
        setErrorMsg("Esta sugerencia ya fue procesada anteriormente.");
      } else {
        setStatus("error");
        setErrorMsg(data.error ?? "Ocurrió un error inesperado.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("No se pudo conectar con el servidor.");
    }
  }

  if (status === "done_approve") {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#111827" }}>
            Mensaje enviado
          </h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            El mensaje fue enviado a <strong>{log.contactNombre ?? log.uidUsuario}</strong> correctamente.
          </p>
        </div>
      </Card>
    );
  }

  if (status === "done_discard") {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✓</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#111827" }}>
            Sugerencia descartada
          </h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            La sugerencia fue descartada correctamente.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {/* Info del contacto */}
      <table cellPadding={0} cellSpacing={0} style={{ width: "100%", marginBottom: 20, border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
        <tbody>
          <tr style={{ background: "#f3f4f6" }}>
            <td style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em" }}>Campo</td>
            <td style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em" }}>Detalle</td>
          </tr>
          <tr>
            <td style={{ padding: "8px 12px", fontSize: 13, color: "#374151" }}>Contacto</td>
            <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#111827" }}>{log.contactNombre ?? log.uidUsuario}</td>
          </tr>
          <tr style={{ background: "#f9fafb" }}>
            <td style={{ padding: "8px 12px", fontSize: 13, color: "#374151" }}>Canal</td>
            <td style={{ padding: "8px 12px", fontSize: 13, color: "#111827" }}>{CANAL_LABEL[log.canal] ?? log.canal}</td>
          </tr>
          {log.stageNombre && (
            <tr>
              <td style={{ padding: "8px 12px", fontSize: 13, color: "#374151" }}>Etapa</td>
              <td style={{ padding: "8px 12px", fontSize: 13, color: "#111827" }}>{log.stageNombre}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Análisis IA */}
      {log.razonIA && (
        <>
          <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#374151" }}>
            Análisis de la IA:
          </p>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "#374151", fontStyle: "italic" }}>
            &ldquo;{log.razonIA}&rdquo;
          </p>
        </>
      )}

      {/* Mensaje editable */}
      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#374151" }}>
        Mensaje generado por IA (editable):
      </p>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6366f1" }}>
        ✨ Este mensaje fue generado por IA basándose en la conversación. Puedes editarlo antes de enviarlo.
      </p>
      <textarea
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        rows={5}
        disabled={status === "sending"}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "12px",
          fontSize: 14,
          border: "1px solid #d1d5db",
          borderRadius: 6,
          resize: "vertical",
          fontFamily: "sans-serif",
          color: "#111827",
          background: "#fff",
          marginBottom: 24,
          outline: "none",
        }}
      />

      {/* Error */}
      {status === "error" && (
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#dc2626" }}>
          {errorMsg}
        </p>
      )}

      {/* Botones */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <button
          onClick={() => handleAction("approve")}
          disabled={status === "sending" || !mensaje.trim()}
          style={{
            padding: "14px 16px",
            background: status === "sending" ? "#86efac" : "#16a34a",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 700,
            cursor: status === "sending" || !mensaje.trim() ? "not-allowed" : "pointer",
            transition: "background .15s",
          }}
        >
          {status === "sending" ? "Enviando..." : "✓ Enviar"}
        </button>
        <button
          onClick={() => handleAction("discard")}
          disabled={status === "sending"}
          style={{
            padding: "14px 16px",
            background: "#f3f4f6",
            color: "#374151",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 600,
            cursor: status === "sending" ? "not-allowed" : "pointer",
          }}
        >
          ✗ Descartar
        </button>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      padding: "28px",
      maxWidth: 560,
      width: "100%",
      boxShadow: "0 1px 4px rgba(0,0,0,.06)",
    }}>
      {children}
    </div>
  );
}
