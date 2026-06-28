"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

/**
 * Provee el contexto de sesión de NextAuth a los Client Components.
 *
 * CAUSA RAÍZ del crash de producción (pantalla negra "client-side exception"):
 * las páginas /dashboard/campanas, /dashboard/conexion y /dashboard/configuracion
 * llaman `useSession()`, que en next-auth v5 LANZA un error en render si no hay un
 * <SessionProvider> ancestro. El proyecto nunca lo tuvo, por eso compilaba bien
 * (es un error de runtime en el browser) pero reventaba en esas tres rutas.
 *
 * Pasamos la `session` ya resuelta en el Server Layout para evitar un fetch
 * adicional y para que `status` quede "authenticated" desde el primer render.
 */
export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
