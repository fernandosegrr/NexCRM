import { Resend } from "resend";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[sendEmail] RESEND_API_KEY no configurada, email omitido.");
    return false;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "info@nexaisolutions.dev",
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error("[sendEmail] Error:", err);
    return false;
  }
}

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

export function buildClientDisconnectHtml({
  businessNombre,
  appUrl,
}: {
  businessNombre: string;
  appUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr>
    <td style="background:#f59e0b;padding:20px 28px;">
      <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">⚠️ Tu asistente virtual se desconectó</p>
      <p style="margin:4px 0 0;color:#fef3c7;font-size:14px;">${businessNombre}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6;">
        Tu asistente virtual dejó de responder porque la sesión de WhatsApp se cerró.
        Esto puede pasar por <strong>actualizaciones de WhatsApp</strong> o <strong>inactividad prolongada</strong>.
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
        Mientras tanto, los mensajes que lleguen <strong>no serán respondidos automáticamente</strong>.
      </p>

      <div style="margin:24px 0;padding:20px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#0c4a6e;">Opción 1 — Reconecta tú mismo (rápido)</p>
        <p style="margin:0 0 12px;font-size:13px;color:#374151;">
          Entra a tu panel NexAI y genera el código QR para reconectar WhatsApp.
        </p>
        <a href="${appUrl}/dashboard/conexion" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
          Reconectar ahora →
        </a>
      </div>

      <div style="margin:0 0 24px;padding:20px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Opción 2 — Solicitar asistencia a NexAI</p>
        <p style="margin:0 0 12px;font-size:13px;color:#374151;">
          Nuestro equipo puede ayudarte a reconectar el asistente.
        </p>
        <a href="mailto:soporte@nexaisolutions.dev?subject=Necesito%20ayuda%20con%20${encodeURIComponent(businessNombre)}&body=Hola%2C%20mi%20asistente%20se%20desconect%C3%B3.%20Por%20favor%20ay%C3%BAdame%20a%20reconectarlo." style="display:inline-block;background:#6b7280;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
          Solicitar soporte
        </a>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        NexAI &middot; Irapuato, Guanajuato &middot; <a href="${appUrl}/dashboard" style="color:#9ca3af;">Ver mi panel</a>
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildBugReportHtml({
  tipo,
  descripcion,
  url,
  nombre,
  email,
  negocio,
  fechaMex,
}: {
  tipo: string;
  descripcion: string;
  url: string;
  nombre: string;
  email: string;
  negocio: string;
  fechaMex: string;
}): string {
  const tipoLabel =
    tipo === "bug" ? "🐛 Bug" : tipo === "sugerencia" ? "💡 Sugerencia" : "❓ Pregunta";
  const tipoColor =
    tipo === "bug" ? "#dc2626" : tipo === "sugerencia" ? "#2563eb" : "#6b7280";

  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr>
    <td style="background:${tipoColor};padding:16px 28px;">
      <p style="margin:0;color:#ffffff;font-size:16px;font-weight:700;">${tipoLabel} — Reporte de usuario</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px;">
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <tr style="background:#f3f4f6;">
          <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Campo</td>
          <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">Detalle</td>
        </tr>
        <tr><td style="padding:8px 12px;font-size:13px;color:#374151;">Negocio</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#111827;">${negocio}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-size:13px;color:#374151;">Usuario</td><td style="padding:8px 12px;font-size:13px;color:#111827;">${nombre} (${email})</td></tr>
        <tr><td style="padding:8px 12px;font-size:13px;color:#374151;">URL</td><td style="padding:8px 12px;font-size:13px;font-family:monospace;font-size:11px;color:#374151;word-break:break-all;">${url}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-size:13px;color:#374151;">Fecha</td><td style="padding:8px 12px;font-size:13px;color:#111827;">${fechaMex}</td></tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Descripción:</p>
      <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin-bottom:0;">
        <p style="margin:0;font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap;">${descripcion}</p>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">NexAI CRM &middot; Soporte interno</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildWeeklySummaryHtml({
  businessNombre,
  fechaInicio,
  fechaFin,
  metricas,
  etapas,
  appUrl,
  ai,
}: {
  businessNombre: string;
  fechaInicio: string;
  fechaFin: string;
  metricas: {
    mensajesRecibidos: number;
    varMensajes: number;
    contactosNuevos: number;
    varContactos: number;
    tiempoPromedioRespuesta: number;
    seguimientosEnviados: number;
    tasaRespuesta: number;
  };
  etapas: Array<{ nombre: string; color: string; count: number }>;
  appUrl: string;
  ai?: {
    temasFrecuentes: Array<{ tema: string; porcentaje: number; descripcion: string }>;
    rendimientoBot: string;
    oportunidades: string[];
    preguntasSinResponder: string[];
  } | null;
}): string {
  const varMsjSign = metricas.varMensajes >= 0 ? "+" : "";
  const varCntSign = metricas.varContactos >= 0 ? "+" : "";
  const tiempoMin = Math.round(metricas.tiempoPromedioRespuesta / 60);

  const etapasHtml = etapas
    .map(
      (e) =>
        `<tr>
          <td style="padding:6px 12px;font-size:13px;color:#374151;">${e.nombre}</td>
          <td style="padding:6px 12px;">
            <div style="background:#e5e7eb;border-radius:4px;height:12px;position:relative;">
              <div style="background:${e.color};border-radius:4px;height:12px;width:${Math.min(100, e.count * 5)}%;"></div>
            </div>
          </td>
          <td style="padding:6px 12px;font-size:13px;font-weight:600;color:#111827;text-align:right;">${e.count}</td>
        </tr>`,
    )
    .join("");

  const aiHtml = ai
    ? `
  <tr>
    <td style="padding:28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#111827;">🧠 Inteligencia de la semana</p>

      ${ai.temasFrecuentes.length > 0 ? `
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Temas más frecuentes</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
        ${ai.temasFrecuentes.map((t) => `
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#111827;">${t.tema}</td>
          <td style="padding:4px 0;text-align:right;font-size:12px;color:#6b7280;">${t.porcentaje}%</td>
        </tr>
        <tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#6b7280;font-style:italic;">${t.descripcion}</td></tr>
        `).join("")}
      </table>
      ` : ""}

      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Rendimiento del bot</p>
      <p style="margin:0 0 20px;font-size:13px;color:#374151;line-height:1.6;">${ai.rendimientoBot}</p>

      ${ai.preguntasSinResponder.length > 0 ? `
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#b45309;">⚠️ Preguntas que el bot no supo responder bien</p>
      <ul style="margin:0 0 20px;padding-left:20px;">
        ${ai.preguntasSinResponder.map((p) => `<li style="font-size:13px;color:#374151;margin-bottom:4px;">${p}</li>`).join("")}
      </ul>
      ` : ""}

      ${ai.oportunidades.length > 0 ? `
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#166534;">💡 Oportunidades detectadas</p>
      <ul style="margin:0;padding-left:20px;">
        ${ai.oportunidades.map((o) => `<li style="font-size:13px;color:#374151;margin-bottom:4px;">${o}</li>`).join("")}
      </ul>
      ` : ""}
    </td>
  </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
  <!-- Header -->
  <tr>
    <td style="background:#6366f1;padding:24px 28px;">
      <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">📊 Resumen semanal</p>
      <p style="margin:4px 0 0;color:#c7d2fe;font-size:14px;">${businessNombre} · ${fechaInicio} al ${fechaFin}</p>
    </td>
  </tr>
  <!-- Métricas -->
  <tr>
    <td style="padding:28px;">
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
        <tr>
          <td width="50%" style="padding-right:8px;">
            <div style="background:#f0f9ff;border-radius:8px;padding:16px;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#0c4a6e;">${metricas.mensajesRecibidos}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Mensajes recibidos</p>
              <p style="margin:4px 0 0;font-size:11px;color:${metricas.varMensajes >= 0 ? "#16a34a" : "#dc2626"};">${varMsjSign}${metricas.varMensajes}% vs semana anterior</p>
            </div>
          </td>
          <td width="50%" style="padding-left:8px;">
            <div style="background:#f0fdf4;border-radius:8px;padding:16px;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#14532d;">${metricas.contactosNuevos}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Contactos nuevos</p>
              <p style="margin:4px 0 0;font-size:11px;color:${metricas.varContactos >= 0 ? "#16a34a" : "#dc2626"};">${varCntSign}${metricas.varContactos}% vs semana anterior</p>
            </div>
          </td>
        </tr>
        <tr style="height:8px;"></tr>
        <tr>
          <td width="50%" style="padding-right:8px;">
            <div style="background:#fefce8;border-radius:8px;padding:16px;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#713f12;">${tiempoMin} min</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Tiempo promedio de respuesta</p>
            </div>
          </td>
          <td width="50%" style="padding-left:8px;">
            <div style="background:#fdf4ff;border-radius:8px;padding:16px;">
              <p style="margin:0;font-size:24px;font-weight:700;color:#581c87;">${metricas.seguimientosEnviados}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Seguimientos enviados</p>
              <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Tasa de respuesta: ${metricas.tasaRespuesta}%</p>
            </div>
          </td>
        </tr>
      </table>

      <!-- Embudo -->
      ${etapas.length > 0 ? `
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Estado del embudo</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        ${etapasHtml}
      </table>
      ` : ""}

      <!-- CTA -->
      <div style="text-align:center;margin-top:8px;">
        <a href="${appUrl}/dashboard/reportes" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">
          Ver reporte completo →
        </a>
      </div>
    </td>
  </tr>
  ${aiHtml}
  <!-- Footer -->
  <tr>
    <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        NexAI &middot; Irapuato, Guanajuato &middot; <a href="${appUrl}/dashboard" style="color:#9ca3af;">Panel</a>
      </p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildSuggestionHtml({
  businessNombre,
  stageName,
  contactName,
  canal,
  minutesSinRespuesta,
  razonIA,
  mensajeEnviado,
  logId,
  appUrl,
}: {
  businessNombre: string;
  stageName: string;
  contactName: string;
  canal: string;
  minutesSinRespuesta: number;
  razonIA: string;
  mensajeEnviado: string;
  logId: string;
  appUrl: string;
}): string {
  const approveUrl = `${appUrl}/api/follow-up/approve-link?logId=${encodeURIComponent(logId)}&action=approve`;
  const discardUrl = `${appUrl}/api/follow-up/approve-link?logId=${encodeURIComponent(logId)}&action=discard`;

  const canalLabel =
    canal === "whatsapp" ? "📱 WhatsApp" : canal === "instagram" ? "📸 Instagram" : "💬 Messenger";

  const tiempoStr =
    minutesSinRespuesta < 60
      ? `${minutesSinRespuesta} minutos`
      : minutesSinRespuesta < 120
        ? "1 hora"
        : `${Math.round(minutesSinRespuesta / 60)} horas`;

  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
  <tr>
    <td style="background:#6366f1;padding:20px 28px;">
      <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">💬 Seguimiento sugerido</p>
      <p style="margin:4px 0 0;color:#e0e7ff;font-size:14px;">${businessNombre} &middot; Etapa: ${stageName}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px;">
      <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
        <tr style="background:#f3f4f6;">
          <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Campo</td>
          <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Detalle</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#374151;">Contacto</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#111827;">${contactName}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:8px 12px;font-size:13px;color:#374151;">Canal</td>
          <td style="padding:8px 12px;font-size:13px;color:#111827;">${canalLabel}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#374151;">Sin respuesta</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#d97706;">Hace ${tiempoStr}</td>
        </tr>
      </table>

      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">An&aacute;lisis de la IA:</p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;font-style:italic;">&ldquo;${razonIA}&rdquo;</p>

      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Mensaje que se enviar&iacute;a:</p>
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:16px;margin-bottom:28px;">
        <p style="margin:0;font-size:15px;color:#0c4a6e;line-height:1.5;">${mensajeEnviado}</p>
      </div>

      <table cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td style="padding-right:8px;" width="50%">
            <a href="${approveUrl}" style="display:block;text-align:center;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 20px;border-radius:6px;font-size:15px;font-weight:700;">
              &#10003; Aprobar y enviar
            </a>
          </td>
          <td style="padding-left:8px;" width="50%">
            <a href="${discardUrl}" style="display:block;text-align:center;background:#f3f4f6;color:#374151;text-decoration:none;padding:14px 20px;border-radius:6px;font-size:15px;font-weight:600;border:1px solid #d1d5db;">
              &#10007; Descartar
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        Este link expira una vez usado. &middot; NexAI CRM &middot; ${formatMexDate(new Date())}
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
