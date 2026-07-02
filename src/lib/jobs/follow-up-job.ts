import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildSuggestionHtml } from "@/lib/email";
import { upsertContactStageOptimistic } from "@/lib/contact-stage";
import { insertBotMemory } from "@/lib/bot-memory";
import { getBotStatus } from "@/lib/n8n";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";
const APP_URL =
  process.env.APP_URL ??
  process.env.NEXTAUTH_URL ??
  "https://postgres-nexcrm.d6cr6o.easypanel.host";

const DAY_MS = 24 * 60 * 60 * 1000;

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

// `destino` es el JID real del contacto (Contact.jidCompleto puede ser @lid);
// armar el sufijo a mano manda el mensaje a un destino equivocado.
async function sendWhatsApp(
  instanciaId: string,
  destino: string,
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
        body: JSON.stringify({ number: destino, text }),
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

async function processContact(params: {
  contact: { id: string; uidUsuario: string; instanciaId: string; canal: string; nombre?: string | null; jidCompleto?: string | null };
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
      // Un solo log diagnóstico por día — el cron corre cada 15 min y sin este
      // guard acumulaba 90+ filas idénticas al día por contacto.
      const yaLogueado = await prisma.followUpLog.findFirst({
        where: { contactId: contact.id, stageId: stage.id, decision: "limite_alcanzado", creadoAt: { gte: todayStart } },
        select: { id: true },
      });
      if (!yaLogueado) {
        await prisma.followUpLog.create({ data: { ...logBase, decision: "limite_alcanzado", razonIA: "Límite diario alcanzado" } });
      }
      return { contactId: contact.id, decision: "limite_alcanzado" };
    }
    if (config.maxEnviosTotal !== null && totalCount >= config.maxEnviosTotal) {
      return { contactId: contact.id, decision: "limite_alcanzado", razonIA: "Límite total alcanzado" };
    }

    // PASO 3: Ventana Meta 24h
    if (contact.canal === "instagram" || contact.canal === "messenger") {
      const hoursSinceLast = minutesSinceLast / 60;
      if (hoursSinceLast > 24) {
        const yaLogueado = await prisma.followUpLog.findFirst({
          where: {
            contactId: contact.id,
            stageId: stage.id,
            decision: "ventana_cerrada",
            creadoAt: { gte: new Date(now.getTime() - DAY_MS) },
          },
          select: { id: true },
        });
        if (!yaLogueado) {
          await prisma.followUpLog.create({ data: { ...logBase, decision: "ventana_cerrada", razonIA: "Ventana Meta de 24h expirada" } });
        }
        return { contactId: contact.id, decision: "ventana_cerrada" };
      }
    }

    // PASO 3.5: Actividad reciente. Envíos y sugerencias bloquean 7 días;
    // 'ia_descarto'/'error' bloquean 24h — sin esto, un contacto descartado
    // por la IA se re-analizaba con GPT en CADA corrida del cron (96/día),
    // para siempre: puro gasto.
    const actividadReciente = await prisma.followUpLog.findFirst({
      where: {
        contactId: contact.id,
        stageId: stage.id,
        OR: [
          { creadoAt: { gte: new Date(now.getTime() - 7 * DAY_MS) }, decision: "enviado" },
          { creadoAt: { gte: new Date(now.getTime() - 7 * DAY_MS) }, decision: "omitido", aprobado: null },
          { creadoAt: { gte: new Date(now.getTime() - 7 * DAY_MS) }, decision: "omitido", aprobado: true },
          { creadoAt: { gte: new Date(now.getTime() - DAY_MS) }, decision: { in: ["ia_descarto", "error"] } },
        ],
      },
      select: { id: true },
    });
    if (actividadReciente) {
      return { contactId: contact.id, decision: "omitido", razonIA: "Actividad reciente" };
    }

    // PASO 3.6: Bot pausado (/off en ESTATUS) = un humano tomó la conversación
    // o el contacto pidió no ser molestado — no interrumpir con seguimientos.
    // Fail-closed: si no se puede verificar, mejor no enviar.
    try {
      const botActivo = await getBotStatus(
        contact.instanciaId,
        contact.jidCompleto ?? contact.uidUsuario,
      );
      if (!botActivo) {
        return { contactId: contact.id, decision: "omitido", razonIA: "Bot pausado para este contacto" };
      }
    } catch {
      return { contactId: contact.id, decision: "omitido", razonIA: "No se pudo verificar la pausa del bot" };
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

REGLA CRÍTICA — no inventar:
PROHIBIDO mencionar precios, descuentos, promociones, tiempos de entrega, disponibilidad o cualquier dato o compromiso que NO aparezca textualmente en el historial de la conversación. Si el negocio no lo dijo en la conversación, tú no lo dices. Ante la duda, haz una pregunta abierta en lugar de afirmar algo.

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
      const parsed = JSON.parse(raw) as AIResponse;
      if (typeof parsed.enviar !== "boolean") throw new Error("Campo 'enviar' inválido");
      if (typeof parsed.mensajeGenerado !== "string") parsed.mensajeGenerado = null;
      aiResponse = parsed;
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
    let mensajeEnviado = aiResponse.mensajeGenerado?.trim() || stage.mensajeSeguimiento || null;
    if (!mensajeEnviado) {
      await prisma.followUpLog.create({ data: { ...logBase, decision: "ia_descarto", razonIA: "Sin mensaje disponible", etapaDetectada: aiResponse.etapaDetectada } });
      return { contactId: contact.id, decision: "ia_descarto", razonIA: "Sin mensaje disponible", etapaDetectada: aiResponse.etapaDetectada };
    }
    // El límite de 300 chars solo se le PIDE al modelo — aquí se garantiza.
    if (mensajeEnviado.length > 320) {
      mensajeEnviado = `${mensajeEnviado.slice(0, 300).trimEnd()}…`;
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

    // Modo automático: re-checar que el contacto no haya respondido mientras
    // la IA generaba (la ventana entre el PASO 1 y aquí son varios segundos —
    // mandar "¿sigues ahí?" justo después de que contestó destruye confianza).
    const respondioDespues = await prisma.message.findFirst({
      where: {
        instanciaId: contact.instanciaId,
        uidUsuario: contact.uidUsuario,
        rol: "user",
        enviadoAt: { gt: lastUserMsg.enviadoAt },
      },
      select: { id: true },
    });
    if (respondioDespues) {
      return { contactId: contact.id, decision: "omitido", razonIA: "El contacto respondió durante el análisis" };
    }

    try {
      if (contact.canal === "whatsapp") {
        const destino = contact.jidCompleto ?? `${contact.uidUsuario}@s.whatsapp.net`;
        await sendWhatsApp(contact.instanciaId, destino, mensajeEnviado);
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
        await insertBotMemory(business.tablaMemoria, contact.uidUsuario, contact.canal, "ai", mensajeEnviado, contact.jidCompleto);
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

    // PASO 8: Actualizar etapa si la IA detectó cambio (match tolerante a
    // mayúsculas/espacios; respeta asignaciones manuales recientes vía origen 'ia')
    if (aiResponse.cambioEtapa && aiResponse.etapaDetectada) {
      const normDetectada = aiResponse.etapaDetectada.trim().toLowerCase();
      const newStage = business.etapas.find((e) => e.nombre.trim().toLowerCase() === normDetectada);
      if (newStage) {
        await upsertContactStageOptimistic(contact.id, business.id, newStage.id, new Date(), "ia");
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

async function processInBatches<T>(items: T[], fn: (item: T) => Promise<ProcessResult>, batchSize = 5): Promise<ProcessResult[]> {
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
                  select: { id: true, uidUsuario: true, instanciaId: true, canal: true, nombre: true, jidCompleto: true },
                },
              },
            },
          },
        },
      },
    });

    // Flattened list of all (contact, stage, business, config) tuples
    type WorkItem = {
      contact: { id: string; uidUsuario: string; instanciaId: string; canal: string; nombre?: string | null; jidCompleto?: string | null };
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
