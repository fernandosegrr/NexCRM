import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const replySchema = z.object({
  instanciaId: z.string().min(1),
  contenido: z.string().min(1).max(4000),
});

async function sendWhatsApp(
  instanciaId: string,
  numero: string,
  texto: string,
): Promise<boolean> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!apiUrl || !apiKey) return false;
  try {
    const res = await fetch(
      `${apiUrl.replace(/\/$/, "")}/message/sendText/${instanciaId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number: numero, text: texto }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { uidUsuario: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 422 });
  }

  const { instanciaId, contenido } = parsed.data;
  const uidUsuario = decodeURIComponent(params.uidUsuario);

  const inst = await prisma.businessInstance.findFirst({
    where: { instanciaId },
    include: { business: { select: { id: true, nombre: true } } },
  });

  if (!inst) {
    return NextResponse.json({ error: "Instancia no registrada" }, { status: 404 });
  }

  if (
    session.user.rol === "CLIENTE" &&
    session.user.businessId !== inst.businessId
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let sent = false;
  if (inst.canal === "whatsapp") {
    sent = await sendWhatsApp(instanciaId, uidUsuario, contenido);
  }
  // Instagram/Messenger: solo se registra; envío requiere META_PAGE_ACCESS_TOKEN por página

  const msg = await prisma.message.create({
    data: {
      instanciaId,
      businessId: inst.businessId,
      nombreNegocio: inst.business.nombre,
      canal: inst.canal,
      uidUsuario,
      rol: "human",
      contenido,
      tipoMedia: "text",
    },
    select: { id: true, enviadoAt: true },
  });

  return NextResponse.json(
    { id: msg.id.toString(), enviadoAt: msg.enviadoAt.toISOString(), sent },
    { status: 201 },
  );
}
