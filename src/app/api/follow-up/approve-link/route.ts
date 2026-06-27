import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { n8nPool } from "@/lib/n8n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";
const APP_URL =
  process.env.APP_URL ??
  process.env.NEXTAUTH_URL ??
  "https://postgres-nexcrm.d6cr6o.easypanel.host";

function htmlPage(
  icon: string,
  title: string,
  body: string,
  color = "#6366f1",
): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — NexAI CRM</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;padding:0;background:#f9fafb;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:40px 48px;max-width:460px;width:90%;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)}
    .icon{font-size:52px;margin-bottom:16px}
    h1{font-size:22px;font-weight:700;color:#111827;margin:0 0 12px}
    p{font-size:15px;color:#6b7280;margin:0 0 24px;line-height:1.5}
    a{display:inline-block;background:${color};color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${body}</p>
    <a href="${APP_URL}/dashboard">Ir al CRM &rarr;</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function sendWhatsApp(instanciaId: string, uidUsuario: string, text: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(instanciaId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ number: `${uidUsuario}@s.whatsapp.net`, text }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timer);
    if (!r.ok) throw new Error(`Evolution API ${r.status}`);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function sendMeta(pageId: string, token: string, uidUsuario: string, text: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        recipient: { id: uidUsuario },
        message: { text },
        messaging_type: "RESPONSE",
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`Meta API ${r.status}`);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function insertBotMemory(tablaMemoria: string, uidUsuario: string, canal: string, text: string): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(tablaMemoria)) return;
  const sessionId = canal === "whatsapp" ? `${uidUsuario}@s.whatsapp.net` : uidUsuario;
  await n8nPool.query(
    `INSERT INTO "${tablaMemoria}" (session_id, message) VALUES ($1, $2)`,
    [sessionId, JSON.stringify({ type: "ai", content: text })],
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const logId = searchParams.get("logId");
  const action = searchParams.get("action");

  if (!logId || (action !== "approve" && action !== "discard")) {
    return htmlPage("⚠️", "Enlace inválido", "Los parámetros del enlace son incorrectos.", "#dc2626");
  }

  const log = await prisma.followUpLog.findUnique({
    where: { id: logId },
    select: {
      id: true,
      businessId: true,
      stageId: true,
      canal: true,
      uidUsuario: true,
      instanciaId: true,
      mensajeEnviado: true,
      aprobado: true,
      contact: { select: { nombre: true } },
    },
  });

  if (!log) {
    return htmlPage("⚠️", "Enlace inválido", "No se encontró la sugerencia.", "#dc2626");
  }

  if (log.aprobado !== null) {
    return htmlPage("ℹ️", "Ya procesada", "Esta sugerencia ya fue procesada anteriormente.", "#6b7280");
  }

  if (action === "discard") {
    await prisma.followUpLog.update({ where: { id: logId }, data: { aprobado: false } });
    return htmlPage("✓", "Sugerencia descartada", "La sugerencia fue descartada correctamente.");
  }

  // action === "approve"
  if (!log.mensajeEnviado) {
    return htmlPage("⚠️", "Error", "No hay mensaje configurado para enviar.", "#dc2626");
  }

  try {
    if (log.canal === "whatsapp") {
      await sendWhatsApp(log.instanciaId, log.uidUsuario, log.mensajeEnviado);
    } else {
      const inst = await prisma.businessInstance.findFirst({
        where: { instanciaId: log.instanciaId, canal: log.canal },
        select: { metaPageId: true, metaPageAccessToken: true },
      });
      if (!inst?.metaPageAccessToken || !inst.metaPageId) {
        return htmlPage("⚠️", "Error", "Sin token Meta configurado. Configúralo desde el panel.", "#dc2626");
      }
      await sendMeta(inst.metaPageId, inst.metaPageAccessToken, log.uidUsuario, log.mensajeEnviado);
    }
  } catch (e) {
    console.error("[approve-link] Error al enviar:", e);
    return htmlPage("⚠️", "Error al enviar", "Ocurrió un error al enviar el mensaje. Intenta de nuevo o apruébalo desde el CRM.", "#dc2626");
  }

  const [business, stage] = await Promise.all([
    prisma.business.findUnique({ where: { id: log.businessId }, select: { nombre: true, tablaMemoria: true } }),
    prisma.funnelStage.findUnique({ where: { id: log.stageId }, select: { nombre: true } }),
  ]);

  if (business?.tablaMemoria) {
    try {
      await insertBotMemory(business.tablaMemoria, log.uidUsuario, log.canal, log.mensajeEnviado);
    } catch {
      // skip silencioso
    }
  }

  await prisma.message.create({
    data: {
      instanciaId: log.instanciaId,
      businessId: log.businessId,
      nombreNegocio: business?.nombre ?? "",
      canal: log.canal,
      uidUsuario: log.uidUsuario,
      rol: "bot",
      contenido: log.mensajeEnviado,
      tipoMedia: "text",
      metadata: {
        fuente: "seguimiento-automatico",
        etapa: stage?.nombre ?? "",
        modoEnvio: "manual-aprobado-email",
      },
    },
  });

  await prisma.followUpLog.update({ where: { id: logId }, data: { aprobado: true } });

  const contactName = log.contact?.nombre ?? log.uidUsuario;
  return htmlPage(
    "✅",
    "Mensaje enviado",
    `El mensaje fue enviado a <strong>${contactName}</strong> correctamente.`,
    "#16a34a",
  );
}
