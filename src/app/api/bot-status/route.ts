import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBotStatus, setBotStatus } from "@/lib/n8n";
import { instanceBelongsToBusiness } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { botStatusSchema } from "@/lib/validations";
import type { Session } from "next-auth";

export const runtime = "nodejs";

async function authorizeInstance(
  session: Session,
  instanciaId: string,
): Promise<boolean> {
  if (session.user.rol === "ADMIN") return true;
  if (!session.user.businessId) return false;
  return instanceBelongsToBusiness(instanciaId, session.user.businessId);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const instanciaId = searchParams.get("instanciaId") ?? "";
  const uidUsuario = searchParams.get("uidUsuario") ?? "";
  if (!instanciaId || !uidUsuario) {
    return NextResponse.json(
      { error: "instanciaId y uidUsuario requeridos" },
      { status: 400 },
    );
  }

  if (!(await authorizeInstance(session, instanciaId))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const activo = await getBotStatus(instanciaId, uidUsuario);
    return NextResponse.json({ activo });
  } catch {
    // Si la BD de n8n no responde, estado desconocido (no asumir activo)
    return NextResponse.json({ activo: null, unavailable: true });
  }
}

export async function POST(req: NextRequest) {
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

  const parsed = botStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 422 });
  }

  const { instanciaId, uidUsuario, activo } = parsed.data;

  if (!(await authorizeInstance(session, instanciaId))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const [inst, contact] = await Promise.all([
    prisma.businessInstance.findFirst({
      where: { instanciaId },
      select: { canal: true },
    }),
    prisma.contact.findUnique({
      where: { instanciaId_uidUsuario: { instanciaId, uidUsuario } },
      select: { jidCompleto: true },
    }),
  ]);
  if (!inst) {
    return NextResponse.json({ error: "Instancia no registrada" }, { status: 404 });
  }

  try {
    await setBotStatus(instanciaId, uidUsuario, activo, inst.canal, contact?.jidCompleto);
    return NextResponse.json({ ok: true, activo });
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudo actualizar el estado del bot" },
      { status: 502 },
    );
  }
}
