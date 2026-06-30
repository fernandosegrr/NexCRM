import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET /api/contacts?instanciaId=X&uidUsuario=Y
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const instanciaId = searchParams.get("instanciaId") ?? "";
  const uidUsuario = searchParams.get("uidUsuario") ?? "";

  if (!instanciaId || !uidUsuario) {
    return NextResponse.json({ error: "Parámetros requeridos." }, { status: 400 });
  }

  // Verificar que la instancia pertenece al negocio de la sesión
  const ownsInstance = await prisma.businessInstance.findFirst({
    where: { instanciaId, businessId: session.user.businessId },
    select: { id: true },
  });
  if (!ownsInstance) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const contact = await prisma.contact.findFirst({
    where: { instanciaId, uidUsuario },
    include: {
      notas: {
        where: { businessId: session.user.businessId },
        orderBy: { creadoAt: "desc" },
        take: 20,
      },
      etiquetas: { where: { businessId: session.user.businessId } },
      camposCustom: {
        where: { field: { businessId: session.user.businessId } },
        include: { field: { select: { id: true, nombre: true, tipo: true, opciones: true } } },
      },
    },
  });

  if (!contact) {
    return NextResponse.json({ contact: null });
  }

  const customFields = await prisma.customField.findMany({
    where: { businessId: session.user.businessId },
    orderBy: { orden: "asc" },
    select: { id: true, nombre: true, tipo: true, opciones: true },
  });

  return NextResponse.json({
    contact: {
      id: contact.id,
      nombre: contact.nombre,
      username: contact.username,
      fotoPerfil: contact.fotoPerfil,
      canal: contact.canal,
      uidUsuario: contact.uidUsuario,
    },
    notas: contact.notas,
    etiquetas: contact.etiquetas,
    camposCustom: contact.camposCustom,
    customFields,
  });
}
