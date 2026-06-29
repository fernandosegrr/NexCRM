"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createBusinessSchema, type CreateBusinessInput } from "@/lib/validations";
import { TODOS_LOS_PERMISOS } from "@/lib/permissions";
import { callerCan } from "@/lib/permissions-server";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.rol !== "ADMIN") return null;
  return session;
}

async function requireSession() {
  const session = await auth();
  if (!session?.user) return null;
  return session;
}

/** ADMIN, o CLIENTE dueño del negocio indicado. */
async function requireBusinessAccess(businessId: string) {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.rol === "ADMIN") return session;
  if (session.user.businessId === businessId) return session;
  return null;
}

/** Revalida las vistas donde aparece el embudo (admin y dashboard cliente). */
function revalidateFunnelViews(businessId: string) {
  revalidatePath(`/admin/negocios/${businessId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/embudo");
}

const DEFAULT_FUNNEL_STAGES = [
  {
    nombre: "Nuevo Lead",
    orden: 1,
    color: "#6366F1",
    descripcion:
      "Primer contacto. El cliente acaba de escribir por primera vez y aún no muestra una intención clara de compra.",
  },
  {
    nombre: "Interesado",
    orden: 2,
    color: "#F59E0B",
    descripcion:
      "Mostró interés real: preguntó por precios, disponibilidad, características o detalles de un producto o servicio.",
  },
  {
    nombre: "En Negociación",
    orden: 3,
    color: "#3B82F6",
    descripcion:
      "Se le envió una cotización o propuesta concreta y está evaluando, comparando o negociando precio/condiciones.",
  },
  {
    nombre: "Listo para Cerrar",
    orden: 4,
    color: "#8B5CF6",
    descripcion:
      "Señales claras de compra: pidió datos de pago, confirmó que quiere proceder, solo falta concretar la venta.",
  },
  {
    nombre: "Cliente",
    orden: 5,
    color: "#10B981",
    descripcion: "Ya compró y/o pagó. Venta cerrada con éxito (cerrado ganado).",
  },
  {
    nombre: "Perdido",
    orden: 6,
    color: "#EF4444",
    descripcion:
      "No respondió más, rechazó explícitamente la oferta o indicó que no está interesado (cerrado perdido).",
  },
] as const;

export async function createBusiness(
  input: CreateBusinessInput,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };

  const parsed = createBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { nombre, plan, instancias } = parsed.data;
  const canales = Array.from(new Set(instancias.map((i) => i.canal)));

  try {
    const business = await prisma.business.create({
      data: {
        nombre,
        plan: plan ?? "basico",
        canales,
        instancias: {
          create: instancias.map((i) => ({
            canal: i.canal,
            instanciaId: i.instanciaId.trim(),
          })),
        },
      },
      select: { id: true },
    });

    // Seed de etapas por defecto
    try {
      await prisma.funnelStage.createMany({
        data: DEFAULT_FUNNEL_STAGES.map((s) => ({
          ...s,
          businessId: business.id,
        })),
      });
    } catch {
      // No crítico — el negocio ya fue creado
    }

    // Seed de roles por defecto
    try {
      const propietario = await prisma.businessRole.create({
        data: {
          businessId: business.id,
          nombre: "Propietario",
          permisos: [...TODOS_LOS_PERMISOS],
        },
        select: { id: true },
      });
      await Promise.all([
        prisma.businessRole.create({
          data: {
            businessId: business.id,
            nombre: "Agente",
            permisos: [
              "ver_conversaciones",
              "responder_mensajes",
              "gestionar_contactos",
              "ver_embudo",
              "mover_contactos",
              "email_sugerencias_seguimiento",
            ],
          },
        }),
        prisma.businessRole.create({
          data: {
            businessId: business.id,
            nombre: "Visor",
            permisos: [
              "ver_conversaciones",
              "ver_embudo",
              "ver_reportes",
              "email_resumen_semanal",
            ],
          },
        }),
        // Asignar primer CLIENTE del negocio al rol Propietario
        prisma.user.updateMany({
          where: { businessId: business.id, rol: "CLIENTE" },
          data: { businessRoleId: propietario.id },
        }),
      ]);
    } catch {
      // No crítico — los roles se pueden crear manualmente
    }

    revalidatePath("/admin/negocios");
    return { ok: true, id: business.id };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok: false,
        error: "Ya existe una instancia con ese ID en ese canal.",
      };
    }
    return { ok: false, error: "No se pudo crear el negocio." };
  }
}

export async function setBusinessActivo(
  id: string,
  activo: boolean,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };
  try {
    await prisma.business.update({ where: { id }, data: { activo } });
    revalidatePath("/admin/negocios");
    revalidatePath(`/admin/negocios/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el negocio." };
  }
}

export async function updateBusiness(
  id: string,
  data: { plan: "basico" | "pro"; tablaMemoria?: string | null },
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };
  try {
    await prisma.business.update({
      where: { id },
      data: {
        plan: data.plan,
        tablaMemoria: data.tablaMemoria?.trim() || null,
      },
    });
    revalidatePath("/admin/negocios");
    revalidatePath(`/admin/negocios/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el negocio." };
  }
}

export async function updateBusinessTablaMemoria(
  id: string,
  tablaMemoria: string | null,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };
  try {
    await prisma.business.update({
      where: { id },
      data: { tablaMemoria: tablaMemoria?.trim() || null },
    });
    revalidatePath(`/admin/negocios/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la tabla de memoria." };
  }
}

// ── Funnel stages ────────────────────────────────────────────────────────

export type FunnelStageInput = {
  nombre: string;
  color: string;
  descripcion?: string | null;
  mensajeSeguimiento?: string | null;
};

export async function createFunnelStage(
  businessId: string,
  input: FunnelStageInput,
): Promise<ActionResult> {
  if (!(await requireBusinessAccess(businessId)))
    return { ok: false, error: "No autorizado." };
  if (!input.nombre.trim()) return { ok: false, error: "El nombre es requerido." };

  try {
    const maxOrden = await prisma.funnelStage.aggregate({
      where: { businessId },
      _max: { orden: true },
    });
    const nextOrden = (maxOrden._max.orden ?? 0) + 1;

    const stage = await prisma.funnelStage.create({
      data: {
        businessId,
        nombre: input.nombre.trim(),
        color: input.color,
        descripcion: input.descripcion?.trim() || null,
        mensajeSeguimiento: input.mensajeSeguimiento ?? null,
        orden: nextOrden,
      },
      select: { id: true },
    });
    revalidateFunnelViews(businessId);
    return { ok: true, id: stage.id };
  } catch {
    return { ok: false, error: "No se pudo crear la etapa." };
  }
}

export async function updateFunnelStage(
  stageId: string,
  input: FunnelStageInput,
): Promise<ActionResult> {
  if (!input.nombre.trim()) return { ok: false, error: "El nombre es requerido." };

  try {
    const existing = await prisma.funnelStage.findUnique({
      where: { id: stageId },
      select: { businessId: true },
    });
    if (!existing) return { ok: false, error: "Etapa no encontrada." };
    if (!(await requireBusinessAccess(existing.businessId)))
      return { ok: false, error: "No autorizado." };

    await prisma.funnelStage.update({
      where: { id: stageId },
      data: {
        nombre: input.nombre.trim(),
        color: input.color,
        descripcion: input.descripcion?.trim() || null,
        mensajeSeguimiento: input.mensajeSeguimiento ?? null,
      },
    });
    revalidateFunnelViews(existing.businessId);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la etapa." };
  }
}

/**
 * Elimina una etapa. Si `moveToStageId` se indica, reasigna sus contactos a esa
 * etapa antes de borrar; si es null, los deja sin etapa.
 */
export async function deleteFunnelStage(
  stageId: string,
  moveToStageId?: string | null,
): Promise<ActionResult> {
  try {
    const stage = await prisma.funnelStage.findUnique({
      where: { id: stageId },
      select: { businessId: true },
    });
    if (!stage) return { ok: false, error: "Etapa no encontrada." };
    if (!(await requireBusinessAccess(stage.businessId)))
      return { ok: false, error: "No autorizado." };

    if (moveToStageId) {
      // Validar que la etapa destino pertenece al mismo negocio
      const dest = await prisma.funnelStage.findUnique({
        where: { id: moveToStageId },
        select: { businessId: true },
      });
      if (!dest || dest.businessId !== stage.businessId) {
        return { ok: false, error: "Etapa destino inválida." };
      }
      // Reasignar los contactos a la etapa destino
      await prisma.contactStage.updateMany({
        where: { stageId },
        data: { stageId: moveToStageId },
      });
    } else {
      // Sin destino → los contactos quedan sin etapa
      await prisma.contactStage.deleteMany({ where: { stageId } });
    }

    await prisma.funnelStage.delete({ where: { id: stageId } });
    revalidateFunnelViews(stage.businessId);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo eliminar la etapa." };
  }
}

/** Cuántos contactos tiene asignados una etapa (para el diálogo de borrado). */
export async function countContactsInStage(stageId: string): Promise<number> {
  try {
    return await prisma.contactStage.count({ where: { stageId } });
  } catch {
    return 0;
  }
}

export async function reorderFunnelStages(
  businessId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  if (!(await requireBusinessAccess(businessId)))
    return { ok: false, error: "No autorizado." };

  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.funnelStage.update({
          where: { id },
          data: { orden: index + 1 },
        }),
      ),
    );
    revalidateFunnelViews(businessId);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo reordenar las etapas." };
  }
}

export async function upsertContactStage(
  instanciaId: string,
  uidUsuario: string,
  canal: string,
  businessId: string,
  stageId: string | null,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "No autorizado." };

  // Un CLIENTE solo puede tocar contactos de su propio negocio.
  if (
    session.user.rol !== "ADMIN" &&
    session.user.businessId !== businessId
  ) {
    return { ok: false, error: "No autorizado." };
  }

  if (!(await callerCan("mover_contactos"))) {
    return { ok: false, error: "No tienes permiso para mover contactos." };
  }

  try {
    // Si se asigna una etapa, validar que pertenece a este negocio.
    if (stageId !== null) {
      const stage = await prisma.funnelStage.findUnique({
        where: { id: stageId },
        select: { businessId: true },
      });
      if (!stage || stage.businessId !== businessId) {
        return { ok: false, error: "Etapa inválida." };
      }
    }

    // Asegurar que el Contact existe antes de crear el ContactStage
    const contact = await prisma.contact.upsert({
      where: { instanciaId_uidUsuario: { instanciaId, uidUsuario } },
      create: { uidUsuario, instanciaId, canal },
      update: {},
      select: { id: true },
    });

    if (stageId === null) {
      await prisma.contactStage.deleteMany({
        where: { contactId: contact.id, businessId },
      });
    } else {
      await prisma.contactStage.upsert({
        where: { contactId_businessId: { contactId: contact.id, businessId } },
        create: { contactId: contact.id, stageId, businessId },
        update: { stageId, asignadoAt: new Date() },
      });
    }

    // Una acción manual supersede cualquier sugerencia pendiente de la IA.
    await prisma.contact
      .update({
        where: { id: contact.id },
        data: { sugerenciaStageId: null, sugerenciaRazon: null },
      })
      .catch(() => {});

    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la etapa del contacto." };
  }
}

/**
 * Aplica la sugerencia de IA de un contacto: lo mueve a la etapa sugerida y
 * limpia la sugerencia. Reutiliza la validación de acceso de upsertContactStage.
 */
export async function applyStageSuggestion(
  instanciaId: string,
  uidUsuario: string,
  canal: string,
  businessId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "No autorizado." };
  if (session.user.rol !== "ADMIN" && session.user.businessId !== businessId) {
    return { ok: false, error: "No autorizado." };
  }

  if (!(await callerCan("mover_contactos"))) {
    return { ok: false, error: "No tienes permiso para mover contactos." };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { instanciaId_uidUsuario: { instanciaId, uidUsuario } },
      select: { id: true, sugerenciaStageId: true },
    });
    if (!contact?.sugerenciaStageId) {
      return { ok: false, error: "No hay sugerencia para aplicar." };
    }

    const stage = await prisma.funnelStage.findUnique({
      where: { id: contact.sugerenciaStageId },
      select: { businessId: true },
    });
    if (!stage || stage.businessId !== businessId) {
      return { ok: false, error: "Etapa sugerida inválida." };
    }

    await prisma.contactStage.upsert({
      where: { contactId_businessId: { contactId: contact.id, businessId } },
      create: { contactId: contact.id, stageId: contact.sugerenciaStageId, businessId },
      update: { stageId: contact.sugerenciaStageId, asignadoAt: new Date() },
    });
    await prisma.contact.update({
      where: { id: contact.id },
      data: { sugerenciaStageId: null, sugerenciaRazon: null },
    });

    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo aplicar la sugerencia." };
  }
}

// ── Follow-up config ────────────────────────────────────────────────────

export type FollowUpConfigInput = {
  activo: boolean;
  modoEnvio: string;
  tiempoInactividad: number;
  maxEnviosPorDia: number;
  maxEnviosTotal: number | null;
};

export async function upsertFollowUpConfig(
  stageId: string,
  data: FollowUpConfigInput,
): Promise<ActionResult> {
  try {
    const stage = await prisma.funnelStage.findUnique({
      where: { id: stageId },
      select: { businessId: true },
    });
    if (!stage) return { ok: false, error: "Etapa no encontrada." };
    if (!(await requireBusinessAccess(stage.businessId)))
      return { ok: false, error: "No autorizado." };

    await prisma.followUpConfig.upsert({
      where: { stageId },
      create: { stageId, ...data },
      update: data,
    });
    revalidateFunnelViews(stage.businessId);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar la configuración." };
  }
}

/** Descarta la sugerencia de IA de un contacto sin aplicarla. */
export async function dismissStageSuggestion(
  instanciaId: string,
  uidUsuario: string,
  businessId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!session) return { ok: false, error: "No autorizado." };
  if (session.user.rol !== "ADMIN" && session.user.businessId !== businessId) {
    return { ok: false, error: "No autorizado." };
  }

  try {
    await prisma.contact.updateMany({
      where: { instanciaId, uidUsuario },
      data: { sugerenciaStageId: null, sugerenciaRazon: null },
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo descartar la sugerencia." };
  }
}

export async function updateModoClasificacion(
  businessId: string,
  modo: "sugerencia" | "automatico",
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autorizado." };

  if (session.user.rol === "CLIENTE") {
    if (session.user.businessId !== businessId) return { ok: false, error: "No autorizado." };
    // Verificar permiso configurar_embudo desde BD (fuente de verdad)
    const canConfigure = await callerCan("configurar_embudo");
    if (!canConfigure) return { ok: false, error: "No tienes permiso para configurar el embudo." };
  }

  try {
    await prisma.business.update({
      where: { id: businessId },
      data: { modoClasificacion: modo },
    });
    revalidatePath(`/admin/negocios/${businessId}`);
    revalidatePath("/dashboard/embudo");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el modo de clasificación." };
  }
}

export async function deleteBusiness(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };

  try {
    // Contact no tiene onDelete: Cascade hacia Business (está keyed por instanciaId).
    // Borramos contactos explícitamente; sus relaciones (ContactStage, FollowUpLog, etc.)
    // sí tienen Cascade desde Contact.
    const instances = await prisma.businessInstance.findMany({
      where: { businessId: id },
      select: { instanciaId: true },
    });
    const instanciaIds = instances.map((i) => i.instanciaId);
    if (instanciaIds.length > 0) {
      await prisma.contact.deleteMany({
        where: { instanciaId: { in: instanciaIds } },
      });
    }

    // El resto (BusinessInstance, Message, FunnelStage, Campaign, PaymentConfig,
    // BusinessRole, CustomField, etc.) cascadea automáticamente.
    await prisma.business.delete({ where: { id } });

    revalidatePath("/admin/negocios");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al borrar el negocio" };
  }
}
