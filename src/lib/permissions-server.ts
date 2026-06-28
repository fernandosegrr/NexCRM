import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Permiso } from "@/lib/permissions";

export type EffectiveAccess = {
  userId: string;
  businessId: string | null;
  rol: string;
  /** null = acceso total (ADMIN o CLIENTE sin rol asignado, backwards compat) */
  permisos: string[] | null;
};

/**
 * Lee los permisos efectivos del usuario de sesión desde la BD (fuente de verdad,
 * más fresca que el JWT). Úsalo para hacer cumplir permisos en mutations/endpoints.
 */
export async function getEffectiveAccess(): Promise<EffectiveAccess | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  if (session.user.rol === "ADMIN") {
    return { userId: session.user.id, businessId: null, rol: "ADMIN", permisos: null };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { businessId: true, businessRole: { select: { permisos: true } } },
  });
  if (!user) return null;

  return {
    userId: session.user.id,
    businessId: user.businessId,
    rol: "CLIENTE",
    permisos: user.businessRole?.permisos ?? null,
  };
}

/** True si el usuario de sesión tiene el permiso (leído desde BD). */
export async function callerCan(permiso: Permiso): Promise<boolean> {
  const access = await getEffectiveAccess();
  if (!access) return false;
  if (access.permisos === null) return true; // ADMIN o sin rol = todo
  return access.permisos.includes(permiso);
}
