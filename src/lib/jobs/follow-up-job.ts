import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { n8nPool } from "@/lib/n8n";
import { sendEmail, buildSuggestionHtml } from "@/lib/email";
import { upsertContactStageOptimistic } from "@/lib/contact-stage";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";
const APP_URL =
  process.env.APP_URL ??
  process.env.NEXTAUTH_URL ??
  "https://postgres-nexcrm.d6cr6o.easypanel.host";

type ProcessResult = {
  contactId: string;
  decision: string;
  razonIA?: string | null;
  etapaDetectada?: string | null;
};

type AIResponse = {
  enviar: boolean;
  razon: string;
  mensajeGenerado: string | null;
  etapaDetectada: string;
  cambioEtapa: boolean;
};

async function sendWhatsApp(
  instanciaId: string,
  uidUsuario: string,
  text: string,
): Promise<void> {
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

async function sendMeta(
  pageId: string,
  token: string,
  uidUsuario: string,
  text: string,
): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient: { id: uidUsuario },
          message: { text },
          messaging_type: "RESPONSE",
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timer);
    if (!r.ok) throw new Error(`Meta API ${r.status}`);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function insertBotMemory(
  tablaMemoria: string,
  uidUsuario: string,
  canal: string,
  text: string,
): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(tablaMemoria)) return;
  const sessionId =
    canal === "whatsapp" ? `${uidUsuario}@s.whatsapp.net` : uidUsuario;
  await n8nPool.query(
    `INSERT INTO "${tablaMemoria}" (session_id, message) VALUES ($1, $2)`,
    [sessionId, JSON.stringify({ type: "ai", content: text })],
  );
}

async function processContact(params: {
  contact: { id: string; uidUsuario: string; instanciaId: string; canal: string; nombre?: string | null };
  stage: { id: string; nombre: string; mensajeSeguimiento: string | null };
  business: { id: string; nombre: string; tablaMemoria: string | null; etapas: { id: string; nombre: string; descripcion: string | null }[] };
  config: { modoEnvio: string; tiempoInactividad: number; maxEnviosPorDia: number; maxEnviosTotal: number | null };
}): Promise<ProcessResult> {
  const { contact, stage, business, config } = params;
  const now = new Date();

  const logBase = {
    contactId: contact.id,
    stageId: stage.id,
    businessId: business.id,
    canal: contact.canal,
    uidUsuario: contact.uidUsuario,
    instanciaId: contact.instanciaId,
  };

  try {
    // PASO 1: Último mensaje del usuario
    const lastUserMsg = await prisma.message.findFirst({
      where: { instanciaId: contact.instanciaId, uidUsuario: contact.uidUsuario, rol: "user" },
      orderBy: { enviadoAt: "desc" },
      select: { enviadoAt: true },
    });
    if (!lastUserMsg) return { contactId: contact.id, decision: "omitido", razonIA: "Sin mensajes del usuario" };

    const minutesSinceLast = (now.getTime() - lastUserMsg.enviadoAt.getTime()) / 60000;
    if (minutesSinceLast < config.tiempoInactividad) {
      return { contactId: contact.id, decision: "omitido", razonIA: "Aún dentro del tiempo de espera" };
    }

    // PASO 2: Límites
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [dailyCount, totalCount] = await Promise.all([
      prisma.followUpLog.count({
        where: { contactId: contact.id, stageId: stage.id, decision: "enviado", creadoAt: { gte: todayStart } },
      }),
      prisma.followUpLog.count({
        where: { contactId: contact.id, stageId: stage.id, decision: "enviado" },
      }),
    ]);

    if (dailyCount >= config.maxEnviosPorDia) {
      await prisma.followUpLog.create({ data: { ...logBase, decision: "limite_alcanzado", razonIA: "Límite diario alcanzado" } });
      return { contactId: contact.id, decision: "limite_alcanzado" };
    }
    if (config.maxEnviosTotal !== null && totalCount >= config.maxEnviosTotal) {
      return { contactId: contact.id, decision: "limite_alcanzado", razonIA: "Límite total alcanzado" };
    }

    // PASO 3: Ventana Meta 24h
    if (contact.canal === "instagram" || contact.canal === "messenger") {
      const hoursSinceLast = minutesSinceLast / 60;
      if (hoursSinceLast > 24) {
        await prisma.followUpLog.create({ data: { ...logBase, decision: "ventana_cerrada", razonIA: "Ventana Meta de 24h expirada" } });
        return { contactId: contact.id, decision: "ventana_cerrada" };
      }
    }

    // PASO 3.5: Verificar actividad reciente en los últimos 7 días
    const actividadReciente = await prisma.followUpLog.findFirst({
      where: {
        contactId: contact.id,
        stageId: stage.id,
        creadoAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        OR: [
          { decision: "omitido", aprobado: null },  // sugerencia pendiente de aprobar
          { decision: "enviado" },                   // ya enviado automáticamente
          { decision: "omitido", aprobado: true },   // aprobado desde email/dashboard
        ],
      },
      select: { id: true },
    });
    if (actividadReciente) {
      return { contactId: contact.id, decision: "omitido", razonIA: "Actividad reciente en los últimos 7 días" };
    }

    // PASO 4: Análisis con GPT
    const messages = await prisma.message.findMany({
      where: { instanciaId: contact.instanciaId, uidUsuario: contact.uidUsuario },
      orderBy: { enviadoAt: "desc" },
      take: 20,
      select: { rol: true, contenido: true, enviadoAt: true },
    });
    const historial = messages
      .reverse()
      .map((m) => {
        const hora = m.enviadoAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
        const fecha = m.enviadoAt.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" });
        return `${m.rol.toUpperCase()} (${hora} ${fecha}): ${m.contenido ?? "[media]"}`;
      })
      .join("\n");

    const etapasLista = business.etapas
      .map((e) => `- ${e.nombre}${e.descripcion ? `: ${e.descripcion}` : ""}`)
      .join("\n");

    const contactDisplayName = contact.nombre ?? contact.uidUsuario;
    const guiaTono = stage.mensajeSeguimiento ?? "Mensaje amigable y directo";
    const lastMsg = messages[messages.length - 1];
    const lastMsgContext = lastMsg
      ? `Último mensaje: ROL=${lastMsg.rol.toUpperCase()} — ${lastMsg.contenido?.trim() || `[${lastMsg.enviadoAt.toLocaleDateString("es-MX")}]`}`
      : "";

    const systemPrompt = `Eres un experto en ventas conversacionales para PyMEs mexicanas.
Analizas conversaciones de WhatsApp/Instagram/Messenger y decides si vale la pena hacer seguimiento. Si sí, generas un mensaje personalizado y natural.

Negocio: ${business.nombre}
Etapa actual: ${stage.nombre}
Nombre del contacto: ${contactDisplayName}
Canal: ${contact.canal}
Tiempo sin respuesta: ${Math.round(minutesSinceLast)} minutos

Etapas del embudo:
${etapasLista}

Guía de tono/estilo (definida por el negocio):
"${guiaTono}"

REGLA CRÍTICA — cambios de etapa:
Solo sugiere cambioEtapa=true si el ÚLTIMO mensaje del historial es del USUARIO (rol='user'). Si el último mensaje es del bot/agente, el usuario no ha reaccionado — cambioEtapa=false siempre.

Responde ÚNICAMENTE con JSON válido sin texto adicional:
{
  "enviar": true | false,
  "razon": "explicación breve máximo 100 chars en español",
  "mensajeGenerado": "mensaje personalizado en español mexicano, natural y conversacional, máximo 300 chars. null si enviar=false",
  "etapaDetectada": "nombre exacto de la etapa actual",
  "cambioEtapa": true | false
}

Para mensajeGenerado cuando enviar=true:
- Usar el nombre del contacto si está disponible
- Referenciar algo específico de la conversación (producto preguntado, fecha mencionada, duda específica)
- Tono: amigable, informal, mexicano
- NO mencionar que es automático
- NO ser genérico — debe sentirse como si un humano lo escribió
- Máximo 300 caracteres
- Máximo 1 emoji relevante
- Respetar el tono/estilo de la guía del negocio

Criterios para enviar=true:
- Usuario mostró intención real (precio, disponibilidad, cómo comprar)
- Conversación quedó inconclusa
- No hay rechazo explícito
- Tiempo de inactividad razonable para la etapa

Criterios para enviar=false:
- Usuario rechazó explícitamente
- Solo curiosidad sin intención de compra
- Consulta ya resuelta completamente
- Último mensaje fue del bot/agente`;

    const userPrompt = `Historial de conversación (más antiguo → más reciente):\n${historial}\n\n${lastMsgContext}\n\nGuía de tono del negocio: "${guiaTono}"\n\nGenera el análisis y el mensaje personalizado si aplica.`;

    let aiResponse: AIResponse;
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 600,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      aiResponse = JSON.parse(raw) as AIResponse;
    } catch {
      await prisma.followUpLog.create({ data: { ...logBase, decision: "error", razonIA: "Respuesta IA inválida" } });
      return { contactId: contact.id, decision: "error", razonIA: "Respuesta IA inválida" };
    }

    // PASO 5-9: Ejecutar según decisión y modo
    if (!aiResponse.enviar) {
      await prisma.followUpLog.create({ data: { ...logBase, decision: "ia_descarto", razonIA: aiResponse.razon, etapaDetectada: aiResponse.etapaDetectada } });
      return { contactId: contact.id, decision: "ia_descarto", razonIA: aiResponse.razon, etapaDetectada: aiResponse.etapaDetectada };
    }

    // Usar mensaje generado por IA; si no, caer en la guía de tono como fallback
    const mensajeEnviado = aiResponse.mensajeGenerado ?? stage.mensajeSeguimiento ?? null;
    if (!mensajeEnviado) {
      await prisma.followUpLog.create({ data: { ...logBase, decision: "ia_descarto", razonIA: "Sin mensaje disponible", etapaDetectada: aiResponse.etapaDetectada } });
      return { contactId: contact.id, decision: "ia_descarto", razonIA: "Sin mensaje disponible", etapaDetectada: aiResponse.etapaDetectada };
    }

    if (config.modoEnvio === "manual") {
      const log = await prisma.followUpLog.create({
        data: { ...logBase, decision: "omitido", razonIA: aiResponse.razon, mensajeEnviado, etapaDetectada: aiResponse.etapaDetectada, aprobado: null },
        select: { id: true },
      });
      try {
        const usersToNotify = await prisma.user.findMany({
          where: {
            businessId: business.id,
            activo: true,
            OR: [
              { businessRoleId: null },
              { businessRole: { permisos: { has: "email_sugerencias_seguimiento" } } },
            ],
          },
          select: { email: true },
        });
        const contactName = contact.nombre ?? contact.uidUsuario;
        for (const u of usersToNotify) {
          try {
            await sendEmail({
              to: u.email,
              subject: `💬 Seguimiento sugerido — ${contactName} · ${business.nombre}`,
              html: buildSuggestionHtml({
                businessNombre: business.nombre,
                stageName: stage.nombre,
                contactName,
                canal: contact.canal,
                minutesSinRespuesta: Math.round(minutesSinceLast),
                razonIA: aiResponse.razon,
                mensajeEnviado,
                logId: log.id,
                appUrl: APP_URL,
              }),
            });
          } catch {
            // skip silencioso por usuario
          }
        }
      } catch {
        // skip silencioso — no romper el flujo si el email falla
      }
      return { contactId: contact.id, decision: "omitido", razonIA: aiResponse.razon, etapaDetectada: aiResponse.etapaDetectada };
    }

    // Modo automático: enviar
    try {
      if (contact.canal === "whatsapp") {
        await sendWhatsApp(contact.instanciaId, contact.uidUsuario, mensajeEnviado);
      } else {
        const inst = await prisma.businessInstance.findFirst({
          where: { instanciaId: contact.instanciaId, canal: contact.canal },
          select: { metaPageId: true, metaPageAccessToken: true },
        });
        if (!inst?.metaPageAccessToken || !inst.metaPageId) throw new Error("Sin token Meta");
        await sendMeta(inst.metaPageId, inst.metaPageAccessToken, contact.uidUsuario, mensajeEnviado);
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Error desconocido";
      await prisma.followUpLog.create({ data: { ...logBase, decision: "error", razonIA: errMsg, mensajeEnviado } });
      return { contactId: contact.id, decision: "error", razonIA: errMsg };
    }

    // PASO 6: Insertar en memoria del bot
    if (business.tablaMemoria) {
      try {
        await insertBotMemory(business.tablaMemoria, contact.uidUsuario, contact.canal, mensajeEnviado);
      } catch {
        // skip silencioso
      }
    }

    // PASO 7: Registrar mensaje en CRM
    await prisma.message.create({
      data: {
        instanciaId: contact.instanciaId,
        businessId: business.id,
        nombreNegocio: business.nombre,
        canal: contact.canal,
        uidUsuario: contact.uidUsuario,
        rol: "bot",
        contenido: mensajeEnviado,
        tipoMedia: "text",
        metadata: {
          fuente: "seguimiento-automatico",
          etapa: stage.nombre,
          razonIA: aiResponse.razon,
          modoEnvio: "automatico",
        },
      },
    });

    // PASO 8: Actualizar etapa si la IA detectó cambio
    if (aiResponse.cambioEtapa && aiResponse.etapaDetectada) {
      const newStage = business.etapas.find((e) => e.nombre === aiResponse.etapaDetectada);
      if (newStage) {
        await upsertContactStageOptimistic(contact.id, business.id, newStage.id, new Date());
      }
    }

    // PASO 9: Log final
    await prisma.followUpLog.create({
      data: { ...logBase, decision: "enviado", razonIA: aiResponse.razon, mensajeEnviado, etapaDetectada: aiResponse.etapaDetectada },
    });

    return { contactId: contact.id, decision: "enviado", razonIA: aiResponse.razon, etapaDetectada: aiResponse.etapaDetectada };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Error desconocido";
    try {
      await prisma.followUpLog.create({ data: { ...logBase, decision: "error", razonIA: errMsg } });
    } catch {
      // ignore secondary error
    }
    return { contactId: contact.id, decision: "error", razonIA: errMsg };
  }
}

async function processInBatches<T>(items: T[], fn: (item: T) => Promise<ProcessResult>, batchSize = 3): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export type FollowUpResult = {
  procesados: number;
  enviados: number;
  omitidos: number;
  ventanaCerrada: number;
  iaDescarto: number;
  errores: number;
  detalle: ProcessResult[];
};

export async function runFollowUpJob(): Promise<FollowUpResult> {
  const counters = { procesados: 0, enviados: 0, omitidos: 0, ventanaCerrada: 0, iaDescarto: 0, errores: 0 };
  const detalle: ProcessResult[] = [];

  try {
    const businesses = await prisma.business.findMany({
      where: { plan: "pro", activo: true },
      select: {
        id: true,
        nombre: true,
        tablaMemoria: true,
        etapas: {
          where: { followUpConfig: { activo: true } },
          select: {
            id: true,
            nombre: true,
            mensajeSeguimiento: true,
            followUpConfig: {
              select: { modoEnvio: true, tiempoInactividad: true, maxEnviosPorDia: true, maxEnviosTotal: true },
            },
            contactos: {
              select: {
                contact: {
                  select: { id: true, uidUsuario: true, instanciaId: true, canal: true, nombre: true },
                },
              },
            },
          },
        },
      },
    });

    // Flattened list of all (contact, stage, business, config) tuples
    type WorkItem = {
      contact: { id: string; uidUsuario: string; instanciaId: string; canal: string; nombre?: string | null };
      stage: { id: string; nombre: string; mensajeSeguimiento: string | null };
      business: { id: string; nombre: string; tablaMemoria: string | null; etapas: { id: string; nombre: string; descripcion: string | null }[] };
      config: { modoEnvio: string; tiempoInactividad: number; maxEnviosPorDia: number; maxEnviosTotal: number | null };
    };

    const businessEtapas = await prisma.funnelStage.findMany({
      where: { businessId: { in: businesses.map((b) => b.id) } },
      select: { id: true, businessId: true, nombre: true, descripcion: true },
    });

    const workItems: WorkItem[] = [];
    for (const biz of businesses) {
      const allStages = businessEtapas.filter((e) => e.businessId === biz.id);
      for (const stage of biz.etapas) {
        if (!stage.followUpConfig) continue;
        for (const cs of stage.contactos) {
          workItems.push({
            contact: cs.contact,
            stage: { id: stage.id, nombre: stage.nombre, mensajeSeguimiento: stage.mensajeSeguimiento },
            business: { id: biz.id, nombre: biz.nombre, tablaMemoria: biz.tablaMemoria, etapas: allStages },
            config: stage.followUpConfig,
          });
        }
      }
    }

    counters.procesados = workItems.length;
    const results = await processInBatches(workItems, (item) =>
      processContact(item),
    );

    for (const r of results) {
      detalle.push(r);
      if (r.decision === "enviado") counters.enviados++;
      else if (r.decision === "omitido") counters.omitidos++;
      else if (r.decision === "ventana_cerrada") counters.ventanaCerrada++;
      else if (r.decision === "ia_descarto") counters.iaDescarto++;
      else if (r.decision === "error") counters.errores++;
    }
  } catch (e) {
    throw e instanceof Error ? e : new Error("Error interno follow-up");
  }

  return { ...counters, detalle };
}
