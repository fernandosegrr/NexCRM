import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeMessages(msgs: {
  id: bigint;
  instanciaId: string;
  businessId: string;
  nombreNegocio: string;
  canal: string;
  uidUsuario: string;
  rol: string;
  contenido: string | null;
  tipoMedia: string;
  enviadoAt: Date;
  latenciaMs: number | null;
  metadata: unknown;
}[]) {
  return msgs.map((m) => ({
    id: m.id.toString(),
    instanciaId: m.instanciaId,
    businessId: m.businessId,
    nombreNegocio: m.nombreNegocio,
    canal: m.canal,
    uidUsuario: m.uidUsuario,
    rol: m.rol,
    contenido: m.contenido,
    tipoMedia: m.tipoMedia,
    mediaUrl:
      m.metadata &&
      typeof m.metadata === "object" &&
      "url" in (m.metadata as object)
        ? String((m.metadata as { url: unknown }).url)
        : null,
    enviadoAt: m.enviadoAt.toISOString(),
    latenciaMs: m.latenciaMs,
  }));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("No autorizado", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sinceParam = searchParams.get("since");
  const instanciaId = searchParams.get("instanciaId") ?? undefined;
  const uidUsuario = searchParams.get("uidUsuario") ?? undefined;

  // CLIENTE uses session businessId; ADMIN passes businessId as query param
  let businessId: string;
  if (session.user.rol === "CLIENTE") {
    if (!session.user.businessId) {
      return new Response("Sin negocio asignado", { status: 400 });
    }
    businessId = session.user.businessId;
  } else {
    const bId = searchParams.get("businessId");
    if (!bId) {
      return new Response("businessId requerido", { status: 400 });
    }
    businessId = bId;
  }

  const encoder = new TextEncoder();
  let sinceDate = sinceParam ? new Date(sinceParam) : new Date();
  if (isNaN(sinceDate.getTime())) sinceDate = new Date();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial keep-alive comment
      controller.enqueue(encoder.encode(": connected\n\n"));

      const interval = setInterval(async () => {
        try {
          const msgs = await prisma.message.findMany({
            where: {
              businessId,
              enviadoAt: { gt: sinceDate },
              ...(instanciaId ? { instanciaId } : {}),
              ...(uidUsuario ? { uidUsuario } : {}),
            },
            orderBy: { enviadoAt: "asc" },
            take: 50,
          });

          if (msgs.length > 0) {
            sinceDate = msgs[msgs.length - 1].enviadoAt;
            const payload = serializeMessages(msgs);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
            );
          }
        } catch {
          // Ignore DB errors during polling — connection stays open
        }
      }, 3000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
