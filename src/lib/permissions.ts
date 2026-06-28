export const TODOS_LOS_PERMISOS = [
  "ver_conversaciones",
  "responder_mensajes",
  "gestionar_contactos",
  "ver_embudo",
  "mover_contactos",
  "configurar_embudo",
  "ver_reportes",
  "configurar_bot",
  "gestionar_roles",
  "gestionar_usuarios",
  "email_resumen_semanal",
  "email_alertas_desconexion",
  "email_sugerencias_seguimiento",
  "gestionar_campanas",
] as const;

export type Permiso = (typeof TODOS_LOS_PERMISOS)[number];

export function hasPermission(
  user: { rol?: string; permisos?: string[] | null },
  permiso: Permiso,
): boolean {
  if (user.rol === "ADMIN") return true;
  if (user.permisos == null) return true; // sin rol asignado = acceso total (backwards compat)
  return user.permisos.includes(permiso);
}

export const PERMISOS_POR_CATEGORIA = {
  CONVERSACIONES: ["ver_conversaciones", "responder_mensajes", "gestionar_contactos"] as Permiso[],
  EMBUDO: ["ver_embudo", "mover_contactos", "configurar_embudo"] as Permiso[],
  REPORTES: ["ver_reportes"] as Permiso[],
  CONFIGURACIÓN: ["configurar_bot"] as Permiso[],
  EQUIPO: ["gestionar_roles", "gestionar_usuarios"] as Permiso[],
  CAMPAÑAS: ["gestionar_campanas"] as Permiso[],
  "EMAILS QUE RECIBE": [
    "email_resumen_semanal",
    "email_alertas_desconexion",
    "email_sugerencias_seguimiento",
  ] as Permiso[],
};

export const PERMISO_LABELS: Record<Permiso, string> = {
  ver_conversaciones: "Ver conversaciones",
  responder_mensajes: "Responder mensajes",
  gestionar_contactos: "Gestionar contactos",
  ver_embudo: "Ver embudo",
  mover_contactos: "Mover contactos",
  configurar_embudo: "Configurar embudo",
  ver_reportes: "Ver reportes",
  configurar_bot: "Configurar bot",
  gestionar_roles: "Gestionar roles",
  gestionar_usuarios: "Gestionar usuarios",
  gestionar_campanas: "Gestionar campañas",
  email_resumen_semanal: "Recibir resumen semanal",
  email_alertas_desconexion: "Alertas de desconexión",
  email_sugerencias_seguimiento: "Sugerencias de seguimiento",
};
