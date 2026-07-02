import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { insertBotMemory } from "@/lib/bot-memory";

export const dynamic = "force-dynamic";

// `destino` es el JID real (Contact.jidCompleto puede ser @lid) — nunca
// reconstruir el sufijo a mano.
async function sendWhatsApp(instanciaId: string, destino: string, text: string): Promise<void> {
  const url = process.env.EVOLUTION_API_URL ?? "";
  const key = process.env.EVOLUTION_API_KEY ?? "";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${url}/message/sendText/${encodeURIComponent(instanciaId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: destino, text }),
      signal: ctrl.signal,
    });
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

// POST: aprobar y enviar sugerencia
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json()) as { followUpLogId?: string };
  if (!body.followUpLogId) return NextResponse.json({ error: "followUpLogId requerido" }, { status: 400 });

  const log = await prisma.followUpLog.findUnique({
    where: { id: body.followUpLogId },
    select: {
      id: true,
      businessId: true,
      contactId: true,
      stageId: true,
      canal: true,
      uidUsuario: true,
      instanciaId: true,
      mensajeEnviado: true,
      aprobado: true,
      creadoAt: true,
      contact: { select: { jidCompleto: true } },
    },
  });

  if (!log) return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
  if (log.aprobado !== null) return NextResponse.json({ error: "Ya procesada" }, { status: 409 });

  if (session.user.rol !== "ADMIN" && session.user.businessId !== log.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!log.mensajeEnviado) {
    // Sin mensaje configurado: descartar todos los logs pendientes de este contacto
    await prisma.followUpLog.updateMany({
      where: { contactId: log.contactId, businessId: log.businessId, aprobado: null },
      data: { aprobado: false },
    });
    return NextResponse.json({ ok: true });
  }

  // Claim atómico: dos clicks casi simultáneos pasaban ambos el check de
  // arriba y enviaban dos veces. Solo quien logra el update procede.
  const claim = await prisma.followUpLog.updateMany({
    where: { id: log.id, aprobado: null },
    data: { aprobado: true },
  });
  if (claim.count === 0) return NextResponse.json({ error: "Ya procesada" }, { status: 409 });

  // La sugerencia pudo generarse hace días: re-verificar que siga teniendo
  // sentido antes de enviar.
  const lastUserMsg = await prisma.message.findFirst({
    where: { instanciaId: log.instanciaId, uidUsuario: log.uidUsuario, rol: "user" },
    orderBy: { enviadoAt: "desc" },
    select: { enviadoAt: true },
  });

  if (lastUserMsg && lastUserMsg.enviadoAt > log.creadoAt) {
    await prisma.followUpLog.update({ where: { id: log.id }, data: { aprobado: false } });
    return NextResponse.json(
      { error: "El contacto ya respondió después de esta sugerencia. Revisa la conversación antes de contactarlo." },
      { status: 409 },
    );
  }

  if (log.canal === "instagram" || log.canal === "messenger") {
    const hoursSince = lastUserMsg
      ? (Date.now() - lastUserMsg.enviadoAt.getTime()) / 3_600_000
      : Infinity;
    if (hoursSince > 24) {
      await prisma.followUpLog.update({ where: { id: log.id }, data: { aprobado: false } });
      return NextResponse.json(
        { error: "La ventana de 24h de Meta ya cerró para este contacto; el mensaje no puede enviarse." },
        { status: 410 },
      );
    }
  }

  try {
    if (log.canal === "whatsapp") {
      const destino = log.contact?.jidCompleto ?? `${log.uidUsuario}@s.whatsapp.net`;
      await sendWhatsApp(log.instanciaId, destino, log.mensajeEnviado);
    } else {
      const inst = await prisma.businessInstance.findFirst({
        where: { instanciaId: log.instanciaId, canal: log.canal },
        select: { metaPageId: true, metaPageAccessToken: true },
      });
      if (!inst?.metaPageAccessToken || !inst.metaPageId) {
        await prisma.followUpLog.update({ where: { id: log.id }, data: { aprobado: null } });
        return NextResponse.json({ error: "Sin token Meta" }, { status: 422 });
      }
      await sendMeta(inst.metaPageId, inst.metaPageAccessToken, log.uidUsuario, log.mensajeEnviado);
    }
  } catch (e) {
    // Liberar el claim: el envío falló, la sugerencia sigue pendiente.
    await prisma.followUpLog
      .update({ where: { id: log.id }, data: { aprobado: null } })
      .catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al enviar" }, { status: 502 });
  }

  const business = await prisma.business.findUnique({
    where: { id: log.businessId },
    select: { nombre: true, tablaMemoria: true },
  });

  if (business?.tablaMemoria) {
    try {
      await insertBotMemory(
        business.tablaMemoria,
        log.uidUsuario,
        log.canal,
        "ai",
        log.mensajeEnviado,
        log.contact?.jidCompleto,
      );
    } catch {
      // skip silencioso
    }
  }

  const stage = await prisma.funnelStage.findUnique({
    where: { id: log.stageId },
    select: { nombre: true },
  });

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
        modoEnvio: "manual-aprobado",
      },
    },
  });

  // Limpiar todos los pendientes restantes del mismo contacto
  await prisma.followUpLog.updateMany({
    where: { contactId: log.contactId, businessId: log.businessId, aprobado: null },
    data: { aprobado: false },
  });

  return NextResponse.json({ ok: true });
}

// PATCH: descartar sugerencia
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json()) as { followUpLogId?: string };
  if (!body.followUpLogId) return NextResponse.json({ error: "followUpLogId requerido" }, { status: 400 });

  const log = await prisma.followUpLog.findUnique({
    where: { id: body.followUpLogId },
    select: { businessId: true, contactId: true, aprobado: true },
  });

  if (!log) return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
  if (log.aprobado !== null) return NextResponse.json({ error: "Ya procesada" }, { status: 409 });

  if (session.user.rol !== "ADMIN" && session.user.businessId !== log.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Descartar todos los logs pendientes de este contacto (no solo el seleccionado)
  await prisma.followUpLog.updateMany({
    where: { contactId: log.contactId, businessId: log.businessId, aprobado: null },
    data: { aprobado: false },
  });

  return NextResponse.json({ ok: true });
}
