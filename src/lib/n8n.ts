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
 *   - En WhatsApp el "ID" viene como JID completo, pero el sufijo NO es fijo:
 *     WhatsApp manda "@s.whatsapp.net" para números normales y "@lid" para
 *     contactos con id enlazado (privacidad/multi-dispositivo) — confirmado
 *     por inspección real de la tabla. Por eso el match tolera el sufijo
 *     (compara la parte previa a '@') y, al escribir, nunca se adivina un
 *     sufijo si ya existe uno — ver canonicalId() y setBotStatus().
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
const WHATSAPP_JID_SUFFIX = "@s.whatsapp.net";

// Coincide por instancia y por el "ID" tolerando el sufijo @… de WhatsApp.
const MATCH = `"Instancia" = $1 AND (split_part("ID", '@', 1) = split_part($2, '@', 1) OR "ID" = $2)`;

/**
 * Último recurso cuando no hay Contact.jidCompleto ni fila previa: reconstruye
 * "ID" asumiendo el sufijo tradicional. Puede ser incorrecto para contactos
 * "@lid" nunca vistos antes por este CRM, pero es mejor que escribir el
 * número plano (que n8n nunca encuentra bajo ningún formato).
 */
function canonicalId(canal: string, uidUsuario: string): string {
  if (canal === "whatsapp" && !uidUsuario.includes("@")) {
    return `${uidUsuario}${WHATSAPP_JID_SUFFIX}`;
  }
  return uidUsuario;
}

/**
 * Lee el estado del bot para un contacto.
 * Sin registro o '/on' → activo (true). '/off' → pausado (false).
 */
export async function getBotStatus(
  instanciaId: string,
  uidUsuario: string,
): Promise<boolean> {
  console.log("[getBotStatus] query", { instanciaId, uidUsuario });
  const { rows } = await n8nPool.query<{ Estatus: string }>(
    `SELECT "Estatus" FROM "ESTATUS" WHERE ${MATCH} ORDER BY id_registro DESC LIMIT 1`,
    [instanciaId, uidUsuario],
  );
  if (rows.length === 0) {
    console.warn("[getBotStatus] no row found for", { instanciaId, uidUsuario });
    return true;
  }
  return rows[0].Estatus !== OFF;
}

/**
 * Activa o pausa el bot para un contacto (upsert manual: la tabla no
 * tiene índice único sobre ("ID","Instancia"), así que buscamos y
 * actualizamos por PK, o insertamos si no existe).
 *
 * `canal` es necesario para saber si aplica el formato JID de WhatsApp.
 * `jidCompleto` es el JID real que WhatsApp mandó para este contacto
 * (Contact.jidCompleto, capturado en la ingesta — ver messages/route.ts).
 * Es la fuente de verdad: siempre gana sobre cualquier valor ya guardado,
 * porque corrige tanto filas nunca escritas por el CRM como filas rotas de
 * antes de este fix. Sin jidCompleto (contacto nunca visto con este campo),
 * NUNCA se sobreescribe un "ID" que ya tenga algún sufijo "@" — podría ser
 * "@lid" y no hay forma de adivinarlo correctamente; solo se repara un "ID"
 * inequívocamente roto (sin "@" en absoluto, algo que ningún JID real tiene).
 */
export async function setBotStatus(
  instanciaId: string,
  uidUsuario: string,
  activo: boolean,
  canal: string,
  jidCompleto?: string | null,
): Promise<void> {
  const estatus = activo ? ON : OFF;
  const found = await n8nPool.query<{ id_registro: number; ID: string }>(
    `SELECT id_registro, "ID" FROM "ESTATUS" WHERE ${MATCH} ORDER BY id_registro DESC LIMIT 1`,
    [instanciaId, uidUsuario],
  );

  let id: string;
  if (canal !== "whatsapp") {
    id = uidUsuario;
  } else if (jidCompleto) {
    id = jidCompleto;
  } else if (found.rows.length > 0 && found.rows[0].ID.includes("@")) {
    id = found.rows[0].ID; // ya tiene un sufijo (@lid u otro) — preservar, no adivinar
  } else {
    id = canonicalId(canal, uidUsuario); // sin fila, o fila inequívocamente rota
  }

  console.log("[setBotStatus] upsert", {
    instanciaId,
    uidUsuario,
    canal,
    id,
    estatus,
    mode: found.rows.length > 0 ? "update" : "insert",
  });

  if (found.rows.length > 0) {
    await n8nPool.query(
      `UPDATE "ESTATUS" SET "Estatus" = $1, "ID" = $2 WHERE id_registro = $3`,
      [estatus, id, found.rows[0].id_registro],
    );
  } else {
    await n8nPool.query(
      `INSERT INTO "ESTATUS" ("ID", "Instancia", "Estatus") VALUES ($1, $2, $3)`,
      [id, instanciaId, estatus],
    );
  }
}
