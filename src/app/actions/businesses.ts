"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createBusinessSchema, type CreateBusinessInput } from "@/lib/validations";

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

  const { nombre, instancias } = parsed.data;
  const canales = Array.from(new Set(instancias.map((i) => i.canal)));

  try {
    const business = await prisma.business.create({
      data: {
        nombre,
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
