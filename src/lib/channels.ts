export type Canal = "whatsapp" | "instagram" | "messenger";

type ChannelMeta = {
  label: string;
  short: string;
  /** Clase para el chip/badge del canal */
  badgeClass: string;
  /** Clase del punto de color */
  dotClass: string;
  /** Texto de ayuda para el campo de ID de instancia */
  instanceLabel: string;
  instanceHelp: string;
  instancePlaceholder: string;
};

export const CHANNEL_META: Record<Canal, ChannelMeta> = {
  whatsapp: {
    label: "WhatsApp",
    short: "WA",
    badgeClass:
      "bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25",
    dotClass: "bg-emerald-400",
    instanceLabel: "Nombre de instancia en Evolution API",
    instanceHelp: "El nombre de la instancia tal como aparece en Evolution API.",
    instancePlaceholder: "mi-instancia-wa",
  },
  instagram: {
    label: "Instagram",
    short: "IG",
    badgeClass: "bg-instagram text-white ring-1 ring-inset ring-white/10",
    dotClass: "bg-pink-500",
    instanceLabel: "ID de página (entry[0].id del webhook)",
    instanceHelp:
      "El ID que llega en entry[0].id del webhook de Meta para esta página.",
    instancePlaceholder: "17841400000000000",
  },
  messenger: {
    label: "Messenger",
    short: "MS",
    badgeClass:
      "bg-blue-500/15 text-blue-400 ring-1 ring-inset ring-blue-500/25",
    dotClass: "bg-blue-400",
    instanceLabel: "ID de página (entry[0].id del webhook)",
    instanceHelp:
      "El ID que llega en entry[0].id del webhook de Meta para esta página.",
    instancePlaceholder: "1029384756",
  },
};

export const CANAL_LIST = Object.keys(CHANNEL_META) as Canal[];

export function isCanal(value: string): value is Canal {
  return value in CHANNEL_META;
}

export function channelMeta(canal: string): ChannelMeta {
  if (isCanal(canal)) return CHANNEL_META[canal];
  // Fallback para valores inesperados (p. ej. 'instagram'/'messenger' que
  // n8n pueda enviar con otro casing)
  const norm = canal.toLowerCase();
  if (isCanal(norm)) return CHANNEL_META[norm];
  return {
    label: canal || "Canal",
    short: (canal || "?").slice(0, 2).toUpperCase(),
    badgeClass:
      "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
    dotClass: "bg-muted-foreground",
    instanceLabel: "ID de instancia",
    instanceHelp: "",
    instancePlaceholder: "",
  };
}
