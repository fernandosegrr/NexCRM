import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBotStatus } from "@/lib/n8n";
import {
  sendAlertEmail,
  buildAlertHtml,
  buildFollowUpHtml,
} from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";
const APP_URL =
  process.env.APP_URL ??
  process.env.NEXTAUTH_URL ??
  "https://postgres-nexcrm.d6cr6o.easypanel.host";

type InstanceResult = {
  instanciaId: string;
  negocio: string;
  tipo: string;
  resultado: string;
  contactosSinResp: number;
  estadoEvolution: string;
};

async function fetchEvolutionStatus(
  instanciaId: string,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_API_KEY },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return "unknown";
    const all = (await r.json()) as Array<{
      instance?: { instanceName?: string; status?: string; state?: string; connectionStatus?: string };
      connectionStatus?: string;
      state?: string;
    }>;
    const inst = all.find(
      (i) => i.instance?.instanceName === instanciaId,
    );
    return (
      inst?.instance?.state ??
      inst?.instance?.connectionStatus ??
      inst?.instance?.status ??
      inst?.connectionStatus ??
      inst?.state ??
      "unknown"
    );
  } catch {
    clearTimeout(timer);
    return "unknown";
  }
}

async function tryReconnect(instanciaId: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    await fetch(
      `${EVOLUTION_API_URL}/instance/connect/${encodeURIComponent(instanciaId)}`,
      {
        headers: { apikey: EVOLUTION_API_KEY },
        signal: ctrl.signal,
      },
    );
  } catch {
    /* ignore — reconnect best-effort */
  } finally {
    clearTimeout(timer);
  }
}

async function processInstance(inst: {
  instanciaId: string;
  business: { id: string; nombre: string };
}): Promise<InstanceResult | null> {
  const { instanciaId } = inst;
  const businessNombre = inst.business.nombre;
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
  const twelveMinAgo = new Date(now.getTime() - 12 * 60_000);
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);

  // PASO 2: ¿Bot respondió en los últimos 5 min? → bot operando → skip
  const recentBot = await prisma.message.findFirst({
    where: { instanciaId, rol: "bot", enviadoAt: { gte: fiveMinAgo } },
    select: { id: true },
  });
  if (recentBot) {
    // Si había un incidente abierto y el bot ya volvió a responder, lo damos
    // por recuperado (cierra el badge aunque la recuperación fuera externa).
    await prisma.incidentLog.updateMany({
      where: { instanciaId, resolvedAt: null, creadoAt: { gte: twoHoursAgo } },
      data: { resolvedAt: now, tipo: "auto-recuperada", resultado: "exitosa" },
    });
    return null;
  }

  // PASO 3: Mensajes de usuario en ventana 12–30 min atrás
  const userMsgs = await prisma.message.findMany({
    where: {
      instanciaId,
      rol: "user",
      enviadoAt: { gte: thirtyMinAgo, lte: twelveMinAgo },
    },
    select: { uidUsuario: true, enviadoAt: true },
    orderBy: { enviadoAt: "desc" },
  });

  if (userMsgs.length === 0) return null;

  // Deduplicar por uidUsuario (quedarse con el más reciente)
  const latestByUid = new Map<string, Date>();
  for (const m of userMsgs) {
    if (!latestByUid.has(m.uidUsuario)) {
      latestByUid.set(m.uidUsuario, m.enviadoAt);
    }
  }

  // Para cada uid, verificar si hay respuesta bot posterior
  const stuckUids: string[] = [];
  for (const [uid, lastUserAt] of Array.from(latestByUid.entries())) {
    const botReply = await prisma.message.findFirst({
      where: {
        instanciaId,
        uidUsuario: uid,
        rol: "bot",
        enviadoAt: { gt: lastUserAt },
      },
      select: { id: true },
    });
    if (!botReply) stuckUids.push(uid);
  }

  // Pre-filtro barato: < 3 atascados en total → no consultar ESTATUS
  if (stuckUids.length < 3) return null;

  // PASO 4: filtrar a los que tienen el bot en /on (descarta pausados
  // intencionales). El umbral real es 3 contactos /on sin respuesta.
  const onUids: string[] = [];
  for (const uid of stuckUids) {
    try {
      if (await getBotStatus(instanciaId, uid)) onUids.push(uid);
    } catch {
      onUids.push(uid); // si ESTATUS no responde, asumir /on (conservador)
    }
  }
  if (onUids.length < 3) return null;

  // PASO 5: ¿ya hay un incidente abierto reciente? → ya estamos en seguimiento.
  // No reenviar emails ni reintentar reconexión (evita spam cada 5 min).
  const openIncident = await prisma.incidentLog.findFirst({
    where: { instanciaId, resolvedAt: null, creadoAt: { gte: twoHoursAgo } },
    select: { id: true },
  });
  if (openIncident) return null;

  const detectedAt = new Date();

  // PASO 6: email de alerta inmediata
  const emailEnviado = await sendAlertEmail({
    subject: `⚠️ Bot sin respuesta — ${businessNombre} (${instanciaId})`,
    html: buildAlertHtml({
      businessNombre,
      instanciaId,
      stuckUids: onUids,
      detectedAt,
      appUrl: APP_URL,
    }),
  });

  // PASO 7: consultar Evolution API
  const connectionStatus = await fetchEvolutionStatus(instanciaId);

  // PASO 8: auto-recuperación si no está 'open'
  let tipo = "caida_detectada";
  let accion = "ninguna";
  let resultado = "pendiente";
  let reconnectStatus = connectionStatus;

  if (connectionStatus !== "open") {
    accion = "reconexion_intentada";
    await tryReconnect(instanciaId);
    // Esperar 5 segundos (cron-job.org tiene timeout de 30s)
    await new Promise((r) => setTimeout(r, 5_000));
    reconnectStatus = await fetchEvolutionStatus(instanciaId);

    if (reconnectStatus === "open") {
      tipo = "auto-recuperada";
      resultado = "exitosa";
    } else {
      tipo = "intervencion_manual";
      resultado = "fallida";
    }
  } else {
    // Conectada pero sin responder → posible falla en flujo n8n
    resultado = "pendiente";
  }

  const resolvedAt = resultado === "exitosa" ? new Date() : undefined;

  // PASO 9: email de seguimiento
  const followUpResult: "exitosa" | "fallida" | "conectada_sin_respuesta" =
    resultado === "exitosa"
      ? "exitosa"
      : connectionStatus === "open"
        ? "conectada_sin_respuesta"
        : "fallida";

  await sendAlertEmail({
    subject:
      followUpResult === "exitosa"
        ? `✅ Auto-recuperada — ${businessNombre}`
        : followUpResult === "conectada_sin_respuesta"
          ? `⚠️ Bot sin responder — instancia conectada — revisar n8n — ${businessNombre}`
          : `🔴 Auto-recuperación fallida — ${businessNombre} — REQUIERE ATENCIÓN`,
    html: buildFollowUpHtml({
      businessNombre,
      instanciaId,
      connectionStatus: reconnectStatus,
      reconnectResult: followUpResult,
      detectedAt,
      resolvedAt,
      appUrl: APP_URL,
    }),
  });

  // PASO 10: registrar incidente (ya verificamos que no había uno abierto)
  await prisma.incidentLog.create({
    data: {
      instanciaId,
      nombreNegocio: businessNombre,
      tipo,
      contactosSinResp: onUids.length,
      estadoEvolution: reconnectStatus,
      accion,
      resultado,
      emailEnviado,
      resolvedAt: resolvedAt ?? null,
    },
  });

  return {
    instanciaId,
    negocio: businessNombre,
    tipo,
    resultado,
    contactosSinResp: onUids.length,
    estadoEvolution: reconnectStatus,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // PASO 1: autenticación
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Obtener instancias WhatsApp activas con su negocio activo
  const instances = await prisma.businessInstance.findMany({
    where: { canal: "whatsapp", activo: true, business: { activo: true } },
    include: { business: { select: { id: true, nombre: true } } },
  });

  const resultados: InstanceResult[] = [];

  // Procesar en batches de 3 (limitar paralelismo por pool de n8n=5)
  for (let i = 0; i < instances.length; i += 3) {
    const batch = instances.slice(i, i + 3);
    const results = await Promise.all(batch.map(processInstance));
    for (const r of results) {
      if (r) resultados.push(r);
    }
  }

  return NextResponse.json({
    instanciasRevisadas: instances.length,
    incidentesDetectados: resultados.length,
    resultados,
  });
}
