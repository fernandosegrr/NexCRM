import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";

/** Timestamp relativo estilo chat: "ahora", "hace 5 min", "ayer", "mar", "3 jun". */
export function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";

  const diffMs = Date.now() - d.getTime();
  const diffMin = diffMs / 60_000;

  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${Math.floor(diffMin)} min`;
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "ayer";

  const diffDays = diffMs / 86_400_000;
  if (diffDays < 7) return format(d, "EEE", { locale: es });
  return format(d, "d MMM", { locale: es });
}

/** Fecha y hora completas: "3 jun 2026, 14:05". */
export function fullDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "d MMM yyyy, HH:mm", { locale: es });
}

/** Solo fecha corta: "3 jun 2026". */
export function shortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "d MMM yyyy", { locale: es });
}

/** Solo hora: "14:05". */
export function timeOnly(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "HH:mm");
}

/** Etiqueta de día para separadores de chat: "Hoy", "Ayer", "3 jun 2026". */
export function dayLabel(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return "Hoy";
  if (isYesterday(d)) return "Ayer";
  return format(d, "d MMM yyyy", { locale: es });
}

/** Inicial para el avatar a partir del uid del contacto. */
export function initialOf(uid: string): string {
  const trimmed = (uid ?? "").trim();
  if (!trimmed) return "?";
  const firstAlnum = trimmed.replace(/[^a-zA-Z0-9]/g, "")[0];
  return (firstAlnum ?? trimmed[0]).toUpperCase();
}

/** Color de avatar determinístico según el uid. */
const AVATAR_COLORS = [
  "bg-indigo-500/20 text-indigo-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-pink-500/20 text-pink-300",
  "bg-amber-500/20 text-amber-300",
  "bg-sky-500/20 text-sky-300",
  "bg-violet-500/20 text-violet-300",
  "bg-rose-500/20 text-rose-300",
  "bg-teal-500/20 text-teal-300",
];

export function avatarColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash << 5) - hash + uid.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

/**
 * Uid para mostrar cuando no hay nombre/username resuelto. En WhatsApp
 * muestra solo los últimos 10 dígitos (oculta código de país); otros canales
 * se muestran tal cual. Solo para UI — el id técnico completo sigue
 * intacto en Contact.uidUsuario y en la ficha de contacto.
 */
export function displayUid(uidUsuario: string, canal: string): string {
  if (canal !== "whatsapp") return uidUsuario;
  const digits = uidUsuario.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
