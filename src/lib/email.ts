import { Resend } from "resend";

export async function sendAlertEmail({
  subject,
  html,
}: {
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[sendAlertEmail] RESEND_API_KEY no configurada, email omitido.");
    return false;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "alertas@nexaisolutions.dev",
      to: process.env.NEXAI_ALERT_EMAIL ?? "",
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error("[sendAlertEmail] Error enviando email:", err);
    return false;
  }
}

function formatMexDate(d: Date): string {
  return d.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function buildAlertHtml({
  businessNombre,
  instanciaId,
  stuckUids,
  detectedAt,
  appUrl,
}: {
  businessNombre: string;
  instanciaId: string;
  stuckUids: string[];
  detectedAt: Date;
  appUrl: string;
}): string {
  const uidRows = stuckUids
    .map(
      (uid) =>
        `<tr><td style="padding:4px 8px;font-family:monospace;font-size:13px;color:#374151;">${uid}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
  <!-- Header -->
  <tr>
    <td style="background:#dc2626;padding:20px 28px;">
      <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">⚠️ NexAI CRM — Alerta de caída</p>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:28px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111827;">
        Se detectaron <strong>${stuckUids.length} contacto(s) con bot activo</strong> sin respuesta en
        <strong>${businessNombre}</strong>.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <tr style="background:#f3f4f6;">
          <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Campo</td>
          <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Valor</td>
        </tr>
        <tr><td style="padding:8px 12px;font-size:13px;color:#374151;">Negocio</td><td style="padding:8px 12px;font-size:13px;color:#111827;font-weight:600;">${businessNombre}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-size:13px;color:#374151;">Instancia</td><td style="padding:8px 12px;font-size:13px;font-family:monospace;color:#111827;">${instanciaId}</td></tr>
        <tr><td style="padding:8px 12px;font-size:13px;color:#374151;">Detectado</td><td style="padding:8px 12px;font-size:13px;color:#111827;">${formatMexDate(detectedAt)}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-size:13px;color:#374151;">Contactos /on sin respuesta</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#dc2626;">${stuckUids.length}</td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Contactos afectados:</p>
      <table cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:4px;padding:4px 0;margin-bottom:24px;">
        ${uidRows}
      </table>
      <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">
        Iniciando diagnóstico y auto-recuperación&hellip;
        Recibirás un segundo email con el resultado.
      </p>
      <a href="${appUrl}/admin/estado" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
        Ver en CRM →
      </a>
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        NexAI — Soporte Técnico · Irapuato, Guanajuato · ${formatMexDate(new Date())}
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildFollowUpHtml({
  businessNombre,
  instanciaId,
  connectionStatus,
  reconnectResult,
  detectedAt,
  resolvedAt,
  appUrl,
}: {
  businessNombre: string;
  instanciaId: string;
  connectionStatus: string;
  reconnectResult: "exitosa" | "fallida" | "conectada_sin_respuesta";
  detectedAt: Date;
  resolvedAt?: Date;
  appUrl: string;
}): string {
  const isOk = reconnectResult === "exitosa";
  const isConnectedNoResponse = reconnectResult === "conectada_sin_respuesta";

  const headerColor = isOk ? "#16a34a" : "#dc2626";
  const headerText = isOk
    ? "✅ Auto-recuperación exitosa"
    : isConnectedNoResponse
      ? "⚠️ Instancia conectada — revisar flujo n8n"
      : "🔴 Auto-recuperación fallida — REQUIERE ATENCIÓN";

  const bodyText = isOk
    ? `La instancia <strong>${instanciaId}</strong> se reconectó automáticamente.`
    : isConnectedNoResponse
      ? `La instancia <strong>${instanciaId}</strong> reporta estado <code>open</code> en Evolution API pero el bot no está respondiendo. Posible falla en el flujo de n8n.`
      : `La reconexión automática de <strong>${instanciaId}</strong> falló. Es necesaria una intervención manual.`;

  const durationStr =
    resolvedAt
      ? (() => {
          const ms = resolvedAt.getTime() - detectedAt.getTime();
          const mins = Math.round(ms / 60000);
          return mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h ${mins % 60} min`;
        })()
      : null;

  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr>
    <td style="background:${headerColor};padding:20px 28px;">
      <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${headerText}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111827;">${bodyText}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <tr style="background:#f3f4f6;">
          <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Campo</td>
          <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Valor</td>
        </tr>
        <tr><td style="padding:8px 12px;font-size:13px;color:#374151;">Negocio</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#111827;">${businessNombre}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-size:13px;color:#374151;">Instancia</td><td style="padding:8px 12px;font-size:13px;font-family:monospace;color:#111827;">${instanciaId}</td></tr>
        <tr><td style="padding:8px 12px;font-size:13px;color:#374151;">Estado Evolution</td><td style="padding:8px 12px;font-size:13px;color:#111827;">${connectionStatus}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-size:13px;color:#374151;">Caída detectada</td><td style="padding:8px 12px;font-size:13px;color:#111827;">${formatMexDate(detectedAt)}</td></tr>
        ${resolvedAt ? `<tr><td style="padding:8px 12px;font-size:13px;color:#374151;">Recuperada</td><td style="padding:8px 12px;font-size:13px;color:#111827;">${formatMexDate(resolvedAt)}</td></tr>` : ""}
        ${durationStr ? `<tr style="background:#f9fafb;"><td style="padding:8px 12px;font-size:13px;color:#374151;">Duración de caída</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#111827;">${durationStr}</td></tr>` : ""}
      </table>
      <a href="${appUrl}/admin/estado" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
        Ver en CRM →
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        NexAI — Soporte Técnico · Irapuato, Guanajuato · ${formatMexDate(new Date())}
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
