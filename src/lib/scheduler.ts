import cron from "node-cron";
import { prisma } from "./prisma";

let initialized = false;

// Guard en memoria: jobs actualmente en ejecución en ESTE proceso. node-cron
// dispara cada tick aunque el callback async anterior no haya terminado, así que
// esto evita que un mismo job se solape consigo mismo dentro de la misma réplica.
const running = new Set<string>();

const MINUTE = 60_000;

// Ids de los jobs registrados en la tabla cron_executions.
const JOB_IDS = ["health-check", "follow-up", "weekly-summary", "campaigns"] as const;

/**
 * Inicializa el scheduler interno una sola vez por proceso.
 * Lo invoca src/instrumentation.ts al arrancar el servidor de Node.
 */
export function startScheduler() {
  // Evitar doble inicialización (hot reload de Next dev, múltiples registros)
  if (initialized) return;
  // En desarrollo no corre: evita envíos/emails reales al levantar `npm run dev`.
  if (process.env.NODE_ENV === "development") return;
  initialized = true;

  console.log("[Scheduler] Iniciando scheduler interno...");

  // Asegurar que existan los registros de cron (idempotente, no bloqueante).
  void ensureCronRecords();

  // ── Health check: cada 5 minutos ──────────────────────────────
  cron.schedule("*/5 * * * *", () => {
    void runJob("health-check", runHealthCheck, 4 * MINUTE);
  });

  // ── Follow-up: cada 15 minutos ────────────────────────────────
  cron.schedule("*/15 * * * *", () => {
    void runJob("follow-up", runFollowUp, 14 * MINUTE);
  });

  // ── Campaigns: cada minuto ────────────────────────────────────
  cron.schedule("* * * * *", () => {
    void runJob("campaigns", runCampaigns, 50_000);
  });

  // ── Weekly summary: lunes 8 AM México (14:00 UTC) ─────────────
  cron.schedule(
    "0 14 * * 1",
    () => {
      void runJob("weekly-summary", runWeeklySummary, 6 * 60 * MINUTE);
    },
    { timezone: "UTC" },
  );

  console.log("[Scheduler] Todos los jobs registrados ✓");
}

async function ensureCronRecords() {
  try {
    await prisma.cronExecution.createMany({
      data: JOB_IDS.map((id) => ({ id })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error("[Scheduler] No se pudieron asegurar registros de cron:", err);
  }
}

/**
 * Ejecuta un job con un claim atómico anti-doble-ejecución.
 *
 * El claim hace `updateMany` sobre cron_executions exigiendo que la última
 * ejecución sea más antigua que `minIntervalMs`. Si afecta 0 filas, otra
 * réplica/proceso ya tomó este tick (o se ejecutó hace muy poco) → se omite.
 * Esto protege contra envíos/emails duplicados si EasyPanel corre más de una
 * instancia o si un tick se solapa con el siguiente.
 */
async function runJob(
  id: string,
  fn: () => Promise<unknown>,
  minIntervalMs: number,
) {
  // 1) Guard en memoria (misma réplica): no solapar el job consigo mismo.
  if (running.has(id)) {
    console.log(`[Scheduler] Job ${id} ya en ejecución, se omite este tick.`);
    return;
  }

  // 2) Claim atómico en BD (entre réplicas): solo ejecuta si la última ejecución
  // es más antigua que minIntervalMs. Si afecta 0 filas, otra réplica lo tomó.
  const threshold = new Date(Date.now() - minIntervalMs);
  let claimed = false;
  try {
    const claim = await prisma.cronExecution.updateMany({
      where: {
        id,
        OR: [{ ultimaEjecucion: null }, { ultimaEjecucion: { lt: threshold } }],
      },
      data: { ultimaEjecucion: new Date() },
    });
    claimed = claim.count > 0;
  } catch (err) {
    console.error(`[Scheduler] Error al reclamar job ${id}:`, err);
    return;
  }

  if (!claimed) {
    // Otro proceso ya lo está ejecutando o corrió hace muy poco.
    return;
  }

  running.add(id);
  console.log(`[Scheduler] Ejecutando job: ${id}`);
  try {
    const result = await fn();
    await prisma.cronExecution.update({
      where: { id },
      data: {
        ultimaEjecucion: new Date(),
        ultimoEstado: "ok",
        ultimoResultado: truncate(JSON.stringify(result)),
      },
    });
    console.log(`[Scheduler] Job ${id} completado ✓`);
  } catch (err) {
    console.error(`[Scheduler] Job ${id} falló:`, err);
    await prisma.cronExecution
      .update({
        where: { id },
        data: {
          ultimaEjecucion: new Date(),
          ultimoEstado: "error",
          ultimoResultado: JSON.stringify({ error: String(err) }),
        },
      })
      .catch(() => {});
  } finally {
    running.delete(id);
  }
}

// El resultado de algunos jobs (p. ej. follow-up con `detalle`) puede ser
// grande; lo acotamos para no inflar la columna ni la vista de estado.
function truncate(s: string, max = 5000): string {
  return s.length > max ? `${s.slice(0, max)}…(truncado)` : s;
}

// ── Implementaciones de cada job (import dinámico: carga perezosa) ─────────────

async function runHealthCheck() {
  const { runHealthCheckJob } = await import("./jobs/health-check-job");
  return runHealthCheckJob();
}

async function runFollowUp() {
  const { runFollowUpJob } = await import("./jobs/follow-up-job");
  return runFollowUpJob();
}

async function runCampaigns() {
  const { runCampaignsJob } = await import("./jobs/campaigns-job");
  return runCampaignsJob();
}

async function runWeeklySummary() {
  const { runWeeklySummaryJob } = await import("./jobs/weekly-summary-job");
  return runWeeklySummaryJob();
}
