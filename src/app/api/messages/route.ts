import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingMessageSchema } from "@/lib/validations";
import { normalizeTipoMedia } from "@/lib/data";
import { uploadBase64, uploadFromUrl } from "@/lib/cloudinary";
import { buscarMediaEnviada } from "@/lib/evolution-db";
import { resolveContact } from "@/lib/contact-resolver";
import { classifyContact } from "@/lib/funnel-classifier";
import { getBotStatus } from "@/lib/n8n";
import { insertBotMemory } from "@/lib/bot-memory";

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

/**
 * Convierte a base64 limpio para Cloudinary. Soporta:
 *   1. String base64 directo (message.base64 de Evolution API)
 *   2. Objeto Buffer {0:137,1:80,...} (jpegThumbnail si llega como Record real)
 *   3. Data URI 'data:image/jpeg;base64,...'
 * Rechaza '[object Object]' (n8n serialización errónea en keypair mode).
 */
function toBase64String(raw: unknown): string | null {
  if (!raw) return null;

  // Caso 1: string base64 directo o data URI
  if (typeof raw === "string") {
    // n8n serializa objetos como '[object Object]' en keypair mode — descartar
    if (raw === "[object Object]") return null;
    if (raw.length === 0) return null;

    // PRIMERO limpiar (\n, \r, espacios, prefijo data URI, '=' inicial), LUEGO validar
    const clean = raw
      .replace(/\s/g, "")
      .replace(/^data:[^;]+;base64,/, "")
      .replace(/^=+/, "");

    if (clean.length === 0) return null;

    if (!/^[A-Za-z0-9+/]+=*$/.test(clean)) {
      console.log("[debug] base64 inválido tras limpieza, primeros 50:", clean.substring(0, 50));
      return null;
    }

    return clean;
  }

  // Caso 2: objeto Buffer serializado {"0":137,...} (jpegThumbnail en JSON body mode)
  if (typeof raw === "object" && !Array.isArray(raw)) {
    try {
      const obj = raw as Record<string, number>;
      const keys = Object.keys(obj).filter((k) => !isNaN(Number(k)));
      if (keys.length === 0) return null;
      const bytes = keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => Number(obj[k]));
      return Buffer.from(bytes).toString("base64");
    } catch {
      return null;
    }
  }

  return null;
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
      include: { business: { select: { id: true, nombre: true, tablaMemoria: true } } },
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

    // ── Debug logs media ─────────────────────────────────────────────────
    console.log("[debug] tipoMedia recibido:", d.tipoMedia);
    console.log(
      "[debug] mediaBase64 length:",
      d.mediaBase64
        ? typeof d.mediaBase64 === "string"
          ? d.mediaBase64.length
          : Object.keys(d.mediaBase64).length
        : 0,
    );
    console.log("[debug] mediaMimetype:", d.mediaMimetype);

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
    // Convertir base64 antes de calcular tipoFinal: si llega base64 válido
    // pero tipoMedia es null/text (n8n no envió messageType), lo corregimos a 'image'.
    const cleanBase64 = toBase64String(d.mediaBase64);
    console.log("[debug] cleanBase64:", cleanBase64 ? `${cleanBase64.length} chars` : "NULL");
    const normalizedTipoMedia = normalizeTipoMedia(d.tipoMedia);
    const tipoFinal =
      (d.mediaMetaUrl?.length && normalizedTipoMedia === "text") ? "image" :
      (cleanBase64 && normalizedTipoMedia === "text") ? "image" :
      normalizedTipoMedia;

    // CASO A: Usuario WA manda imagen (base64 real de message.base64 o jpegThumbnail Buffer)
    if (cleanBase64) {
      try {
        const mimetype = d.mediaMimetype ?? "image/jpeg";
        resolvedMediaUrl = await uploadBase64(cleanBase64, mimetype);
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

    console.log("[debug] mediaUrl resultado:", resolvedMediaUrl);

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
        tipoMedia: tipoFinal,
        latenciaMs: d.latenciaMs ?? null,
        metadata: finalMetadata,
      },
      select: { id: true, enviadoAt: true, metadata: true, tipoMedia: true },
    });

    console.log("[debug] mensaje guardado id:", msg.id.toString());
    console.log("[debug] mensaje metadata:", JSON.stringify(msg.metadata));
    console.log("[debug] mensaje tipoMedia BD:", msg.tipoMedia);

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
        // JID completo (con @s.whatsapp.net o @lid) tal cual lo mandó WhatsApp —
        // se guarda para que el toggle del bot escriba ESTATUS con el mismo
        // formato exacto que n8n espera (ver src/lib/n8n.ts).
        inst.canal === "whatsapp" && d.uidUsuario.includes("@") ? d.uidUsuario : null,
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

      // Si el bot está pausado, su nodo de memoria (LangChain) nunca corre para
      // este mensaje → lo registramos nosotros. Si está activo, el propio flujo
      // de n8n ya lo graba al pasar por el AI Agent (no duplicar).
      if (d.contenido && inst.business.tablaMemoria) {
        void (async () => {
          try {
            const activo = await getBotStatus(d.instanciaId, normalizedUid);
            if (!activo) {
              await insertBotMemory(
                inst.business.tablaMemoria!,
                normalizedUid,
                inst.canal,
                "human",
                d.contenido!,
              );
            }
          } catch (err) {
            console.error("[bot-memory] Error registrando mensaje entrante:", err);
          }
        })();
      }
    }

    const response = NextResponse.json({ id: msg.id.toString() }, { status: 201 });

    // CASO C: Buscar imágenes enviadas por el bot WA vía HTTP tools (fire-and-forget)
    // Solo para mensajes de bot en WhatsApp con buscarMediaEvolution activado.
    if (d.rol === "bot" && inst.canal === "whatsapp") {
      console.log('[casoc] condición met — instanciaId:', d.instanciaId, 'uid:', normalizedUid);
      void (async () => {
        try {
          console.log('[casoc] iniciando búsqueda Evolution');
          console.log('[casoc] instanciaId:', d.instanciaId);
          console.log('[casoc] uidUsuario:', normalizedUid);
          console.log('[casoc] enviadoAt:', msg.enviadoAt);

          const business = await prisma.business.findUnique({
            where: { id: inst.businessId },
            select: { buscarMediaEvolution: true },
          });
          console.log('[casoc] buscarMediaEvolution:', business?.buscarMediaEvolution);
          if (!business?.buscarMediaEvolution) return;

          const mediaMessages = await buscarMediaEnviada(
            d.instanciaId,
            normalizedUid,
            msg.enviadoAt,
          );

          console.log('[casoc] mediaMessages encontrados:', mediaMessages.length);

          for (const media of mediaMessages) {
            const rawBase64 = media.mediaBase64 || media.videoBase64 || media.stickerBase64;
            console.log('[casoc] messageType:', media.messageType, '— rawBase64 length:', rawBase64?.length ?? 0);
            const cleanB64 = toBase64String(rawBase64);
            if (!cleanB64) {
              console.log('[casoc] cleanB64 null → skip');
              continue;
            }
            try {
              const mimetype =
                media.mimetype || media.videoMimetype || media.stickerMimetype || "image/jpeg";
              const mediaUrl = await uploadBase64(cleanB64, mimetype);
              console.log('[casoc] subido a Cloudinary:', mediaUrl);
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
              console.log('[casoc] mensaje multimedia guardado en BD');
            } catch (err) {
              console.error("[media-scan] Error procesando imagen del bot:", err);
            }
          }
        } catch (err) {
          console.error("[media-scan] Error en escaneo Evolution DB:", err);
        }
      })();
    } else {
      console.log('[casoc] NO aplica — rol:', d.rol, 'canal:', inst.canal);
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
