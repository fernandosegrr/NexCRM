import { Pool } from "pg";

/**
 * Acceso directo a la BD de Evolution API para consultar mensajes multimedia
 * que el bot envió vía HTTP tools (invisible para n8n).
 *
 * Solo lectura — nunca se modifica el esquema de esta BD.
 * Pool separado del de n8n (N8N_DATABASE_URL).
 */
const globalForEvolution = globalThis as unknown as { evolutionPool?: Pool };

export const evolutionPool =
  globalForEvolution.evolutionPool ??
  new Pool({
    connectionString: process.env.EVOLUTION_DB_URL,
    max: 3,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForEvolution.evolutionPool = evolutionPool;
}

export interface EvolutionMediaMessage {
  messageType: string;
  mediaBase64: string | null;    // imageMessage.jpegThumbnail
  videoBase64: string | null;    // videoMessage.jpegThumbnail
  stickerBase64: string | null;  // stickerMessage.jpegThumbnail
  mimetype: string | null;
  videoMimetype: string | null;
  stickerMimetype: string | null;
  messageTimestamp: number;
}

/**
 * Busca mensajes multimedia enviados por el bot (fromMe=true) en un rango
 * de −20s / +5s alrededor de enviadoAt. Extrae jpegThumbnail (string base64)
 * de cada tipo de medio para subir a Cloudinary.
 */
export async function buscarMediaEnviada(
  instanciaId: string,
  uidUsuario: string,
  enviadoAt: Date,
): Promise<EvolutionMediaMessage[]> {
  if (!process.env.EVOLUTION_DB_URL) return [];

  const refTimestamp = Math.floor(enviadoAt.getTime() / 1000);

  try {
    const result = await evolutionPool.query<{
      messageType: string;
      mediaBase64: string | null;
      mimetype: string | null;
      videoBase64: string | null;
      videoMimetype: string | null;
      stickerBase64: string | null;
      stickerMimetype: string | null;
      messageTimestamp: number;
    }>(
      `SELECT
         "messageType",
         "message"->'imageMessage'->>'jpegThumbnail'  AS "mediaBase64",
         "message"->'imageMessage'->>'mimetype'       AS "mimetype",
         "message"->'videoMessage'->>'jpegThumbnail'  AS "videoBase64",
         "message"->'videoMessage'->>'mimetype'       AS "videoMimetype",
         "message"->'stickerMessage'->>'jpegThumbnail' AS "stickerBase64",
         "message"->'stickerMessage'->>'mimetype'     AS "stickerMimetype",
         "messageTimestamp"
       FROM "Message"
       WHERE "instanceId" = (
         SELECT id FROM "Instance" WHERE name = $1 LIMIT 1
       )
       AND split_part("key"->>'remoteJid', '@', 1)
           = split_part($2, '@', 1)
       AND "key"->>'fromMe' = 'true'
       AND "messageType" IN (
         'imageMessage','videoMessage','audioMessage',
         'documentMessage','stickerMessage'
       )
       AND "messageTimestamp" BETWEEN ($3 - 20) AND ($3 + 5)
       ORDER BY "messageTimestamp" ASC
       LIMIT 1`,
      [instanciaId, uidUsuario, refTimestamp],
    );

    return result.rows.map((row) => ({
      messageType: row.messageType,
      mediaBase64: row.mediaBase64,
      videoBase64: row.videoBase64,
      stickerBase64: row.stickerBase64,
      mimetype: row.mimetype,
      videoMimetype: row.videoMimetype,
      stickerMimetype: row.stickerMimetype,
      messageTimestamp: Number(row.messageTimestamp),
    }));
  } catch (err) {
    console.error("[evolution-db] Error consultando media del bot:", err);
    return [];
  }
}
