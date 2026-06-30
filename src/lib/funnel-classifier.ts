import { prisma } from "@/lib/prisma";
import { upsertContactStageOptimistic } from "@/lib/contact-stage";

/**
 * Clasificador de embudo con IA.
 *
 * Dada una conversación y las etapas (con descripción) del negocio, sugiere en
 * qué etapa del embudo está el cliente usando gpt-4o-mini.
 *
 * Modos (business.modoClasificacion):
 *  - 'sugerencia' (default): guarda sugerenciaStageId en Contact; el agente confirma.
 *  - 'automatico': si confianza === 'alta', mueve ContactStage directamente y
 *    crea un evento 'ia_stage' en el historial del chat.
 *
 * Throttle: no reclasifica la misma conversación si se clasificó hace < 5 min
 * (salvo `force`, que usa el botón manual on-demand).
 */

const OPENAI_MODEL = "gpt-4o-mini";
const THROTTLE_MS = 5 * 60_000;

// Tope de llamadas a OpenAI por negocio por día. THROTTLE_MS ya evita
// reclasificar la misma conversación muy seguido, pero no limita el gasto
// total si un negocio tiene tráfico alto o el bot entra en un loop de
// mensajes. Contador en memoria de proceso (igual patrón que el guard
// `running` de scheduler.ts) — soft cap, se reinicia con cada deploy.
const DAILY_CLASSIFICATION_CAP = Number(process.env.FUNNEL_AI_DAILY_CAP ?? 300);
const dailyClassificationCounts = new Map<string, { day: string; count: number }>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function exceedsDailyCap(businessId: string): boolean {
  const day = todayKey();
  const entry = dailyClassificationCounts.get(businessId);
  if (!entry || entry.day !== day) {
    dailyClassificationCounts.set(businessId, { day, count: 1 });
    return false;
  }
  entry.count += 1;
  if (entry.count > DAILY_CLASSIFICATION_CAP) {
    if (entry.count === DAILY_CLASSIFICATION_CAP + 1) {
      console.warn(
        `[funnel-classifier] Negocio ${businessId} alcanzó el tope diario de clasificaciones IA (${DAILY_CLASSIFICATION_CAP}).`,
      );
    }
    return true;
  }
  return false;
}

export type ClassifyResult = {
  stageId: string;
  stageNombre: string;
  stageColor: string;
  razon: string;
  autoMoved?: boolean;
} | null;

function rolLabel(rol: string): string {
  if (rol === "user") return "Cliente";
  if (rol === "bot") return "Bot";
  if (rol === "human") return "Agente";
  return "Sistema";
}

async function classifyWithOpenAI(
  system: string,
  user: string,
): Promise<{ etapa: string; razon: string; confianza: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        max_completion_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    const parsed = JSON.parse(content);
    if (typeof parsed.etapa !== "string") return null;
    return {
      etapa: parsed.etapa,
      razon: typeof parsed.razon === "string" ? parsed.razon : "",
      confianza: typeof parsed.confianza === "string" ? parsed.confianza : "baja",
    };
  } catch {
    return null;
  }
}

/**
 * Clasifica un contacto y guarda la sugerencia (o mueve automáticamente).
 * Devuelve la sugerencia generada, o null si no hubo.
 */
export async function classifyContact(
  businessId: string,
  instanciaId: string,
  uidUsuario: string,
  canal: string,
  opts?: { force?: boolean },
): Promise<ClassifyResult> {
  try {
    const [stages, business] = await Promise.all([
      prisma.funnelStage.findMany({
        where: { businessId },
        orderBy: { orden: "asc" },
        select: { id: true, nombre: true, color: true, descripcion: true },
      }),
      prisma.business.findUnique({
        where: { id: businessId },
        select: { nombre: true, modoClasificacion: true },
      }),
    ]);
    if (stages.length === 0 || !business) return null;

    const modoClasificacion = business.modoClasificacion ?? "sugerencia";

    // Contacto: throttle + etapa actual (para no sugerir lo que ya tiene)
    const contact = await prisma.contact.findUnique({
      where: { instanciaId_uidUsuario: { instanciaId, uidUsuario } },
      select: {
        id: true,
        clasificadoAt: true,
        etapas: { where: { businessId }, select: { stageId: true } },
      },
    });

    if (!opts?.force && contact?.clasificadoAt) {
      if (Date.now() - contact.clasificadoAt.getTime() < THROTTLE_MS) return null;
    }

    if (!opts?.force && exceedsDailyCap(businessId)) return null;

    // Mensajes recientes (orden cronológico)
    const recent = await prisma.message.findMany({
      where: { businessId, instanciaId, uidUsuario },
      orderBy: { enviadoAt: "desc" },
      take: 30,
      select: { rol: true, contenido: true, tipoMedia: true },
    });
    if (recent.length === 0) return null;

    const chronological = recent.reverse();
    const transcript = chronological
      .map((m) => `${rolLabel(m.rol)}: ${m.contenido?.trim() || `[${m.tipoMedia}]`}`)
      .join("\n");

    const lastMsg = chronological.at(-1);
    const lastMsgContext = lastMsg
      ? `Último mensaje del historial:\nROL: ${rolLabel(lastMsg.rol)} — ${lastMsg.contenido?.trim() || `[${lastMsg.tipoMedia}]`}`
      : "";

    const stageList = stages
      .map((s, i) => `${i + 1}. ${s.nombre}${s.descripcion ? ` — ${s.descripcion}` : ""}`)
      .join("\n");

    const system =
      "Eres un clasificador de embudo de ventas para un CRM de PyMEs mexicanas. " +
      "Dada una conversación entre un cliente y un negocio (WhatsApp/Instagram/Messenger), " +
      "decides en qué etapa del embudo está el cliente, basándote en las descripciones de cada etapa. " +
      "Sé conservador: si no hay señales claras, responde NINGUNA. Respondes SOLO con un objeto JSON válido.\n\n" +
      "REGLA CRÍTICA sobre cambios de etapa: " +
      "Solo sugiere cambioEtapa=true si el último mensaje en el historial es del USUARIO (rol='user'), no del bot. " +
      "Si el último mensaje es del bot/agente, el usuario no ha reaccionado aún — no se puede confirmar avance de etapa. " +
      "En ese caso: etapaDetectada = etapa actual, cambioEtapa=false.\n\n" +
      "El campo 'confianza' indica qué tan seguro estás de la clasificación: " +
      "'alta' = señales muy claras y directas, 'media' = señales presentes pero ambiguas, 'baja' = pocas señales o conversación corta.";

    const user =
      `Etapas del embudo (en orden):\n${stageList}\n\n` +
      (lastMsgContext ? `${lastMsgContext}\n\n` : "") +
      `Conversación (del más antiguo al más reciente):\n${transcript.slice(0, 8000)}\n\n` +
      `Devuelve JSON: {"etapa":"<nombre EXACTO de una etapa de la lista, o NINGUNA>","razon":"<máximo una frase en español>","confianza":"alta|media|baja"}`;

    const result = await classifyWithOpenAI(system, user);
    const now = new Date();

    // Determinar la sugerencia (si la hay y no coincide con la etapa actual)
    let suggestion: ClassifyResult = null;
    if (result?.etapa) {
      const norm = result.etapa.trim().toLowerCase();
      const match = stages.find((s) => s.nombre.trim().toLowerCase() === norm);
      const currentStageId = contact?.etapas?.[0]?.stageId ?? null;
      if (match && match.id !== currentStageId) {
        suggestion = {
          stageId: match.id,
          stageNombre: match.nombre,
          stageColor: match.color,
          razon: result.razon,
        };
      }
    }

    const confianza = result?.confianza ?? "baja";

    // Modo automático: si confianza es alta y hay sugerencia, mover sin confirmación
    if (modoClasificacion === "automatico" && confianza === "alta" && suggestion) {
      const upsertedContact = await prisma.contact.upsert({
        where: { instanciaId_uidUsuario: { instanciaId, uidUsuario } },
        create: { uidUsuario, instanciaId, canal, clasificadoAt: now },
        update: { clasificadoAt: now, sugerenciaStageId: null, sugerenciaRazon: null },
        select: { id: true },
      });

      await upsertContactStageOptimistic(upsertedContact.id, businessId, suggestion.stageId, now);

      // Evento sutil en el historial del chat
      await prisma.message.create({
        data: {
          instanciaId,
          businessId,
          nombreNegocio: business.nombre,
          canal,
          uidUsuario,
          rol: "ia_stage",
          contenido: suggestion.stageNombre,
          tipoMedia: "text",
        },
      });

      return { ...suggestion, autoMoved: true };
    }

    // Modo sugerencia (comportamiento por defecto)
    const sugFields =
      result === null
        ? {}
        : {
            sugerenciaStageId: suggestion?.stageId ?? null,
            sugerenciaRazon: suggestion?.razon ?? null,
          };

    await prisma.contact.upsert({
      where: { instanciaId_uidUsuario: { instanciaId, uidUsuario } },
      create: {
        uidUsuario,
        instanciaId,
        canal,
        clasificadoAt: now,
        ...sugFields,
      },
      update: {
        clasificadoAt: now,
        ...sugFields,
      },
    });

    return suggestion;
  } catch {
    return null;
  }
}
