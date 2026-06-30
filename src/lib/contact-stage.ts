import { prisma } from "@/lib/prisma";

/**
 * Mueve un contacto a una etapa de forma optimista: si otra escritura con un
 * `decidedAt` más reciente ya ganó la carrera, esta se descarta en vez de
 * pisarla. classifyContact (fire-and-forget en la ingesta de cada mensaje) y
 * follow-up-job (tick cada 15 min) pueden escribir ContactStage casi al
 * mismo tiempo para el mismo contacto — sin esto, last-write-wins podía
 * revertir silenciosamente una clasificación más reciente y correcta.
 */
export async function upsertContactStageOptimistic(
  contactId: string,
  businessId: string,
  stageId: string,
  decidedAt: Date,
): Promise<void> {
  const updated = await prisma.contactStage.updateMany({
    where: { contactId, businessId, asignadoAt: { lt: decidedAt } },
    data: { stageId, asignadoAt: decidedAt },
  });
  if (updated.count > 0) return;

  // No había fila previa, o ya hay una más reciente (otra escritura ganó la
  // carrera): intentar crear; si ya existe, dejar la más reciente como está.
  await prisma.contactStage
    .create({ data: { contactId, businessId, stageId, asignadoAt: decidedAt } })
    .catch(() => {});
}
