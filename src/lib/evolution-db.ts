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
  jpegThumbnail: string | null; // base64
  mimetype: string | null;
  messageTimestamp: number; // Unix timestamp
}

/**
 * Busca mensajes multimedia enviados por el bot (fromMe=true) en un rango
 * de −20s / +5s alrededor de enviadoAt. Cubre las imágenes enviadas por el
 * AI Agent antes de que llegue el mensaje de texto final (CRM fin).
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
      message: Record<string, unknown>;
      messageTimestamp: number;
    }>(
      `SELECT "messageType", "message", "messageTimestamp"
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
       ORDER BY "messageTimestamp" ASC`,
      [instanciaId, uidUsuario, refTimestamp],
    );

    return result.rows.map((row) => {
      const msg = row.message as Record<string, Record<string, unknown>>;
      const mediaKey = row.messageType;
      const mediaObj = msg[mediaKey] ?? {};

      return {
        messageType: row.messageType,
        jpegThumbnail: (mediaObj.jpegThumbnail as string) ?? null,
        mimetype: (mediaObj.mimetype as string) ?? null,
        messageTimestamp: Number(row.messageTimestamp),
      };
    });
  } catch (err) {
    console.error("[evolution-db] Error consultando media del bot:", err);
    return [];
  }
}
