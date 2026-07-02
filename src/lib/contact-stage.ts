import { prisma } from "@/lib/prisma";

/**
 * Mueve un contacto a una etapa de forma optimista: si otra escritura con un
 * `decidedAt` más reciente ya ganó la carrera, esta se descarta en vez de
 * pisarla. classifyContact (fire-and-forget en la ingesta de cada mensaje) y
 * follow-up-job (tick cada 15 min) pueden escribir ContactStage casi al
 * mismo tiempo para el mismo contacto — sin esto, last-write-wins podía
 * revertir silenciosamente una clasificación más reciente y correcta.
 *
 * Además, cuando `origen === 'ia'`, NUNCA pisa una asignación hecha por un
 * humano en las últimas 48h: una clasificación IA en vuelo (OpenAI puede
 * tardar segundos) siempre termina después del movimiento manual y su
 * timestamp le ganaría — la marca `asignadoPor` protege la decisión humana.
 */
const HUMAN_LOCK_MS = 48 * 60 * 60 * 1000;

export async function upsertContactStageOptimistic(
  contactId: string,
  businessId: string,
  stageId: string,
  decidedAt: Date,
  origen: "ia" | "humano" = "ia",
): Promise<void> {
  const humanLockCutoff = new Date(decidedAt.getTime() - HUMAN_LOCK_MS);
  const updated = await prisma.contactStage.updateMany({
    where: {
      contactId,
      businessId,
      asignadoAt: { lt: decidedAt },
      ...(origen === "ia"
        ? { NOT: { asignadoPor: "humano", asignadoAt: { gt: humanLockCutoff } } }
        : {}),
    },
    data: { stageId, asignadoAt: decidedAt, asignadoPor: origen },
  });
  if (updated.count > 0) return;

  // No había fila previa, ya hay una más reciente, o hay una asignación humana
  // protegida: intentar crear; si ya existe (unique contactId+businessId), la
  // existente se respeta.
  await prisma.contactStage
    .create({ data: { contactId, businessId, stageId, asignadoAt: decidedAt, asignadoPor: origen } })
    .catch(() => {});
}
