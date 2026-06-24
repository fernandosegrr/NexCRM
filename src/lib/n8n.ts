import { Pool } from "pg";

/**
 * Acceso directo (raw) a la BD de n8n, únicamente a la tabla `ESTATUS`.
 * Esta BD NO se migra ni se modifica su esquema desde el CRM: solo se
 * lee y se hace upsert de filas para activar/pausar el bot por contacto.
 *
 * Se usa `pg` (no Prisma) para esta conexión por robustez en el build
 * standalone de Docker y porque el acceso es de una sola tabla (raw access).
 *
 * Estructura real confirmada de la tabla:
 *   "ESTATUS"( id_registro int PK, "ID" text, "Instancia" text, "Estatus" text )
 *   - "Estatus" = '/on' (bot activo) | '/off' (bot pausado)
 *   - En WhatsApp el "ID" puede venir como JID completo (e.g. 521...@s.whatsapp.net),
 *     por eso el match compara la parte previa a '@'.
 */
const globalForN8n = globalThis as unknown as { n8nPool?: Pool };

export const n8nPool =
  globalForN8n.n8nPool ??
  new Pool({
    connectionString: process.env.N8N_DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForN8n.n8nPool = n8nPool;
}

const ON = "/on";
const OFF = "/off";

// Coincide por instancia y por el "ID" tolerando el sufijo @… de WhatsApp.
const MATCH = `"Instancia" = $1 AND (split_part("ID", '@', 1) = split_part($2, '@', 1) OR "ID" = $2)`;

/**
 * Lee el estado del bot para un contacto.
 * Sin registro o '/on' → activo (true). '/off' → pausado (false).
 */
export async function getBotStatus(
  instanciaId: string,
  uidUsuario: string,
): Promise<boolean> {
  const { rows } = await n8nPool.query<{ Estatus: string }>(
    `SELECT "Estatus" FROM "ESTATUS" WHERE ${MATCH} ORDER BY id_registro DESC LIMIT 1`,
    [instanciaId, uidUsuario],
  );
  if (rows.length === 0) return true;
  return rows[0].Estatus !== OFF;
}

/**
 * Activa o pausa el bot para un contacto (upsert manual: la tabla no
 * tiene índice único sobre ("ID","Instancia"), así que buscamos y
 * actualizamos por PK, o insertamos si no existe).
 */
export async function setBotStatus(
  instanciaId: string,
  uidUsuario: string,
  activo: boolean,
): Promise<void> {
  const estatus = activo ? ON : OFF;
  const found = await n8nPool.query<{ id_registro: number }>(
    `SELECT id_registro FROM "ESTATUS" WHERE ${MATCH} ORDER BY id_registro DESC LIMIT 1`,
    [instanciaId, uidUsuario],
  );

  if (found.rows.length > 0) {
    await n8nPool.query(`UPDATE "ESTATUS" SET "Estatus" = $1 WHERE id_registro = $2`, [
      estatus,
      found.rows[0].id_registro,
    ]);
  } else {
    await n8nPool.query(
      `INSERT INTO "ESTATUS" ("ID", "Instancia", "Estatus") VALUES ($1, $2, $3)`,
      [uidUsuario, instanciaId, estatus],
    );
  }
}
