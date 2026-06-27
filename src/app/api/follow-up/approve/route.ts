import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { n8nPool } from "@/lib/n8n";

export const dynamic = "force-dynamic";

async function sendWhatsApp(instanciaId: string, uidUsuario: string, text: string): Promise<void> {
  const url = process.env.EVOLUTION_API_URL ?? "";
  const key = process.env.EVOLUTION_API_KEY ?? "";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${url}/message/sendText/${encodeURIComponent(instanciaId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ number: `${uidUsuario}@s.whatsapp.net`, text }),
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

async function insertBotMemory(tablaMemoria: string, uidUsuario: string, canal: string, text: string): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(tablaMemoria)) return;
  const sessionId = canal === "whatsapp" ? `${uidUsuario}@s.whatsapp.net` : uidUsuario;
  await n8nPool.query(
    `INSERT INTO "${tablaMemoria}" (session_id, message) VALUES ($1, $2)`,
    [sessionId, JSON.stringify({ type: "ai", content: text })],
  );
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
      stageId: true,
      canal: true,
      uidUsuario: true,
      instanciaId: true,
      mensajeEnviado: true,
      aprobado: true,
    },
  });

  if (!log) return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
  if (log.aprobado !== null) return NextResponse.json({ error: "Ya procesada" }, { status: 409 });

  if (session.user.rol !== "ADMIN" && session.user.businessId !== log.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!log.mensajeEnviado) {
    return NextResponse.json({ error: "Sin mensaje configurado" }, { status: 422 });
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
        return NextResponse.json({ error: "Sin token Meta" }, { status: 422 });
      }
      await sendMeta(inst.metaPageId, inst.metaPageAccessToken, log.uidUsuario, log.mensajeEnviado);
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al enviar" }, { status: 502 });
  }

  const business = await prisma.business.findUnique({
    where: { id: log.businessId },
    select: { nombre: true, tablaMemoria: true },
  });

  if (business?.tablaMemoria) {
    try {
      await insertBotMemory(business.tablaMemoria, log.uidUsuario, log.canal, log.mensajeEnviado);
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

  await prisma.followUpLog.update({
    where: { id: log.id },
    data: { aprobado: true },
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
    select: { businessId: true, aprobado: true },
  });

  if (!log) return NextResponse.json({ error: "Sugerencia no encontrada" }, { status: 404 });
  if (log.aprobado !== null) return NextResponse.json({ error: "Ya procesada" }, { status: 409 });

  if (session.user.rol !== "ADMIN" && session.user.businessId !== log.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  await prisma.followUpLog.update({
    where: { id: body.followUpLogId },
    data: { aprobado: false },
  });

  return NextResponse.json({ ok: true });
}
