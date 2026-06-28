import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: { instanceId: string } },
) {
  const session = await auth();
  if (!session?.user || session.user.rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const instance = await prisma.businessInstance.findUnique({
    where: { id: params.instanceId },
    select: { instanciaId: true, canal: true },
  });

  if (!instance || instance.canal !== "whatsapp") {
    return NextResponse.json({ error: "Instancia no encontrada o no es WhatsApp." }, { status: 404 });
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

    const raw = await res.json() as Record<string, unknown>;
    console.log("[QR raw]", JSON.stringify(raw));

    // Si ya está conectada
    if (
      (raw.instance as Record<string, unknown> | undefined)?.state === "open" ||
      (raw as Record<string, unknown>).state === "open"
    ) {
      return NextResponse.json({ connected: true });
    }

    // Extraer QR — diferentes versiones de Evolution API
    const qrcode = raw.qrcode as Record<string, unknown> | undefined;
    const qr =
      (qrcode?.base64 as string | undefined) ??
      (qrcode?.code as string | undefined) ??
      (raw.base64 as string | undefined) ??
      (raw.qr as string | undefined) ??
      null;

    if (!qr) {
      console.error("[QR] No se encontró el campo QR en la respuesta:", JSON.stringify(raw));
      return NextResponse.json(
        { error: "No se pudo obtener el QR. Revisa los logs del servidor." },
        { status: 502 },
      );
    }

    // Limpiar prefijo base64 si viene incluido
    const cleanQr = qr.replace(/^data:image\/[a-z]+;base64,/, "");

    return NextResponse.json({ qr: cleanQr, expiraEn: 30 });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return NextResponse.json({ error: "Timeout al conectar con Evolution API." }, { status: 504 });
    }
    console.error("[QR] Error:", err);
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
