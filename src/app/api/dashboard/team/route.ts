import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const businessId = session.user.businessId;

  const [members, roles, caller] = await Promise.all([
    prisma.user.findMany({
      where: { businessId, rol: "CLIENTE" },
      select: {
        id: true,
        nombre: true,
        email: true,
        activo: true,
        businessRoleId: true,
        businessRole: { select: { nombre: true } },
      },
      orderBy: { creadoAt: "asc" },
    }),
    prisma.businessRole.findMany({
      where: { businessId },
      select: {
        id: true,
        businessId: true,
        nombre: true,
        permisos: true,
        _count: { select: { usuarios: true } },
      },
      orderBy: { creadoAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { rol: true, businessRole: { select: { permisos: true } } },
    }),
  ]);

  // Fuente de verdad de los permisos del que llama: la BD, no el JWT de sesión.
  const callerPermisos =
    caller?.rol === "ADMIN" ? null : (caller?.businessRole?.permisos ?? null);

  return NextResponse.json({
    members,
    roles,
    callerPermisos,
    currentUserId: session.user.id,
  });
}
