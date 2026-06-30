// El logId no requiere sesión (magic link de email) — expirarlo acota la
// ventana de exposición si el link se filtra (reenvío, logs de proxy/CDN).
export const APPROVE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isFollowUpLogExpired(creadoAt: Date): boolean {
  return Date.now() - creadoAt.getTime() > APPROVE_LINK_TTL_MS;
}
