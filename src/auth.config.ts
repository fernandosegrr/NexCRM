import type { NextAuthConfig } from "next-auth";

/**
 * Configuración compatible con el Edge runtime (sin Prisma ni bcrypt).
 * La usa el middleware para proteger rutas. El proveedor de credenciales
 * (que sí usa Node) se añade en `auth.ts`.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  providers: [], // se inyectan en auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.rol = user.rol;
        token.businessId = user.businessId;
        token.nombre = user.nombre;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.rol = token.rol as typeof session.user.rol;
        session.user.businessId = token.businessId as string | null;
        session.user.nombre = token.nombre as string;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.rol;
      const { pathname } = nextUrl;

      const homeFor = (r?: string) =>
        new URL(r === "ADMIN" ? "/admin" : "/dashboard", nextUrl);

      // Página de login: si ya hay sesión, manda a su home
      if (pathname === "/login") {
        if (isLoggedIn) return Response.redirect(homeFor(role));
        return true;
      }

      // Zona admin: requiere sesión y rol ADMIN
      if (pathname.startsWith("/admin")) {
        if (!isLoggedIn) return false;
        if (role !== "ADMIN") return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }

      // Zona cliente: requiere sesión; un ADMIN se va a su panel
      if (pathname.startsWith("/dashboard")) {
        if (!isLoggedIn) return false;
        if (role === "ADMIN") return Response.redirect(new URL("/admin", nextUrl));
        return true;
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
