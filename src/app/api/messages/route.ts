import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingMessageSchema } from "@/lib/validations";
import { normalizeTipoMedia } from "@/lib/data";
import { uploadBase64, uploadFromUrl } from "@/lib/cloudinary";
import { buscarMediaEnviada } from "@/lib/evolution-db";
import { resolveContact } from "@/lib/contact-resolver";
import { classifyContact } from "@/lib/funnel-classifier";

/** Asigna la primera etapa del embudo al primer mensaje de usuario. Sin GPT. */
async function maybeAssignFirstStage(
  businessId: string,
  instanciaId: string,
  uidUsuario: string,
  canal: string,
): Promise<boolean> {
  const count = await prisma.message.count({
    where: { businessId, instanciaId, uidUsuario, rol: "user" },
  });
  if (count !== 1) return false;

  const firstStage = await prisma.funnelStage.findFirst({
    where: { businessId },
    orderBy: { orden: "asc" },
    select: { id: true },
  });
  if (!firstStage) return false;

  const contact = await prisma.contact.upsert({
    where: { instanciaId_uidUsuario: { instanciaId, uidUsuario } },
    create: { uidUsuario, instanciaId, canal },
    update: {},
    select: { id: true },
  });

  await prisma.contactStage.upsert({
    where: { contactId_businessId: { contactId: contact.id, businessId } },
    create: { contactId: contact.id, stageId: firstStage.id, businessId },
    update: {},
  });

  return true;
}

async function auditLog(data: {
  instanciaId: string;
  canal?: string;
  uidUsuario?: string;
  rol?: string;
  contenido?: string | null;
  status: string;
  errorDetail?: string;
  messageId?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        instanciaId: data.instanciaId,
        canal: data.canal ?? null,
        uidUsuario: data.uidUsuario ?? null,
        rol: data.rol ?? null,
        contenido: data.contenido ? data.contenido.slice(0, 500) : null,
        status: data.status,
        errorDetail: data.errorDetail ?? null,
        messageId: data.messageId ?? null,
      },
    });
  } catch {
    // Non-blocking: audit failures must never break message ingestion
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ingestToken = process.env.MESSAGES_INGEST_TOKEN;
  if (ingestToken) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${ingestToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    void auditLog({ instanciaId: "unknown", status: "error_400", errorDetail: "JSON inválido" });
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = incomingMessageSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const rawInstancia =
      body && typeof body === "object" && "instanciaId" in body
        ? String((body as Record<string, unknown>).instanciaId)
        : "unknown";
    void auditLog({
      instanciaId: rawInstancia,
      status: "error_422",
      errorDetail: JSON.stringify(fieldErrors).slice(0, 500),
    });
    return NextResponse.json(
      { error: "Payload inválido", detalles: fieldErrors },
      { status: 422 },
    );
  }

  const d = parsed.data;

  try {
    const inst = await prisma.businessInstance.findFirst({
      where: { instanciaId: d.instanciaId },
      include: { business: { select: { id: true, nombre: true } } },
    });

    if (!inst) {
      void auditLog({
        instanciaId: d.instanciaId,
        canal: d.canal,
        uidUsuario: d.uidUsuario,
        rol: d.rol,
        status: "error_404",
        errorDetail: "Instancia no registrada",
      });
      return NextResponse.json(
        { error: "Instancia no registrada" },
        { status: 404 },
      );
    }

    const normalizedUid = d.uidUsuario.split("@")[0];

    // Dedup: drop identical content within 5s regardless of role (Meta echoes, webhook retries)
    if (d.contenido) {
      const since = new Date(Date.now() - 5000);
      const dup = await prisma.message.findFirst({
        where: {
          instanciaId: d.instanciaId,
          uidUsuario: normalizedUid,
          contenido: d.contenido,
          enviadoAt: { gte: since },
        },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json({ id: dup.id.toString(), deduplicated: true }, { status: 200 });
      }
    }

    // ── Captura multimedia ────────────────────────────────────────────────
    // Intentar subir el archivo antes de crear el mensaje para incluir la URL
    // directamente en metadata. Si Cloudinary falla → continuar sin URL de media.

    let resolvedMediaUrl: string | null = null;
    const normalizedTipoMedia = normalizeTipoMedia(d.tipoMedia);

    // CASO A: Usuario WA manda imagen con jpegThumbnail en base64
    if (d.mediaBase64 && d.mediaBase64.length > 0) {
      try {
        const mimetype = d.mediaMimetype ?? "image/jpeg";
        resolvedMediaUrl = await uploadBase64(d.mediaBase64, mimetype);
      } catch (err) {
        console.error("[media] Error subiendo base64 a Cloudinary:", err);
      }
    }
    // CASO B/D: Usuario IG/MS o echo del bot con URL del CDN de Meta
    else if (d.mediaMetaUrl && d.mediaMetaUrl.length > 0 && inst.metaPageAccessToken) {
      try {
        resolvedMediaUrl = await uploadFromUrl(d.mediaMetaUrl, inst.metaPageAccessToken);
      } catch (err) {
        console.error("[media] Error descargando media de Meta CDN:", err);
      }
    }

    // Construir metadata final mergeando d.metadata + url de Cloudinary.
    // d.metadata es Record<string, any> (Zod), compatible con InputJsonValue de Prisma.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalMetadata: Record<string, any> | undefined =
      d.metadata !== null && d.metadata !== undefined ? d.metadata : undefined;
    if (resolvedMediaUrl) {
      finalMetadata = { ...(d.metadata ?? {}), url: resolvedMediaUrl };
    }

    const msg = await prisma.message.create({
      data: {
        instanciaId: d.instanciaId,
        businessId: inst.businessId,
        nombreNegocio: inst.business.nombre,
        // Normaliza el canal usando el registrado en el CRM
        // (n8n puede enviar 'page'/'instagram' en body.object).
        canal: inst.canal,
        uidUsuario: normalizedUid,
        rol: d.rol,
        contenido: d.contenido ?? null,
        tipoMedia: normalizedTipoMedia,
        latenciaMs: d.latenciaMs ?? null,
        metadata: finalMetadata,
      },
      select: { id: true, enviadoAt: true },
    });

    void auditLog({
      instanciaId: d.instanciaId,
      canal: inst.canal,
      uidUsuario: normalizedUid,
      rol: d.rol,
      contenido: d.contenido,
      status: "ok",
      messageId: msg.id.toString(),
    });

    // Resolve contact name/photo on first user message (fire-and-forget)
    if (d.rol === "user") {
      void resolveContact(
        normalizedUid,
        d.instanciaId,
        inst.canal,
        inst.metaPageAccessToken,
      );

      // Primer mensaje → asignar primera etapa sin GPT.
      // Mensajes siguientes → clasificar con IA (throttle interno).
      void (async () => {
        try {
          const isFirst = await maybeAssignFirstStage(
            inst.businessId,
            d.instanciaId,
            normalizedUid,
            inst.canal,
          );
          if (!isFirst) {
            await classifyContact(inst.businessId, d.instanciaId, normalizedUid, inst.canal);
          }
        } catch {
          // Nunca bloquea ni rompe la ingesta del bot.
        }
      })();
    }

    const response = NextResponse.json({ id: msg.id.toString() }, { status: 201 });

    // CASO C: Buscar imágenes enviadas por el bot WA vía HTTP tools (fire-and-forget)
    // Solo para mensajes de bot en WhatsApp con buscarMediaEvolution activado.
    if (d.rol === "bot" && inst.canal === "whatsapp") {
      void (async () => {
        try {
          const business = await prisma.business.findUnique({
            where: { id: inst.businessId },
            select: { buscarMediaEvolution: true },
          });
          if (!business?.buscarMediaEvolution) return;

          const mediaMessages = await buscarMediaEnviada(
            d.instanciaId,
            normalizedUid,
            msg.enviadoAt,
          );

          for (const media of mediaMessages) {
            if (!media.jpegThumbnail) continue;
            try {
              const mimetype = media.mimetype ?? "image/jpeg";
              const mediaUrl = await uploadBase64(media.jpegThumbnail, mimetype);
              await prisma.message.create({
                data: {
                  instanciaId: d.instanciaId,
                  businessId: inst.businessId,
                  nombreNegocio: inst.business.nombre,
                  canal: inst.canal,
                  uidUsuario: normalizedUid,
                  rol: "bot",
                  contenido: null,
                  tipoMedia: normalizeTipoMedia(media.messageType),
                  latenciaMs: null,
                  metadata: { url: mediaUrl, fuente: "evolution-media-scan" },
                  enviadoAt: new Date(media.messageTimestamp * 1000),
                },
              });
            } catch (err) {
              console.error("[media-scan] Error procesando imagen del bot:", err);
            }
          }
        } catch (err) {
          console.error("[media-scan] Error en escaneo Evolution DB:", err);
        }
      })();
    }

    return response;
  } catch (err) {
    void auditLog({
      instanciaId: d.instanciaId,
      canal: d.canal,
      uidUsuario: d.uidUsuario,
      rol: d.rol,
      status: "error_500",
      errorDetail: err instanceof Error ? err.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Error interno al registrar el mensaje" },
      { status: 500 },
    );
  }
}
