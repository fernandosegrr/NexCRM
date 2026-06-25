import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
          mediatype: tipoMedia,
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

// ── Meta Graph API (Instagram DM + Messenger) ───────────────────────────────

async function sendMetaText(
  pageId: string,
  token: string,
  recipientId: string,
  texto: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: texto },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function sendMetaMedia(
  pageId: string,
  token: string,
  recipientId: string,
  mediaUrl: string,
  tipoMedia: string,
): Promise<boolean> {
  // Meta uses "file" for documents, rest maps 1:1
  const metaType = tipoMedia === "document" ? "file" : tipoMedia;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: metaType,
              payload: { url: mediaUrl, is_reusable: true },
            },
          },
        }),
      },
    );
    return res.ok;
  } catch {
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

  let sent = false;
  const isMedia = !!mediaUrl && tipoMedia !== "text";

  if (inst.canal === "whatsapp") {
    sent = isMedia
      ? await sendWhatsAppMedia(instanciaId, uidUsuario, mediaUrl!, tipoMedia, contenido)
      : await sendWhatsAppText(instanciaId, uidUsuario, contenido!);
  } else if (
    (inst.canal === "instagram" || inst.canal === "messenger") &&
    inst.metaPageId &&
    inst.metaPageAccessToken
  ) {
    sent = isMedia
      ? await sendMetaMedia(inst.metaPageId, inst.metaPageAccessToken, uidUsuario, mediaUrl!, tipoMedia)
      : await sendMetaText(inst.metaPageId, inst.metaPageAccessToken, uidUsuario, contenido!);
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
    },
    { status: 201 },
  );
}
