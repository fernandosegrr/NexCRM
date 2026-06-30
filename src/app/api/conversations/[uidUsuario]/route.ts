import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getConversationMessages,
  instanceBelongsToBusiness,
} from "@/lib/data";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { uidUsuario: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let uidUsuario: string;
  try {
    uidUsuario = decodeURIComponent(params.uidUsuario);
  } catch {
    return NextResponse.json({ error: "uid inválido" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const instanciaId = searchParams.get("instanciaId") ?? "";
  if (!instanciaId) {
    return NextResponse.json(
      { error: "instanciaId requerido" },
      { status: 400 },
    );
  }

  let businessId: string;

  if (session.user.rol === "CLIENTE") {
    if (!session.user.businessId) {
      return NextResponse.json({ messages: [] });
    }
    businessId = session.user.businessId;
    const ok = await instanceBelongsToBusiness(instanciaId, businessId);
    if (!ok) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  } else {
    // ADMIN: deriva el negocio desde la instancia
    const inst = await prisma.businessInstance.findFirst({
      where: { instanciaId },
      select: { businessId: true },
    });
    if (!inst) return NextResponse.json({ messages: [] });
    businessId = inst.businessId;
  }

  try {
    const messages = await getConversationMessages(
      businessId,
      instanciaId,
      uidUsuario,
    );
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar los mensajes" },
      { status: 500 },
    );
  }
}
