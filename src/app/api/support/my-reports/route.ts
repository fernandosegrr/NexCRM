import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const reports = await prisma.bugReport.findMany({
    where: {
      businessId: session.user.businessId,
      OR: [
        { userId: session.user.id },
        ...(session.user.email ? [{ emailReporta: session.user.email }] : []),
      ],
    },
    orderBy: { creadoEn: "desc" },
    select: {
      id: true,
      tipo: true,
      descripcion: true,
      pagina: true,
      estado: true,
      creadoEn: true,
    },
  });

  return NextResponse.json({
    reports: reports.map((r) => ({
      ...r,
      creadoEn: r.creadoEn.toISOString(),
    })),
  });
}
