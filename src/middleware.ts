import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// El middleware corre en el Edge runtime: usa solo `authConfig` (sin Prisma).
export default NextAuth(authConfig).auth;

export const config = {
  // Corre en todas las rutas excepto API, assets de Next y archivos estáticos.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|.*\\.).*)"],
};
