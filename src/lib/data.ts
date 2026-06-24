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
  enviadoAt: string;
  latenciaMs: number | null;
};

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
  lastContent: string | null;
  lastRol: string;
  lastTipoMedia: string;
  lastAt: string;
  total: number;
};

type ConversationRow = {
  instanciaId: string;
  uidUsuario: string;
  canal: string;
  lastContent: string | null;
  lastRol: string;
  lastTipoMedia: string;
  lastAt: Date;
  total: number;
};

/**
 * Lista de contactos únicos (instancia + uid) con su último mensaje y total.
 * Ordenados por último mensaje DESC. Usa DISTINCT ON de Postgres por eficiencia.
 */
export async function getConversations(
  businessId: string,
  opts?: { search?: string; take?: number; skip?: number },
): Promise<ConversationContact[]> {
  const take = Math.min(Math.max(opts?.take ?? 25, 1), 100);
  const skip = Math.max(opts?.skip ?? 0, 0);
  const search = opts?.search?.trim();
  const searchFilter = search
    ? Prisma.sql`AND m."uidUsuario" ILIKE ${"%" + search + "%"}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<ConversationRow[]>(Prisma.sql`
    SELECT
      t."instanciaId",
      t."uidUsuario",
      t."canal",
      t."contenido"  AS "lastContent",
      t."rol"        AS "lastRol",
      t."tipoMedia"  AS "lastTipoMedia",
      t."enviadoAt"  AS "lastAt",
      c.cnt          AS "total"
    FROM (
      SELECT DISTINCT ON (m."instanciaId", m."uidUsuario")
        m."instanciaId", m."uidUsuario", m."canal", m."contenido", m."rol", m."tipoMedia", m."enviadoAt"
      FROM "messages" m
      WHERE m."businessId" = ${businessId} ${searchFilter}
      ORDER BY m."instanciaId", m."uidUsuario", m."enviadoAt" DESC
    ) t
    JOIN (
      SELECT m."instanciaId", m."uidUsuario", COUNT(*)::int AS cnt
      FROM "messages" m
      WHERE m."businessId" = ${businessId} ${searchFilter}
      GROUP BY m."instanciaId", m."uidUsuario"
    ) c
      ON c."instanciaId" = t."instanciaId" AND c."uidUsuario" = t."uidUsuario"
    ORDER BY t."enviadoAt" DESC
    LIMIT ${take} OFFSET ${skip}
  `);

  return rows.map((r) => ({
    instanciaId: r.instanciaId,
    uidUsuario: r.uidUsuario,
    canal: r.canal,
    lastContent: r.lastContent,
    lastRol: r.lastRol,
    lastTipoMedia: r.lastTipoMedia,
    lastAt: r.lastAt.toISOString(),
    total: Number(r.total),
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
