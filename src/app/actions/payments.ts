"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildPaymentReminderHtml } from "@/lib/email";

export type ActionResult = { ok: boolean; error?: string; id?: string };

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.rol !== "ADMIN") return null;
  return session;
}

function revalidateBusiness(businessId: string) {
  revalidatePath(`/admin/negocios/${businessId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/negocios");
}

// Reconecta las instancias WA del negocio vía Evolution API (connect).
async function connectInstancias(businessId: string): Promise<void> {
  const instancias = await prisma.businessInstance.findMany({
    where: { businessId, canal: "whatsapp", activo: true },
  });
  for (const inst of instancias) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      await fetch(`${EVOLUTION_API_URL}/instance/connect/${inst.instanciaId}`, {
        headers: { apikey: EVOLUTION_API_KEY },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
    } catch {
      /* continuar aunque falle una instancia */
    }
  }
}

// Destinatarios de avisos de cobro: usuarios activos del negocio con el permiso
// email_alertas_desconexion (o sin rol asignado = acceso total).
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

// ── upsertPaymentConfig ─────────────────────────────────────────────────────

export async function upsertPaymentConfig(
  businessId: string,
  data: {
    montoMensual: number;
    diasGracia: number;
    proximoPago: string | Date;
    activo: boolean;
  },
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };

  const monto = Number(data.montoMensual);
  const dias = Number(data.diasGracia);
  const proximoPago = new Date(data.proximoPago);

  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "Ingresa un monto mensual válido." };
  }
  if (!Number.isFinite(dias) || dias < 1 || dias > 30) {
    return { ok: false, error: "Los días de gracia deben estar entre 1 y 30." };
  }
  if (Number.isNaN(proximoPago.getTime())) {
    return { ok: false, error: "Fecha de próximo vencimiento inválida." };
  }

  try {
    const cfg = await prisma.paymentConfig.upsert({
      where: { businessId },
      update: {
        montoMensual: monto,
        diasGracia: dias,
        proximoPago,
        activo: data.activo,
      },
      create: {
        businessId,
        montoMensual: monto,
        diasGracia: dias,
        proximoPago,
        activo: data.activo,
      },
    });
    revalidateBusiness(businessId);
    return { ok: true, id: cfg.id };
  } catch (err) {
    return { ok: false, error: `No se pudo guardar la configuración: ${String(err)}` };
  }
}

// ── togglePaymentAlerts ─────────────────────────────────────────────────────

export async function togglePaymentAlerts(
  businessId: string,
  activo: boolean,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };
  try {
    const updated = await prisma.paymentConfig.updateMany({
      where: { businessId },
      data: { activo },
    });
    if (updated.count === 0) {
      return { ok: false, error: "Este negocio aún no tiene configuración de cobro." };
    }
    revalidateBusiness(businessId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ── registerPayment ─────────────────────────────────────────────────────────

export async function registerPayment(
  businessId: string,
  data: { fechaPago: string | Date; monto: number; notas?: string },
): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado." };

  const monto = Number(data.monto);
  const fechaPago = new Date(data.fechaPago);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "Ingresa un monto válido." };
  }
  if (Number.isNaN(fechaPago.getTime())) {
    return { ok: false, error: "Fecha de pago inválida." };
  }

  try {
    const config = await prisma.paymentConfig.findUnique({
      where: { businessId },
      include: { business: { select: { nombre: true } } },
    });
    if (!config) {
      return { ok: false, error: "Configura primero el cobro mensual de este negocio." };
    }

    // Próximo vencimiento: fecha de pago + 30 días.
    const proximoPago = new Date(fechaPago.getTime() + 30 * 86_400_000);
    const periodo = proximoPago.toLocaleDateString("es-MX", {
      timeZone: "America/Mexico_City",
      month: "long",
      year: "numeric",
    });

    await prisma.payment.create({
      data: {
        configId: config.id,
        businessId,
        monto,
        periodo,
        fechaPago,
        fechaVencia: proximoPago,
        registradoPor: session.user.email ?? session.user.nombre ?? "admin",
        notas: data.notas?.trim() || null,
      },
    });

    const reactivar = config.suspendido;
    await prisma.paymentConfig.update({
      where: { id: config.id },
      data: {
        proximoPago,
        ...(reactivar ? { suspendido: false, suspendidoAt: null } : {}),
      },
    });

    // Si estaba suspendido, reconectar el bot.
    if (reactivar) await connectInstancias(businessId);

    // Email de pago confirmado a los destinatarios del negocio.
    const emails = await destinatarios(businessId);
    const html = buildPaymentReminderHtml({
      tipo: "pago_confirmado",
      businessNombre: config.business.nombre,
      monto,
      proximoPago,
      fechaPago,
    });
    for (const to of emails) {
      await sendEmail({ to, subject: "¡Pago recibido! — NexAI", html });
    }
    await prisma.paymentNotification.create({
      data: { businessId, tipo: "pago_confirmado" },
    });

    revalidateBusiness(businessId);
    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Ya existe un pago registrado para este periodo." };
    }
    return { ok: false, error: `No se pudo registrar el pago: ${String(err)}` };
  }
}

// ── reactivateBusiness ──────────────────────────────────────────────────────

export async function reactivateBusiness(businessId: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };

  try {
    const config = await prisma.paymentConfig.findUnique({
      where: { businessId },
      include: { business: { select: { nombre: true } } },
    });
    if (!config) {
      return { ok: false, error: "Este negocio no tiene configuración de cobro." };
    }

    // 1. Reconectar instancias WA.
    await connectInstancias(businessId);

    // 2. Limpiar estado de suspensión.
    await prisma.paymentConfig.update({
      where: { id: config.id },
      data: { suspendido: false, suspendidoAt: null },
    });

    // 3. Email de servicio reactivado al cliente.
    const emails = await destinatarios(businessId);
    const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="background:#16a34a;padding:20px 28px;"><p style="margin:0;color:#fff;font-size:20px;font-weight:700;">Tu servicio fue reactivado — NexAI</p>
<p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:14px;">${config.business.nombre}</p></td></tr>
<tr><td style="padding:28px;"><p style="margin:0;font-size:15px;color:#111827;line-height:1.6;">Tu asistente virtual ya está nuevamente activo. ¡Gracias por seguir con NexAI!</p></td></tr>
</table></td></tr></table></body></html>`;
    for (const to of emails) {
      await sendEmail({ to, subject: "Tu servicio NexAI fue reactivado", html });
    }
    await prisma.paymentNotification.create({
      data: { businessId, tipo: "pago_confirmado" },
    });

    revalidateBusiness(businessId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `No se pudo reactivar: ${String(err)}` };
  }
}
