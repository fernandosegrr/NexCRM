import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { META_VERSION, metaHost } from "@/lib/meta";
import { callerCan } from "@/lib/permissions-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const replySchema = z.object({
  instanciaId: z.string().min(1),
  contenido: z.string().max(4000).optional(),
  mediaUrl: z.string().url().optional(),
  tipoMedia: z
    .enum(["text", "image", "audio", "video", "document"])
    .default("text"),
});

// ── WhatsApp (Evolution API v2) ─────────────────────────────────────────────

async function sendWhatsAppText(
  instanciaId: string,
  numero: string,
  texto: string,
): Promise<boolean> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!apiUrl || !apiKey) return false;
  try {
    const res = await fetch(
      `${apiUrl.replace(/\/$/, "")}/message/sendText/${instanciaId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: numero, text: texto }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function sendWhatsAppMedia(
  instanciaId: string,
  numero: string,
  mediaUrl: string,
  tipoMedia: string,
  caption?: string,
): Promise<boolean> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!apiUrl || !apiKey) return false;
  try {
    const res = await fetch(
      `${apiUrl.replace(/\/$/, "")}/message/sendMedia/${instanciaId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          number: numero,
          mediatype: tipoMedia, // image | video | document (NO audio)
          media: mediaUrl,
          caption: caption ?? "",
          ...(tipoMedia === "document"
            ? { fileName: mediaUrl.split("/").pop() ?? "archivo" }
            : {}),
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// Evolution v2: el audio NO va por sendMedia, tiene su propio endpoint (PTT).
async function sendWhatsAppAudio(
  instanciaId: string,
  numero: string,
  audioUrl: string,
): Promise<boolean> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!apiUrl || !apiKey) return false;
  try {
    const res = await fetch(
      `${apiUrl.replace(/\/$/, "")}/message/sendWhatsAppAudio/${instanciaId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: numero, audio: audioUrl }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ── Meta Graph API (Instagram DM + Messenger) ───────────────────────────────
// El host depende del canal: messenger → graph.facebook.com,
// instagram → graph.instagram.com (ver src/lib/meta.ts).

async function sendMetaText(
  canal: string,
  pageId: string,
  token: string,
  recipientId: string,
  texto: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://${metaHost(canal)}/${META_VERSION}/${pageId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { text: texto },
        }),
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[sendMetaText] Meta API error", { canal, status: res.status, pageId, recipientId, body: errBody });
    }
    return res.ok;
  } catch (err) {
    console.error("[sendMetaText] fetch error", { canal, pageId, recipientId, err });
    return false;
  }
}

async function sendMetaMedia(
  canal: string,
  pageId: string,
  token: string,
  recipientId: string,
  mediaUrl: string,
  tipoMedia: string,
): Promise<boolean> {
  // Meta usa "file" para documentos, el resto mapea 1:1
  const metaType = tipoMedia === "document" ? "file" : tipoMedia;
  try {
    const res = await fetch(
      `https://${metaHost(canal)}/${META_VERSION}/${pageId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: {
            attachment: {
              type: metaType,
              payload: { url: mediaUrl, is_reusable: true },
            },
          },
        }),
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[sendMetaMedia] Meta API error", { canal, status: res.status, pageId, recipientId, body: errBody });
    }
    return res.ok;
  } catch (err) {
    console.error("[sendMetaMedia] fetch error", { canal, pageId, recipientId, err });
    return false;
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { uidUsuario: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 422 });
  }

  const { instanciaId, contenido, mediaUrl, tipoMedia } = parsed.data;

  if (!contenido && !mediaUrl) {
    return NextResponse.json(
      { error: "Se requiere contenido o mediaUrl" },
      { status: 422 },
    );
  }

  const uidUsuario = decodeURIComponent(params.uidUsuario);

  const inst = await prisma.businessInstance.findFirst({
    where: { instanciaId },
    include: { business: { select: { id: true, nombre: true } } },
  });

  if (!inst) {
    return NextResponse.json({ error: "Instancia no registrada" }, { status: 404 });
  }

  if (
    session.user.rol === "CLIENTE" &&
    session.user.businessId !== inst.businessId
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!(await callerCan("responder_mensajes"))) {
    return NextResponse.json(
      { error: "No tienes permiso para responder mensajes." },
      { status: 403 },
    );
  }

  // Instagram DM API: solo texto e imágenes
  if (inst.canal === "instagram" && (tipoMedia === "audio" || tipoMedia === "document")) {
    return NextResponse.json(
      { error: `Instagram no admite envío de ${tipoMedia === "audio" ? "audio" : "documentos"} desde la API de mensajería` },
      { status: 422 },
    );
  }
  // Messenger API: no soporta documentos
  if (inst.canal === "messenger" && tipoMedia === "document") {
    return NextResponse.json(
      { error: "Messenger no admite envío de documentos desde la API de mensajería" },
      { status: 422 },
    );
  }

  let sent = false;
  let noToken = false;
  const isMedia = !!mediaUrl && tipoMedia !== "text";

  if (inst.canal === "whatsapp") {
    if (!isMedia) {
      sent = await sendWhatsAppText(instanciaId, uidUsuario, contenido!);
    } else if (tipoMedia === "audio") {
      sent = await sendWhatsAppAudio(instanciaId, uidUsuario, mediaUrl!);
    } else {
      sent = await sendWhatsAppMedia(instanciaId, uidUsuario, mediaUrl!, tipoMedia, contenido);
    }
  } else if (inst.canal === "instagram" || inst.canal === "messenger") {
    if (!inst.metaPageAccessToken) {
      noToken = true;
    } else {
      // instanciaId = entry[0].id del webhook Meta = Page ID (Messenger) o IG User ID (Instagram)
      sent = isMedia
        ? await sendMetaMedia(inst.canal, inst.instanciaId, inst.metaPageAccessToken, uidUsuario, mediaUrl!, tipoMedia)
        : await sendMetaText(inst.canal, inst.instanciaId, inst.metaPageAccessToken, uidUsuario, contenido!);
    }
  }

  const msg = await prisma.message.create({
    data: {
      instanciaId,
      businessId: inst.businessId,
      nombreNegocio: inst.business.nombre,
      canal: inst.canal,
      uidUsuario,
      rol: "human",
      contenido: contenido ?? null,
      tipoMedia: isMedia ? tipoMedia : "text",
      ...(mediaUrl ? { metadata: { url: mediaUrl } } : {}),
    },
    select: { id: true, enviadoAt: true },
  });

  return NextResponse.json(
    {
      id: msg.id.toString(),
      enviadoAt: msg.enviadoAt.toISOString(),
      tipoMedia: isMedia ? tipoMedia : "text",
      mediaUrl: mediaUrl ?? null,
      sent,
      noToken,
    },
    { status: 201 },
  );
}
