import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const fields = await prisma.customField.findMany({
    where: { businessId: session.user.businessId },
    orderBy: { orden: "asc" },
    select: { id: true, nombre: true, tipo: true, opciones: true, orden: true },
  });

  return NextResponse.json({ fields });
}
