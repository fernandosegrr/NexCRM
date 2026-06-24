import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { incomingMessageSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recibe mensajes desde n8n (sin autenticación; la seguridad recae en lo
 * difícil de adivinar del instanciaId). Nunca debe romper el flujo del bot.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = incomingMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", detalles: parsed.error.flatten().fieldErrors },
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
        uidUsuario: d.uidUsuario,
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

    return NextResponse.json({ id: msg.id.toString() }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Error interno al registrar el mensaje" },
      { status: 500 },
    );
  }
}
