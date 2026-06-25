import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_MODEL = "gpt-5.4-mini";

const summarySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("conversation"),
    instanciaId: z.string().min(1),
    uidUsuario: z.string().min(1),
  }),
  z.object({
    type: z.enum(["day", "week", "month", "quarter"]),
    businessId: z.string().optional(),
  }),
]);

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY no configurado en el servidor");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content as string | undefined) ?? "Sin respuesta";
}

const SYSTEM_PROMPT =
  "Eres un asistente de CRM. Generas resúmenes claros y concisos en español de conversaciones de clientes con bots de WhatsApp, Instagram y Messenger. " +
  "Identifica: temas principales, intención del cliente, resolución alcanzada y puntos de acción pendientes. " +
  "Responde directamente con el resumen en formato de párrafos cortos, sin encabezados HTML.";

function rolLabel(rol: string) {
  if (rol === "user")  return "Cliente";
  if (rol === "bot")   return "Bot";
  if (rol === "human") return "Agente";
  return "Sistema";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = summarySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 422 });
  }

  const d = parsed.data;

  // ── Resumen de conversación individual ─────────────────────────────────
  if (d.type === "conversation") {
    const inst = await prisma.businessInstance.findFirst({
      where: { instanciaId: d.instanciaId },
      select: { businessId: true },
    });
    if (!inst) return NextResponse.json({ error: "Instancia no encontrada" }, { status: 404 });

    if (session.user.rol === "CLIENTE" && session.user.businessId !== inst.businessId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const messages = await prisma.message.findMany({
      where: { businessId: inst.businessId, instanciaId: d.instanciaId, uidUsuario: d.uidUsuario },
      orderBy: { enviadoAt: "asc" },
      take: 600,
      select: { rol: true, contenido: true, tipoMedia: true, enviadoAt: true },
    });

    if (messages.length === 0) {
      return NextResponse.json({ error: "Sin mensajes en esta conversación" }, { status: 404 });
    }

    const transcript = messages
      .map((m) => `${rolLabel(m.rol)}: ${m.contenido?.trim() || `[${m.tipoMedia}]`}`)
      .join("\n");

    const prompt =
      `Resume la siguiente conversación de soporte/ventas (${messages.length} mensajes):\n\n` +
      transcript.slice(0, 10000) +
      "\n\nIncluye: tema principal, intención del cliente, cómo se resolvió (si aplica) y acciones pendientes.";

    const summary = await callOpenAI(SYSTEM_PROMPT, prompt);
    return NextResponse.json({ summary, period: "Conversación completa", count: messages.length });
  }

  // ── Resumen por período ─────────────────────────────────────────────────
  const businessId =
    session.user.rol === "CLIENTE"
      ? session.user.businessId
      : (d.businessId ?? null);

  if (!businessId) {
    return NextResponse.json({ error: "businessId requerido para administradores" }, { status: 422 });
  }

  const now = new Date();
  let from: Date;
  let label: string;

  if (d.type === "day") {
    from = new Date(now); from.setHours(0, 0, 0, 0);
    label = "Hoy";
  } else if (d.type === "week") {
    from = new Date(now); from.setDate(now.getDate() - 7);
    label = "Últimos 7 días";
  } else if (d.type === "month") {
    from = new Date(now); from.setMonth(now.getMonth() - 1);
    label = "Último mes";
  } else {
    from = new Date(now); from.setMonth(now.getMonth() - 3);
    label = "Último trimestre";
  }

  const messages = await prisma.message.findMany({
    where: { businessId, enviadoAt: { gte: from, lte: now } },
    orderBy: { enviadoAt: "asc" },
    take: 2000,
    select: { instanciaId: true, uidUsuario: true, canal: true, rol: true, contenido: true, tipoMedia: true },
  });

  if (messages.length === 0) {
    return NextResponse.json({ summary: "No hubo conversaciones en este período.", period: label, conversations: 0 });
  }

  // Group by conversation
  const convMap = new Map<string, typeof messages>();
  for (const m of messages) {
    const key = `${m.instanciaId}::${m.uidUsuario}`;
    if (!convMap.has(key)) convMap.set(key, []);
    convMap.get(key)!.push(m);
  }

  const convBlocks = Array.from(convMap.entries())
    .slice(0, 40) // cap at 40 conversations to keep prompt manageable
    .map(([key, msgs]) => {
      const [, uid] = key.split("::");
      const canal = msgs[0].canal.toUpperCase();
      const lines = msgs
        .slice(0, 15)
        .map((m) => `${rolLabel(m.rol)}: ${m.contenido?.trim() || `[${m.tipoMedia}]`}`)
        .join("\n");
      return `[${canal} · ${uid}]\n${lines}`;
    })
    .join("\n\n---\n\n");

  const convCount = convMap.size;
  const prompt =
    `Analiza la actividad de ${convCount} conversaciones de clientes en el período "${label}":\n\n` +
    convBlocks.slice(0, 12000) +
    "\n\nProporciona: número de conversaciones, canales más activos, temas o consultas frecuentes, problemas recurrentes y recomendaciones para mejorar la atención.";

  const summary = await callOpenAI(SYSTEM_PROMPT, prompt);
  return NextResponse.json({ summary, period: label, conversations: convCount });
}
