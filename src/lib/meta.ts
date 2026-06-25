// ── Meta Graph API — helpers compartidos ────────────────────────────────────
// Instagram y Messenger usan APIs distintas:
//   · Messenger (Facebook Login) → graph.facebook.com, token EAAW…
//   · Instagram (Instagram Login) → graph.instagram.com, token IGAA…
// El token y el endpoint NO son intercambiables entre canales.

export const META_VERSION = "v23.0";

/** Host de Graph API según el canal Meta. */
export function metaHost(canal: string): string {
  return canal === "instagram" ? "graph.instagram.com" : "graph.facebook.com";
}

/**
 * Valida un Page/IG Access Token llamando a `/me` en el host correcto.
 * Devuelve el ID (page-id o ig-scoped-id) o null si el token es inválido/expirado.
 */
export async function resolveMetaId(
  canal: string,
  token: string,
): Promise<string | null> {
  const host = metaHost(canal);
  const fields = canal === "instagram" ? "id,username" : "id,name";
  try {
    const res = await fetch(
      `https://${host}/me?fields=${fields}&access_token=${encodeURIComponent(token)}`,
    );
    const data = await res.json();
    if (data.error || !data.id) return null;
    return String(data.id);
  } catch {
    return null;
  }
}
