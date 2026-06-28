import { prisma } from "@/lib/prisma";
import {
  sendEmail,
  buildPaymentReminderHtml,
  type PaymentEmailTipo,
} from "@/lib/email";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";

export type PaymentsResult = {
  procesados: number;
  avisos: number;
  moras: number;
  suspendidos: number;
  pagosConfirmados: number;
  emails: number;
  errores: string[];
};

const MS_DAY = 86_400_000;

// Medianoche de hoy en America/Mexico_City, expresada en UTC.
// México opera en UTC-6 todo el año (sin DST desde 2022).
function startOfMexDayUtc(now: Date): Date {
  const mex = new Date(now.getTime() - 6 * 3_600_000);
  return new Date(
    Date.UTC(mex.getUTCFullYear(), mex.getUTCMonth(), mex.getUTCDate(), 6, 0, 0),
  );
}

type ConfigWithBusiness = {
  id: string;
  businessId: string;
  montoMensual: number;
  diasGracia: number;
  proximoPago: Date;
  activo: boolean;
  suspendido: boolean;
  business: { nombre: string };
};

async function yaSeEnvioHoy(businessId: string, tipo: string): Promise<boolean> {
  const inicioDia = startOfMexDayUtc(new Date());
  const count = await prisma.paymentNotification.count({
    where: { businessId, tipo, enviadoAt: { gte: inicioDia } },
  });
  return count > 0;
}

async function registrarNotificacion(
  businessId: string,
  tipo: string,
  exitoso = true,
): Promise<void> {
  await prisma.paymentNotification.create({
    data: { businessId, tipo, exitoso },
  });
}

// Usuarios que deben recibir avisos de cobro: los del negocio, activos, que tengan
// el permiso `email_alertas_desconexion` (o sin rol asignado = acceso total).
async function destinatarios(businessId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      businessId,
      activo: true,
      OR: [
        { businessRoleId: null },
        { businessRole: { permisos: { has: "email_alertas_desconexion" } } },
      ],
    },
    select: { email: true },
  });
  return users.map((u) => u.email).filter(Boolean);
}

async function enviarEmailPago(
  config: ConfigWithBusiness,
  tipo: PaymentEmailTipo,
  diasMora?: number,
): Promise<number> {
  const emails = await destinatarios(config.businessId);
  if (emails.length === 0) return 0;

  const subjectByTipo: Record<PaymentEmailTipo, string> = {
    aviso_7d: "Recordatorio: tu pago NexAI vence en 7 días",
    aviso_3d: "Recordatorio: tu pago NexAI vence en 3 días",
    aviso_1d: "Tu pago NexAI vence mañana",
    dia_vencimiento: "Tu pago NexAI vence hoy",
    mora_1d: "Tu pago NexAI está pendiente",
    mora_3d: "Tu pago NexAI sigue pendiente",
    suspendido: "Tu servicio NexAI fue suspendido",
    pago_confirmado: "¡Pago recibido! — NexAI",
  };

  const html = buildPaymentReminderHtml({
    tipo,
    businessNombre: config.business.nombre,
    monto: config.montoMensual,
    proximoPago: config.proximoPago,
    diasMora,
    diasGracia: config.diasGracia,
  });

  let sent = 0;
  for (const to of emails) {
    const ok = await sendEmail({ to, subject: subjectByTipo[tipo], html });
    if (ok) sent++;
  }
  return sent;
}

async function logoutInstancias(businessId: string): Promise<void> {
  const instancias = await prisma.businessInstance.findMany({
    where: { businessId, canal: "whatsapp", activo: true },
  });
  for (const inst of instancias) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      await fetch(`${EVOLUTION_API_URL}/instance/logout/${inst.instanciaId}`, {
        headers: { apikey: EVOLUTION_API_KEY },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
    } catch {
      /* continuar aunque falle una instancia */
    }
  }
}

/**
 * Job diario de cobros. Para cada negocio con PaymentConfig activo:
 *  - envía recordatorios 7/3/1 días antes y el día del vencimiento
 *  - envía avisos de mora a 1 y 3 días de vencido
 *  - suspende el bot (logout WA) al superar los días de gracia
 * Idempotente por día vía PaymentNotification (yaSeEnvioHoy).
 */
export async function runPaymentsJob(): Promise<PaymentsResult> {
  const result: PaymentsResult = {
    procesados: 0,
    avisos: 0,
    moras: 0,
    suspendidos: 0,
    pagosConfirmados: 0,
    emails: 0,
    errores: [],
  };

  const configs = (await prisma.paymentConfig.findMany({
    include: { business: { select: { nombre: true } } },
  })) as ConfigWithBusiness[];

  const ahora = new Date();

  for (const config of configs) {
    // PASO 1 — respetar el toggle
    if (!config.activo) continue;
    result.procesados++;

    try {
      const diasHastaVenc = Math.ceil(
        (config.proximoPago.getTime() - ahora.getTime()) / MS_DAY,
      );
      const diasDesdeVenc = -diasHastaVenc;

      // PASO 2 — recordatorios antes del vencimiento
      const avisosPrevios: { dias: number; tipo: PaymentEmailTipo }[] = [
        { dias: 7, tipo: "aviso_7d" },
        { dias: 3, tipo: "aviso_3d" },
        { dias: 1, tipo: "aviso_1d" },
        { dias: 0, tipo: "dia_vencimiento" },
      ];
      for (const { dias, tipo } of avisosPrevios) {
        if (diasHastaVenc === dias && !(await yaSeEnvioHoy(config.businessId, tipo))) {
          result.emails += await enviarEmailPago(config, tipo);
          await registrarNotificacion(config.businessId, tipo);
          result.avisos++;
        }
      }

      // PASO 3 — avisos de mora
      if (diasDesdeVenc > 0) {
        const moras: { dias: number; tipo: PaymentEmailTipo }[] = [
          { dias: 1, tipo: "mora_1d" },
          { dias: 3, tipo: "mora_3d" },
        ];
        for (const { dias, tipo } of moras) {
          if (diasDesdeVenc === dias && !(await yaSeEnvioHoy(config.businessId, tipo))) {
            result.emails += await enviarEmailPago(config, tipo, diasDesdeVenc);
            await registrarNotificacion(config.businessId, tipo);
            result.moras++;
          }
        }
      }

      // PASO 4 — suspensión automática
      if (diasDesdeVenc >= config.diasGracia && !config.suspendido) {
        await logoutInstancias(config.businessId);
        await prisma.paymentConfig.update({
          where: { id: config.id },
          data: { suspendido: true, suspendidoAt: new Date() },
        });
        result.emails += await enviarEmailPago(config, "suspendido", diasDesdeVenc);
        await sendEmail({
          to: process.env.NEXAI_ALERT_EMAIL ?? "",
          subject: `⛔ Bot suspendido — ${config.business.nombre}`,
          html: `<p>Bot de <b>${config.business.nombre}</b> suspendido por ${diasDesdeVenc} días sin pago.</p>`,
        });
        await registrarNotificacion(config.businessId, "suspendido");
        result.suspendidos++;
      }
    } catch (err) {
      result.errores.push(`${config.business.nombre}: ${String(err)}`);
    }
  }

  return result;
}
