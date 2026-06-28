import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { instanciaId: string } },
) {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const instance = await prisma.businessInstance.findFirst({
    where: {
      instanciaId: params.instanciaId,
      businessId: session.user.businessId,
      canal: "whatsapp",
    },
    select: { id: true, instanciaId: true },
  });

  if (!instance) {
    return NextResponse.json({ error: "Instancia no encontrada." }, { status: 404 });
  }

  const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
  const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return NextResponse.json({ error: "Evolution API no configurada." }, { status: 500 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/instance/connect/${instance.instanciaId}`,
      {
        headers: { apikey: EVOLUTION_API_KEY },
        signal: controller.signal,
      },
    );

    const raw = (await res.json()) as Record<string, unknown>;

    if (
      (raw.instance as Record<string, unknown> | undefined)?.state === "open" ||
      (raw as Record<string, unknown>).state === "open"
    ) {
      return NextResponse.json({ connected: true });
    }

    const qrcode = raw.qrcode as Record<string, unknown> | undefined;
    const qr =
      (qrcode?.base64 as string | undefined) ??
      (qrcode?.code as string | undefined) ??
      (raw.base64 as string | undefined) ??
      (raw.qr as string | undefined) ??
      null;

    if (!qr) {
      return NextResponse.json(
        { error: "No se pudo obtener el QR. Intenta de nuevo en unos segundos." },
        { status: 502 },
      );
    }

    const cleanQr = qr.replace(/^data:image\/[a-z]+;base64,/, "");
    return NextResponse.json({ qr: cleanQr, expiraEn: 30 });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return NextResponse.json({ error: "Tiempo de espera agotado." }, { status: 504 });
    }
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
