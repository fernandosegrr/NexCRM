import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (session.user.rol !== "ADMIN") {
    return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  }

  let body: { contenido?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const contenido = body.contenido?.trim();
  if (!contenido) {
    return NextResponse.json({ error: "La nota no puede estar vacía." }, { status: 422 });
  }

  const report = await prisma.bugReport.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });
  }

  const note = await prisma.bugReportNote.create({
    data: { bugReportId: params.id, contenido },
  });

  return NextResponse.json(
    { id: note.id, contenido: note.contenido, creadoEn: note.creadoEn.toISOString() },
    { status: 201 },
  );
}
