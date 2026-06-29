import { prisma } from "@/lib/prisma";
import { getBotStatus } from "@/lib/n8n";
import {
  sendAlertEmail,
  buildAlertHtml,
  buildFollowUpHtml,
  sendEmail,
  buildClientDisconnectHtml,
} from "@/lib/email";

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
    // Evolution API v2 devuelve estructura plana: { name, connectionStatus, ... }
    const all = (await r.json()) as Array<{
      name?: string;
      connectionStatus?: string;
      state?: string;
      instance?: { instanceName?: string; status?: string; state?: string; connectionStatus?: string };
    }>;
    const inst = all.find(
      (i) => i.name === instanciaId || i.instance?.instanceName === instanciaId,
    );
    return (
      inst?.connectionStatus ??
      inst?.state ??
      inst?.instance?.state ??
      inst?.instance?.connectionStatus ??
      inst?.instance?.status ??
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
  const fiveMinAgo   = new Date(now.getTime() -  5 * 60_000);
  const twelveMinAgo = new Date(now.getTime() - 12 * 60_000);
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000);
  const twoHoursAgo  = new Date(now.getTime() -  2 * 60 * 60_000);

  // ── RUTA A: Desconexión directa ─────────────────────────────────────────
  // Consultar Evolution API primero; si el estado no es 'open' se envía la
  // alerta sin esperar a que haya usuarios atascados.
  const connectionStatus = await fetchEvolutionStatus(instanciaId);

  if (connectionStatus !== "open" && connectionStatus !== "unknown") {
    console.log("[health] instancia desconectada:", instanciaId, "| estado:", connectionStatus);

    // No duplicar alertas si ya hay un incidente abierto reciente
    const openIncident = await prisma.incidentLog.findFirst({
      where: { instanciaId, resolvedAt: null, creadoAt: { gte: twoHoursAgo } },
      select: { id: true },
    });
    if (openIncident) return null;

    const detectedAt = now;

    const emailEnviado = await sendAlertEmail({
      subject: `⚠️ Instancia desconectada — ${businessNombre} (${instanciaId})`,
      html: buildAlertHtml({
        businessNombre,
        instanciaId,
        stuckUids: [],
        detectedAt,
        appUrl: APP_URL,
      }),
    });

    await tryReconnect(instanciaId);
    await new Promise((r) => setTimeout(r, 5_000));
    const reconnectStatus = await fetchEvolutionStatus(instanciaId);

    const tipo      = reconnectStatus === "open" ? "auto-recuperada"    : "intervencion_manual";
    const resultado = reconnectStatus === "open" ? "exitosa"            : "fallida";
    const resolvedAt = resultado === "exitosa" ? new Date() : undefined;

    await sendAlertEmail({
      subject:
        resultado === "exitosa"
          ? `✅ Auto-recuperada — ${businessNombre}`
          : `🔴 Auto-recuperación fallida — ${businessNombre} — REQUIERE ATENCIÓN`,
      html: buildFollowUpHtml({
        businessNombre,
        instanciaId,
        connectionStatus: reconnectStatus,
        reconnectResult: resultado === "exitosa" ? "exitosa" : "fallida",
        detectedAt,
        resolvedAt,
        appUrl: APP_URL,
      }),
    });

    // Notificar al cliente solo si la reconexión no pudo restaurar el servicio
    if (reconnectStatus !== "open") {
      const clientUsers = await prisma.user.findMany({
        where: {
          businessId: inst.business.id,
          activo: true,
          OR: [
            { businessRoleId: null },
            { businessRole: { permisos: { has: "email_alertas_desconexion" } } },
          ],
        },
        select: { email: true },
      });
      for (const u of clientUsers) {
        try {
          await sendEmail({
            to: u.email,
            subject: `⚠️ Tu asistente virtual se desconectó — ${businessNombre}`,
            html: buildClientDisconnectHtml({ businessNombre, appUrl: APP_URL }),
          });
        } catch { /* silencioso */ }
      }
    }

    await prisma.incidentLog.create({
      data: {
        instanciaId,
        nombreNegocio: businessNombre,
        tipo,
        contactosSinResp: 0,
        estadoEvolution: reconnectStatus,
        accion: "reconexion_intentada",
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
      contactosSinResp: 0,
      estadoEvolution: reconnectStatus,
    };
  }

  // ── RUTA B: Instancia conectada — verificar si el bot responde ────────────

  // ¿Bot respondió en los últimos 5 min? → bot operando → skip
  const recentBot = await prisma.message.findFirst({
    where: { instanciaId, rol: "bot", enviadoAt: { gte: fiveMinAgo } },
    select: { id: true },
  });
  if (recentBot) {
    // Si había un incidente abierto y el bot volvió a responder, cerrarlo.
    await prisma.incidentLog.updateMany({
      where: { instanciaId, resolvedAt: null, creadoAt: { gte: twoHoursAgo } },
      data: { resolvedAt: now, tipo: "auto-recuperada", resultado: "exitosa" },
    });
    return null;
  }

  // Mensajes de usuario en ventana 12–30 min atrás
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
    if (!latestByUid.has(m.uidUsuario)) latestByUid.set(m.uidUsuario, m.enviadoAt);
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
  if (stuckUids.length < 3) return null;

  // Filtrar a los que tienen el bot en /on (descarta pausados intencionales)
  const onUids: string[] = [];
  for (const uid of stuckUids) {
    try {
      if (await getBotStatus(instanciaId, uid)) onUids.push(uid);
    } catch {
      onUids.push(uid); // si ESTATUS no responde, asumir /on (conservador)
    }
  }
  if (onUids.length < 3) return null;

  // ¿ya hay un incidente abierto reciente? → ya estamos en seguimiento.
  const openIncidentB = await prisma.incidentLog.findFirst({
    where: { instanciaId, resolvedAt: null, creadoAt: { gte: twoHoursAgo } },
    select: { id: true },
  });
  if (openIncidentB) return null;

  const detectedAt = new Date();

  // La instancia está conectada (RUTA B garantiza connectionStatus === "open")
  // pero el bot no responde → posible falla en el flujo n8n.
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

  await sendAlertEmail({
    subject: `⚠️ Bot sin responder — instancia conectada — revisar n8n — ${businessNombre}`,
    html: buildFollowUpHtml({
      businessNombre,
      instanciaId,
      connectionStatus: "open",
      reconnectResult: "conectada_sin_respuesta",
      detectedAt,
      resolvedAt: undefined,
      appUrl: APP_URL,
    }),
  });

  await prisma.incidentLog.create({
    data: {
      instanciaId,
      nombreNegocio: businessNombre,
      tipo: "caida_detectada",
      contactosSinResp: onUids.length,
      estadoEvolution: "open",
      accion: "ninguna",
      resultado: "pendiente",
      emailEnviado,
      resolvedAt: null,
    },
  });

  return {
    instanciaId,
    negocio: businessNombre,
    tipo: "caida_detectada",
    resultado: "pendiente",
    contactosSinResp: onUids.length,
    estadoEvolution: "open",
  };
}

export type HealthCheckResult = {
  instanciasRevisadas: number;
  incidentesDetectados: number;
  resultados: InstanceResult[];
};

export async function runHealthCheckJob(): Promise<HealthCheckResult> {
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

  return {
    instanciasRevisadas: instances.length,
    incidentesDetectados: resultados.length,
    resultados,
  };
}
