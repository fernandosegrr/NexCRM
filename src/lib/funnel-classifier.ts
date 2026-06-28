import { prisma } from "@/lib/prisma";

/**
 * Clasificador de embudo con IA.
 *
 * Dada una conversación y las etapas (con descripción) del negocio, sugiere en
 * qué etapa del embudo está el cliente usando gpt-5.4-mini. NO mueve al
 * contacto: solo guarda una sugerencia (sugerenciaStageId + razón) que el
 * agente confirma o descarta desde la UI.
 *
 * Throttle: no reclasifica la misma conversación si se clasificó hace < 5 min
 * (salvo `force`, que usa el botón manual on-demand).
 */

const OPENAI_MODEL = "gpt-4o-mini";
const THROTTLE_MS = 5 * 60_000;

export type ClassifyResult = {
  stageId: string;
  stageNombre: string;
  stageColor: string;
  razon: string;
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
): Promise<{ etapa: string; razon: string } | null> {
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
    };
  } catch {
    return null;
  }
}

/**
 * Clasifica un contacto y guarda la sugerencia. Devuelve la sugerencia
 * generada, o null si no hubo (sin etapas, throttle, sin señales claras, o la
 * IA coincide con la etapa actual).
 */
export async function classifyContact(
  businessId: string,
  instanciaId: string,
  uidUsuario: string,
  canal: string,
  opts?: { force?: boolean },
): Promise<ClassifyResult> {
  try {
    // Etapas del negocio (con descripción)
    const stages = await prisma.funnelStage.findMany({
      where: { businessId },
      orderBy: { orden: "asc" },
      select: { id: true, nombre: true, color: true, descripcion: true },
    });
    if (stages.length === 0) return null;

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
      "En ese caso: etapaDetectada = etapa actual, cambioEtapa=false.";

    const user =
      `Etapas del embudo (en orden):\n${stageList}\n\n` +
      (lastMsgContext ? `${lastMsgContext}\n\n` : "") +
      `Conversación (del más antiguo al más reciente):\n${transcript.slice(0, 8000)}\n\n` +
      `Devuelve JSON: {"etapa":"<nombre EXACTO de una etapa de la lista, o NINGUNA>","razon":"<máximo una frase en español>"}`;

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

    // Si la IA respondió (aunque sea "NINGUNA") actualizamos la sugerencia.
    // Si falló (result null = API caída o parse inválido) NO tocamos la
    // sugerencia previa: solo marcamos clasificadoAt para el throttle.
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
