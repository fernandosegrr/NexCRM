import { prisma } from "@/lib/prisma";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";

async function sendWaText(instanciaId: string, phone: string, texto: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(instanciaId)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: phone,
          text: texto,
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

// Presupuesto de tiempo por tick. Debe quedar holgura bajo maxDuration (60s)
// para que el bloque finally SIEMPRE alcance a liberar el lock `procesando`.
const BUDGET_MS = 45_000;
// Margen reservado para el envío en curso (timeout fetch = 8s) + escritura DB.
const SEND_MARGIN_MS = 10_000;

async function processCampaign(campaignId: string): Promise<void> {
  // Lock atómico — si otro cron ya tiene esta campaña, updateMany afecta 0 filas
  const locked = await prisma.campaign.updateMany({
    where: { id: campaignId, procesando: false, estado: "enviando" },
    data: { procesando: true },
  });
  if (locked.count === 0) return;

  const startedAt = Date.now();

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        mensaje: true,
        instanciaId: true,
        filtroEtapa: true,
        totalContactos: true,
        contactoActual: true,
        delayMin: true,
        delayMax: true,
        businessId: true,
        estado: true,
      },
    });

    if (!campaign || campaign.estado === "cancelada") return;
    if (!campaign.instanciaId) return;

    // Pool de contactos disponibles desde el cursor. Orden ESTABLE (id) para que
    // skip/take sea consistente entre ejecuciones y no salte ni repita contactos.
    let contactUids: string[];
    if (campaign.filtroEtapa) {
      const stages = await prisma.contactStage.findMany({
        where: { stageId: campaign.filtroEtapa, businessId: campaign.businessId },
        include: { contact: { select: { uidUsuario: true } } },
        skip: campaign.contactoActual,
        take: 25,
        orderBy: { id: "asc" },
      });
      contactUids = stages.map((s) => s.contact.uidUsuario);
    } else {
      const contacts = await prisma.contact.findMany({
        where: { instanciaId: campaign.instanciaId },
        select: { uidUsuario: true },
        skip: campaign.contactoActual,
        take: 25,
        orderBy: { id: "asc" },
      });
      contactUids = contacts.map((c) => c.uidUsuario);
    }

    if (contactUids.length === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { estado: "completada", completadoAt: new Date() },
      });
      return;
    }

    const delayMin = Math.min(campaign.delayMin, campaign.delayMax);
    const delayMax = Math.max(campaign.delayMin, campaign.delayMax);

    let enviados = 0;
    let fallidos = 0;
    let procesados = 0;

    for (let i = 0; i < contactUids.length; i++) {
      // Re-check cancelación antes de cada envío (refleja cancelaciones en vivo)
      const current = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { estado: true },
      });
      if (current?.estado === "cancelada") break;

      // Delay aleatorio ENTRE mensajes (no antes del primero, no después del último).
      if (i > 0) {
        const delayMs = (delayMin + Math.random() * (delayMax - delayMin)) * 1000;
        // Si el delay + el envío no caben en el presupuesto, paramos este tick.
        // El siguiente cron retomará desde el cursor actualizado.
        if (Date.now() - startedAt + delayMs + SEND_MARGIN_MS > BUDGET_MS) break;
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const ok = await sendWaText(campaign.instanciaId, contactUids[i], campaign.mensaje);

      await prisma.campaignLog.create({
        data: {
          campaignId,
          uidUsuario: contactUids[i],
          estado: ok ? "enviado" : "fallido",
          error: ok ? undefined : "Evolution API rechazó el envío.",
        },
      });

      if (ok) enviados++;
      else fallidos++;
      procesados++;
    }

    // Avanzar el cursor SOLO por los contactos realmente procesados.
    const newCursor = campaign.contactoActual + procesados;

    // No marcar completada si la campaña fue cancelada durante este tick.
    const fresh = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { estado: true },
    });
    const isDone =
      fresh?.estado !== "cancelada" && newCursor >= campaign.totalContactos;

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        contactoActual: newCursor,
        enviados: { increment: enviados },
        fallidos: { increment: fallidos },
        ...(isDone ? { estado: "completada", completadoAt: new Date() } : {}),
      },
    });
  } finally {
    // Siempre liberar el lock
    await prisma.campaign.updateMany({
      where: { id: campaignId },
      data: { procesando: false },
    });
  }
}

export type CampaignsResult = { procesadas: number };

export async function runCampaignsJob(): Promise<CampaignsResult> {
  const campaigns = await prisma.campaign.findMany({
    where: { estado: "enviando", procesando: false },
    select: { id: true },
    take: 5,
  });

  await Promise.all(campaigns.map((c) => processCampaign(c.id)));

  return { procesadas: campaigns.length };
}
