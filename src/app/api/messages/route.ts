import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingMessageSchema } from "@/lib/validations";
import { resolveContact } from "@/lib/contact-resolver";

async function auditLog(data: {
  instanciaId: string;
  canal?: string;
  uidUsuario?: string;
  rol?: string;
  contenido?: string | null;
  status: string;
  errorDetail?: string;
  messageId?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        instanciaId: data.instanciaId,
        canal: data.canal ?? null,
        uidUsuario: data.uidUsuario ?? null,
        rol: data.rol ?? null,
        contenido: data.contenido ? data.contenido.slice(0, 500) : null,
        status: data.status,
        errorDetail: data.errorDetail ?? null,
        messageId: data.messageId ?? null,
      },
    });
  } catch {
    // Non-blocking: audit failures must never break message ingestion
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Comparación en tiempo constante (evita timing attacks sobre el token)
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Recibe mensajes desde n8n. Si MESSAGES_INGEST_TOKEN está definido, exige
 * el header `Authorization: Bearer <token>` (o `x-api-key`). Si no está
 * definido, queda abierto (seguridad por obscuridad del instanciaId).
 * Nunca debe romper el flujo del bot.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.MESSAGES_INGEST_TOKEN;
  if (expected) {
    const authz = req.headers.get("authorization") ?? "";
    const provided = authz.toLowerCase().startsWith("bearer ")
      ? authz.slice(7)
      : (req.headers.get("x-api-key") ?? "");
    if (!provided || !safeEqual(provided, expected)) {
      void auditLog({ instanciaId: "unknown", status: "error_401", errorDetail: "Token inválido" });
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    void auditLog({ instanciaId: "unknown", status: "error_400", errorDetail: "JSON inválido" });
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = incomingMessageSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const rawInstancia =
      body && typeof body === "object" && "instanciaId" in body
        ? String((body as Record<string, unknown>).instanciaId)
        : "unknown";
    void auditLog({
      instanciaId: rawInstancia,
      status: "error_422",
      errorDetail: JSON.stringify(fieldErrors).slice(0, 500),
    });
    return NextResponse.json(
      { error: "Payload inválido", detalles: fieldErrors },
      { status: 422 },
    );
  }

  const d = parsed.data;

  try {
    const inst = await prisma.businessInstance.findFirst({
      where: { instanciaId: d.instanciaId },
      include: { business: { select: { id: true, nombre: true } } },
    });

    if (!inst) {
      void auditLog({
        instanciaId: d.instanciaId,
        canal: d.canal,
        uidUsuario: d.uidUsuario,
        rol: d.rol,
        status: "error_404",
        errorDetail: "Instancia no registrada",
      });
      return NextResponse.json(
        { error: "Instancia no registrada" },
        { status: 404 },
      );
    }

    const msg = await prisma.message.create({
      data: {
        instanciaId: d.instanciaId,
        businessId: inst.businessId,
        nombreNegocio: inst.business.nombre,
        // Normaliza el canal usando el registrado en el CRM
        // (n8n puede enviar 'page'/'instagram' en body.object).
        canal: inst.canal,
        uidUsuario: d.uidUsuario.split("@")[0],
        rol: d.rol,
        contenido: d.contenido ?? null,
        tipoMedia: d.tipoMedia && d.tipoMedia.length ? d.tipoMedia : "text",
        latenciaMs: d.latenciaMs ?? null,
        metadata:
          d.metadata === null || d.metadata === undefined
            ? undefined
            : d.metadata,
      },
      select: { id: true },
    });

    void auditLog({
      instanciaId: d.instanciaId,
      canal: inst.canal,
      uidUsuario: d.uidUsuario.split("@")[0],
      rol: d.rol,
      contenido: d.contenido,
      status: "ok",
      messageId: msg.id.toString(),
    });

    // Resolve contact name/photo on first user message (fire-and-forget)
    if (d.rol === "user") {
      void resolveContact(
        d.uidUsuario.split("@")[0],
        d.instanciaId,
        inst.canal,
        inst.metaPageAccessToken,
      );
    }

    return NextResponse.json({ id: msg.id.toString() }, { status: 201 });
  } catch (err) {
    void auditLog({
      instanciaId: d.instanciaId,
      canal: d.canal,
      uidUsuario: d.uidUsuario,
      rol: d.rol,
      status: "error_500",
      errorDetail: err instanceof Error ? err.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Error interno al registrar el mensaje" },
      { status: 500 },
    );
  }
}
