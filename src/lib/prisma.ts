import { PrismaClient } from "@prisma/client";

// Cliente Prisma de la BD principal del CRM.
// Se cachea en `globalThis` para evitar agotar conexiones con el hot-reload de Next.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
