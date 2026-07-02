import { createHmac, timingSafeEqual } from "crypto";

// El logId no requiere sesión (magic link de email) — expirarlo acota la
// ventana de exposición si el link se filtra (reenvío, logs de proxy/CDN).
export const APPROVE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isFollowUpLogExpired(creadoAt: Date): boolean {
  return Date.now() - creadoAt.getTime() > APPROVE_LINK_TTL_MS;
}

// Firma HMAC del link de aprobación. El logId solo (UUID) viaja en emails y
// URLs (historial, logs de proxy); sin firma, quien lo obtenga puede enviar
// TEXTO ARBITRARIO al cliente final por el canal del negocio (el body del
// POST acepta `mensaje` editado). El token acompaña al logId en el link y se
// valida en el endpoint: sin token válido (ni sesión), solo se permite
// aprobar el texto original o descartar — nunca texto editado.
function linkSecret(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
}

export function signFollowUpLink(logId: string): string {
  const secret = linkSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(logId).digest("hex").slice(0, 32);
}

export function verifyFollowUpLink(logId: string, token: string | null | undefined): boolean {
  if (!token || !linkSecret()) return false;
  const expected = signFollowUpLink(logId);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
