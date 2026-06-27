import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Serialización segura (BigInt → string) ──────────────────────────────
export type MessageDTO = {
  id: string;
  instanciaId: string;
  businessId: string;
  nombreNegocio: string;
  canal: string;
  uidUsuario: string;
  rol: string;
  contenido: string | null;
  tipoMedia: string;
  mediaUrl: string | null;
  enviadoAt: string;
  latenciaMs: number | null;
};

/** Extrae la URL del medio guardada en metadata.url (si existe). */
function extractMediaUrl(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "url" in metadata) {
    const u = (metadata as { url?: unknown }).url;
    return typeof u === "string" ? u : null;
  }
  return null;
}

function serializeMessage(m: {
  id: bigint;
  instanciaId: string;
  businessId: string;
  nombreNegocio: string;
  canal: string;
  uidUsuario: string;
  rol: string;
  contenido: string | null;
  tipoMedia: string;
  enviadoAt: Date;
  latenciaMs: number | null;
  metadata?: unknown;
}): MessageDTO {
  return {
    id: m.id.toString(),
    instanciaId: m.instanciaId,
    businessId: m.businessId,
    nombreNegocio: m.nombreNegocio,
    canal: m.canal,
    uidUsuario: m.uidUsuario,
    rol: m.rol,
    contenido: m.contenido,
    tipoMedia: m.tipoMedia,
    mediaUrl: extractMediaUrl(m.metadata),
    enviadoAt: m.enviadoAt.toISOString(),
    latenciaMs: m.latenciaMs,
  };
}

// ── Negocios ────────────────────────────────────────────────────────────
export async function getBusinessesWithStats() {
  const businesses = await prisma.business.findMany({
    orderBy: { creadoAt: "desc" },
    include: {
      instancias: { orderBy: { creadoAt: "asc" } },
      _count: { select: { mensajes: true, usuarios: true } },
    },
  });

  return businesses.map((b) => ({
    id: b.id,
    nombre: b.nombre,
    canales: b.canales,
    activo: b.activo,
    plan: b.plan,
    creadoAt: b.creadoAt.toISOString(),
    instancias: b.instancias.map((i) => ({
      id: i.id,
      canal: i.canal,
      instanciaId: i.instanciaId,
      activo: i.activo,
    })),
    totalMensajes: b._count.mensajes,
    totalUsuarios: b._count.usuarios,
  }));
}

export type BusinessCard = Awaited<
  ReturnType<typeof getBusinessesWithStats>
>[number];

export async function getBusinessById(id: string) {
  const b = await prisma.business.findUnique({
    where: { id },
    include: {
      instancias: { orderBy: { creadoAt: "asc" } },
      _count: { select: { mensajes: true, usuarios: true } },
    },
  });
  if (!b) return null;
  return {
    id: b.id,
    nombre: b.nombre,
    canales: b.canales,
    activo: b.activo,
    creadoAt: b.creadoAt.toISOString(),
    instancias: b.instancias.map((i) => ({
      id: i.id,
      canal: i.canal,
      instanciaId: i.instanciaId,
      activo: i.activo,
      metaPageId: i.metaPageId,
      metaHasToken: !!i.metaPageAccessToken,
      metaTokenSetAt: i.metaTokenSetAt?.toISOString() ?? null,
      metaTokenExpiresAt: i.metaTokenExpiresAt?.toISOString() ?? null,
    })),
    totalMensajes: b._count.mensajes,
    totalUsuarios: b._count.usuarios,
  };
}

export async function getBusinessesForSelect() {
  return prisma.business.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
}

export type BusinessOption = { id: string; nombre: string };

// ── Usuarios ────────────────────────────────────────────────────────────
export async function getUsersList() {
  const users = await prisma.user.findMany({
    orderBy: { creadoAt: "desc" },
    include: { business: { select: { id: true, nombre: true } } },
  });
  return users.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    activo: u.activo,
    businessId: u.businessId,
    businessNombre: u.business?.nombre ?? null,
    creadoAt: u.creadoAt.toISOString(),
  }));
}

export type UserListItem = Awaited<ReturnType<typeof getUsersList>>[number];

// ── Mensajes (tabla admin con filtros + paginación) ─────────────────────
export type MessageFilters = {
  businessId?: string;
  canal?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function getMessagesPage(filters: MessageFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);

  const where: Prisma.MessageWhereInput = {};
  if (filters.businessId) where.businessId = filters.businessId;
  if (filters.canal) where.canal = filters.canal;
  if (filters.from || filters.to) {
    where.enviadoAt = {};
    if (filters.from) where.enviadoAt.gte = filters.from;
    if (filters.to) where.enviadoAt.lte = filters.to;
  }

  const [rows, total] = await prisma.$transaction([
    prisma.message.findMany({
      where,
      orderBy: { enviadoAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.message.count({ where }),
  ]);

  return {
    rows: rows.map(serializeMessage),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ── Conversaciones (dashboard cliente) ──────────────────────────────────
export type ConversationContact = {
  instanciaId: string;
  uidUsuario: string;
  canal: string;
  businessId: string;
  lastContent: string | null;
  lastRol: string;
  lastTipoMedia: string;
  lastAt: string;
  total: number;
  nombre: string | null;
  username: string | null;
  fotoPerfil: string | null;
  stageId: string | null;
  stageNombre: string | null;
  stageColor: string | null;
  sugerenciaStageId: string | null;
  sugerenciaNombre: string | null;
  sugerenciaColor: string | null;
  sugerenciaRazon: string | null;
};

type ConversationRow = {
  instanciaId: string;
  uidUsuario: string;
  canal: string;
  businessId: string;
  lastContent: string | null;
  lastRol: string;
  lastTipoMedia: string;
  lastAt: Date;
  total: number;
  nombre: string | null;
  username: string | null;
  fotoPerfil: string | null;
  stageId: string | null;
  stageNombre: string | null;
  stageColor: string | null;
  sugerenciaStageId: string | null;
  sugerenciaNombre: string | null;
  sugerenciaColor: string | null;
  sugerenciaRazon: string | null;
};

/**
 * Lista de contactos únicos (instancia + uid) con su último mensaje y total.
 * Ordenados por último mensaje DESC. Usa DISTINCT ON de Postgres por eficiencia.
 */
export async function getConversations(
  businessId: string,
  opts?: { search?: string; take?: number; skip?: number; canal?: string },
): Promise<ConversationContact[]> {
  const take = Math.min(Math.max(opts?.take ?? 25, 1), 100);
  const skip = Math.max(opts?.skip ?? 0, 0);
  const search = opts?.search?.trim();
  const canal = opts?.canal?.trim();
  const likeSearch = "%" + search + "%";
  const searchFilter = search
    ? Prisma.sql`AND (
        m."uidUsuario" ILIKE ${likeSearch}
        OR EXISTS (
          SELECT 1 FROM "contacts" ct2
          WHERE ct2."instanciaId" = m."instanciaId"
            AND ct2."uidUsuario" = m."uidUsuario"
            AND (ct2."nombre" ILIKE ${likeSearch} OR ct2."username" ILIKE ${likeSearch})
        )
      )`
    : Prisma.empty;
  const canalFilter = canal
    ? Prisma.sql`AND m."canal" = ${canal}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<ConversationRow[]>(Prisma.sql`
    SELECT
      t."instanciaId",
      t."uidUsuario",
      t."canal",
      t."businessId",
      t."contenido"   AS "lastContent",
      t."rol"         AS "lastRol",
      t."tipoMedia"   AS "lastTipoMedia",
      t."enviadoAt"   AS "lastAt",
      c.cnt           AS "total",
      ct."nombre"     AS "nombre",
      ct."username"   AS "username",
      ct."fotoPerfil" AS "fotoPerfil",
      cs."stageId"    AS "stageId",
      fs."nombre"     AS "stageNombre",
      fs."color"      AS "stageColor",
      ct."sugerenciaStageId" AS "sugerenciaStageId",
      sg."nombre"     AS "sugerenciaNombre",
      sg."color"      AS "sugerenciaColor",
      ct."sugerenciaRazon"   AS "sugerenciaRazon"
    FROM (
      SELECT DISTINCT ON (m."instanciaId", m."uidUsuario")
        m."instanciaId", m."uidUsuario", m."canal", m."businessId",
        m."contenido", m."rol", m."tipoMedia", m."enviadoAt"
      FROM "messages" m
      WHERE m."businessId" = ${businessId} ${searchFilter} ${canalFilter}
      ORDER BY m."instanciaId", m."uidUsuario", m."enviadoAt" DESC
    ) t
    JOIN (
      SELECT m."instanciaId", m."uidUsuario", COUNT(*)::int AS cnt
      FROM "messages" m
      WHERE m."businessId" = ${businessId} ${searchFilter} ${canalFilter}
      GROUP BY m."instanciaId", m."uidUsuario"
    ) c
      ON c."instanciaId" = t."instanciaId" AND c."uidUsuario" = t."uidUsuario"
    LEFT JOIN "contacts" ct
      ON ct."instanciaId" = t."instanciaId" AND ct."uidUsuario" = t."uidUsuario"
    LEFT JOIN "contact_stages" cs
      ON cs."contactId" = ct."id" AND cs."businessId" = ${businessId}
    LEFT JOIN "funnel_stages" fs
      ON fs."id" = cs."stageId"
    LEFT JOIN "funnel_stages" sg
      ON sg."id" = ct."sugerenciaStageId"
    ORDER BY t."enviadoAt" DESC
    LIMIT ${take} OFFSET ${skip}
  `);

  return rows.map((r) => ({
    instanciaId: r.instanciaId,
    uidUsuario: r.uidUsuario,
    canal: r.canal,
    businessId: r.businessId,
    lastContent: r.lastContent,
    lastRol: r.lastRol,
    lastTipoMedia: r.lastTipoMedia,
    lastAt: r.lastAt.toISOString(),
    total: Number(r.total),
    nombre: r.nombre ?? null,
    username: r.username ?? null,
    fotoPerfil: r.fotoPerfil ?? null,
    stageId: r.stageId ?? null,
    stageNombre: r.stageNombre ?? null,
    stageColor: r.stageColor ?? null,
    sugerenciaStageId: r.sugerenciaStageId ?? null,
    sugerenciaNombre: r.sugerenciaNombre ?? null,
    sugerenciaColor: r.sugerenciaColor ?? null,
    sugerenciaRazon: r.sugerenciaRazon ?? null,
  }));
}

/** Todos los mensajes de un contacto en una instancia (orden cronológico). */
export async function getConversationMessages(
  businessId: string,
  instanciaId: string,
  uidUsuario: string,
): Promise<MessageDTO[]> {
  const msgs = await prisma.message.findMany({
    where: { businessId, instanciaId, uidUsuario },
    orderBy: { enviadoAt: "asc" },
    take: 1000,
  });
  return msgs.map(serializeMessage);
}

// ── Estado del sistema (monitor de salud) ───────────────────────────────
export type InstanceStatusCard = {
  instanceDbId: string;
  instanciaId: string;
  businessNombre: string;
  businessId: string;
  activo: boolean;
};

export async function getWhatsAppInstances(): Promise<InstanceStatusCard[]> {
  const instances = await prisma.businessInstance.findMany({
    where: { canal: "whatsapp" },
    include: { business: { select: { id: true, nombre: true } } },
    orderBy: { creadoAt: "asc" },
  });
  return instances.map((i) => ({
    instanceDbId: i.id,
    instanciaId: i.instanciaId,
    businessNombre: i.business.nombre,
    businessId: i.business.id,
    activo: i.activo,
  }));
}

export type IncidentLogEntry = {
  id: number;
  instanciaId: string;
  nombreNegocio: string | null;
  tipo: string;
  contactosSinResp: number;
  estadoEvolution: string | null;
  accion: string | null;
  resultado: string | null;
  emailEnviado: boolean;
  creadoAt: string;
  resolvedAt: string | null;
};

export async function getRecentIncidents(limit = 50): Promise<IncidentLogEntry[]> {
  const logs = await prisma.incidentLog.findMany({
    orderBy: { creadoAt: "desc" },
    take: limit,
  });
  return logs.map((l) => ({
    id: l.id,
    instanciaId: l.instanciaId,
    nombreNegocio: l.nombreNegocio,
    tipo: l.tipo,
    contactosSinResp: l.contactosSinResp,
    estadoEvolution: l.estadoEvolution,
    accion: l.accion,
    resultado: l.resultado,
    emailEnviado: l.emailEnviado,
    creadoAt: l.creadoAt.toISOString(),
    resolvedAt: l.resolvedAt?.toISOString() ?? null,
  }));
}

// ── Funnel stages ────────────────────────────────────────────────────────
export type FollowUpConfigDTO = {
  activo: boolean;
  modoEnvio: string;
  tiempoInactividad: number;
  maxEnviosPorDia: number;
  maxEnviosTotal: number | null;
};

export type FunnelStageDTO = {
  id: string;
  businessId: string;
  nombre: string;
  orden: number;
  color: string;
  descripcion: string | null;
  mensajeSeguimiento: string | null;
  followUpConfig?: FollowUpConfigDTO | null;
};

/** Verifica que una instancia pertenece a un negocio (autorización cliente). */
export async function instanceBelongsToBusiness(
  instanciaId: string,
  businessId: string,
): Promise<boolean> {
  const inst = await prisma.businessInstance.findFirst({
    where: { instanciaId, businessId },
    select: { id: true },
  });
  return !!inst;
}
