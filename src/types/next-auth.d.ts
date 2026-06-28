import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    rol: Role;
    businessId: string | null;
    nombre: string;
    permisos?: string[];
  }

  interface Session {
    user: {
      id: string;
      rol: Role;
      businessId: string | null;
      nombre: string;
      permisos?: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    rol: Role;
    businessId: string | null;
    nombre: string;
    permisos?: string[];
  }
}
