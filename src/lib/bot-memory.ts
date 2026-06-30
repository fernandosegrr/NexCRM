import { n8nPool } from "@/lib/n8n";

/**
 * Inserta un turno en la tabla de memoria del bot (BD de n8n, LangChain Postgres
 * Chat Memory). Solo debe llamarse cuando el bot NO va a registrar ese turno por
 * su cuenta (sigue activo → su propio nodo de memoria ya lo graba al pasar por
 * el AI Agent), para no duplicar entradas.
 *
 * Nombre de tabla validado por regex (no es input de usuario final, pero se
 * arma el INSERT con interpolación directa porque pg no parametriza identificadores).
 */
export async function insertBotMemory(
  tablaMemoria: string,
  uidUsuario: string,
  canal: string,
  type: "ai" | "human",
  text: string,
): Promise<void> {
  if (!/^[a-zA-Z0-9_]+$/.test(tablaMemoria)) return;
  const sessionId =
    canal === "whatsapp" ? `${uidUsuario}@s.whatsapp.net` : uidUsuario;
  await n8nPool.query(
    `INSERT INTO "${tablaMemoria}" (session_id, message) VALUES ($1, $2)`,
    [sessionId, JSON.stringify({ type, content: text })],
  );
}
