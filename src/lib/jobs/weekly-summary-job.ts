import { prisma } from "@/lib/prisma";
import { sendEmail, buildWeeklySummaryHtml } from "@/lib/email";
import OpenAI from "openai";

const APP_URL =
  process.env.APP_URL ??
  process.env.NEXTAUTH_URL ??
  "https://postgres-nexcrm.d6cr6o.easypanel.host";

function formatDateMex(d: Date): string {
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    timeZone: "America/Mexico_City",
  });
}

function pct(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 100);
}

async function analyzeWithAI(
  instanciaIds: string[],
  startDate: Date,
): Promise<{
  temasFrecuentes: Array<{ tema: string; porcentaje: number; descripcion: string }>;
  rendimientoBot: string;
  oportunidades: string[];
  preguntasSinResponder: string[];
} | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  if (instanciaIds.length === 0) return null;

  const msgs = await prisma.message.findMany({
    where: {
      instanciaId: { in: instanciaIds },
      enviadoAt: { gte: startDate },
      rol: "user",
      contenido: { not: null },
    },
    select: { contenido: true, uidUsuario: true },
    take: 50,
    orderBy: { enviadoAt: "desc" },
  });

  if (msgs.length === 0) return null;

  const sample = msgs
    .map((m, i) => `[${i + 1}] ${m.contenido}`)
    .join("\n");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 600,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Eres un analista de CRM. Analiza mensajes de WhatsApp de clientes de un negocio y extrae insights en JSON. Responde SOLO con el JSON solicitado, sin explicaciones.",
        },
        {
          role: "user",
          content: `Analiza estos ${msgs.length} mensajes de clientes de la última semana:\n\n${sample}\n\nResponde con este JSON exacto:\n{\n  "temasFrecuentes": [{ "tema": string, "porcentaje": number, "descripcion": string }],\n  "rendimientoBot": string,\n  "oportunidades": [string],\n  "preguntasSinResponder": [string]\n}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as {
      temasFrecuentes: Array<{ tema: string; porcentaje: number; descripcion: string }>;
      rendimientoBot: string;
      oportunidades: string[];
      preguntasSinResponder: string[];
    };
  } catch (err) {
    console.error("[weekly-summary] OpenAI error:", err);
    return null;
  }
}

async function processBusinessSummary(business: {
  id: string;
  nombre: string;
  instancias: Array<{ instanciaId: string }>;
  etapas: Array<{ id: string; nombre: string; color: string }>;
}) {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60_000);

  const instanciaIds = business.instancias.map((i) => i.instanciaId);
  if (instanciaIds.length === 0) return;

  // Métricas semana actual
  const [mensajesActual, mensajesPrev, contactosActual, contactosPrev] =
    await Promise.all([
      prisma.message.count({
        where: {
          instanciaId: { in: instanciaIds },
          rol: "user",
          enviadoAt: { gte: weekStart },
        },
      }),
      prisma.message.count({
        where: {
          instanciaId: { in: instanciaIds },
          rol: "user",
          enviadoAt: { gte: prevWeekStart, lt: weekStart },
        },
      }),
      prisma.contact.count({
        where: { instanciaId: { in: instanciaIds }, resolvedAt: { gte: weekStart } },
      }),
      prisma.contact.count({
        where: {
          instanciaId: { in: instanciaIds },
          resolvedAt: { gte: prevWeekStart, lt: weekStart },
        },
      }),
    ]);

  // Tiempo promedio de respuesta humana (mensajes human posteriores a mensajes user)
  const humanMsgs = await prisma.message.findMany({
    where: {
      instanciaId: { in: instanciaIds },
      rol: "human",
      enviadoAt: { gte: weekStart },
    },
    select: { uidUsuario: true, enviadoAt: true },
    take: 100,
  });

  let tiempoPromedioRespuesta = 0;
  if (humanMsgs.length > 0) {
    let totalMs = 0;
    let count = 0;
    for (const h of humanMsgs) {
      const prevUser = await prisma.message.findFirst({
        where: {
          instanciaId: { in: instanciaIds },
          uidUsuario: h.uidUsuario,
          rol: "user",
          enviadoAt: { lt: h.enviadoAt },
        },
        orderBy: { enviadoAt: "desc" },
        select: { enviadoAt: true },
      });
      if (prevUser) {
        totalMs += h.enviadoAt.getTime() - prevUser.enviadoAt.getTime();
        count++;
      }
    }
    if (count > 0) tiempoPromedioRespuesta = Math.round(totalMs / count / 1000);
  }

  // Seguimientos enviados — solo los que realmente se ENVIARON. Contar todos
  // los logs (ia_descarto, ventana_cerrada, errores...) inflaba la métrica
  // que el dueño recibe cada lunes.
  const seguimientosEnviados = await prisma.followUpLog.count({
    where: { businessId: business.id, decision: "enviado", creadoAt: { gte: weekStart } },
  });

  // Tasa de respuesta (contactos que respondieron después de seguimiento)
  const seguimientoLogs = await prisma.followUpLog.findMany({
    where: { businessId: business.id, decision: "enviado", creadoAt: { gte: weekStart } },
    select: { uidUsuario: true, instanciaId: true, creadoAt: true },
    take: 50,
  });

  let respondieron = 0;
  for (const log of seguimientoLogs) {
    const resp = await prisma.message.findFirst({
      where: {
        instanciaId: log.instanciaId,
        uidUsuario: log.uidUsuario,
        rol: "user",
        enviadoAt: { gt: log.creadoAt },
      },
      select: { id: true },
    });
    if (resp) respondieron++;
  }
  const tasaRespuesta =
    seguimientoLogs.length > 0
      ? Math.round((respondieron / seguimientoLogs.length) * 100)
      : 0;

  // Embudo — contar contactos por etapa
  const contactStages = await prisma.contactStage.findMany({
    where: { businessId: business.id },
    select: { stageId: true },
  });
  const stageCount = new Map<string, number>();
  for (const cs of contactStages) {
    stageCount.set(cs.stageId, (stageCount.get(cs.stageId) ?? 0) + 1);
  }

  const etapas = business.etapas.map((stage) => ({
    nombre: stage.nombre,
    color: stage.color,
    count: stageCount.get(stage.id) ?? 0,
  }));

  // Análisis IA (solo mensajes de las instancias de este negocio)
  const ai = await analyzeWithAI(instanciaIds, weekStart);

  // Obtener destinatarios
  const usersToNotify = await prisma.user.findMany({
    where: {
      businessId: business.id,
      activo: true,
      OR: [
        { businessRoleId: null },
        { businessRole: { permisos: { has: "email_resumen_semanal" } } },
      ],
    },
    select: { email: true },
  });

  if (usersToNotify.length === 0) return;

  const fechaInicio = formatDateMex(weekStart);
  const fechaFin = formatDateMex(now);

  const html = buildWeeklySummaryHtml({
    businessNombre: business.nombre,
    fechaInicio,
    fechaFin,
    metricas: {
      mensajesRecibidos: mensajesActual,
      varMensajes: pct(mensajesActual, mensajesPrev),
      contactosNuevos: contactosActual,
      varContactos: pct(contactosActual, contactosPrev),
      tiempoPromedioRespuesta,
      seguimientosEnviados,
      tasaRespuesta,
    },
    etapas,
    appUrl: APP_URL,
    ai,
  });

  for (const u of usersToNotify) {
    try {
      await sendEmail({
        to: u.email,
        subject: `📊 Resumen semanal — ${business.nombre} (${fechaInicio} al ${fechaFin})`,
        html,
      });
    } catch { /* silencioso */ }
  }
}

export type WeeklySummaryResult = { ok: boolean; negociosProcesados: number };

export async function runWeeklySummaryJob(): Promise<WeeklySummaryResult> {
  const businesses = await prisma.business.findMany({
    where: { activo: true },
    select: {
      id: true,
      nombre: true,
      instancias: { select: { instanciaId: true }, where: { activo: true } },
      etapas: {
        select: { id: true, nombre: true, color: true },
        orderBy: { orden: "asc" },
      },
    },
  });

  let procesados = 0;
  for (let i = 0; i < businesses.length; i += 3) {
    const batch = businesses.slice(i, i + 3);
    // allSettled (no Promise.all): que un negocio falle no debe abortar el
    // resto del batch ni cortar el loop para los batches siguientes.
    const results = await Promise.allSettled(batch.map(processBusinessSummary));
    for (const r of results) {
      if (r.status === "fulfilled") {
        procesados++;
      } else {
        console.error("[weekly-summary] fallo procesando negocio:", r.reason);
      }
    }
  }

  return { ok: true, negociosProcesados: procesados };
}
