import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { classifyContact } from "@/lib/funnel-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  instanciaId: z.string().min(1),
  uidUsuario: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 422 });
  }

  const { instanciaId, uidUsuario } = parsed.data;

  // Resolver el negocio de la instancia y autorizar
  const inst = await prisma.businessInstance.findFirst({
    where: { instanciaId },
    select: { businessId: true, canal: true },
  });
  if (!inst) {
    return NextResponse.json({ error: "Instancia no encontrada" }, { status: 404 });
  }
  if (session.user.rol === "CLIENTE" && session.user.businessId !== inst.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Botón manual → force: ignora el throttle
  const suggestion = await classifyContact(
    inst.businessId,
    instanciaId,
    uidUsuario,
    inst.canal,
    { force: true },
  );

  return NextResponse.json({ suggestion });
}
