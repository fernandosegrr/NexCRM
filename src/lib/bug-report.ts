export const ESTADO_LABELS: Record<string, string> = {
  abierto: "Abierto",
  en_progreso: "En progreso",
  resuelto: "Resuelto",
  descartado: "Descartado",
};

export const ESTADO_BADGE_CLASS: Record<string, string> = {
  abierto: "border-transparent bg-amber-500/15 text-amber-500",
  en_progreso: "border-transparent bg-blue-500/15 text-blue-400",
  resuelto: "border-transparent bg-emerald-500/15 text-emerald-400",
  descartado: "border-transparent bg-muted text-muted-foreground",
};

export const PRIORIDAD_LABELS: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};

export const PRIORIDAD_BADGE_CLASS: Record<string, string> = {
  baja: "border-transparent bg-muted text-muted-foreground",
  media: "border-transparent bg-blue-500/15 text-blue-400",
  alta: "border-transparent bg-amber-500/15 text-amber-500",
  critica: "border-transparent bg-red-500/15 text-red-400",
};
