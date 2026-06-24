import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@nexai.mx";
  // Contraseña inicial: configurable por env; default solo para arranque rápido.
  const plain = process.env.ADMIN_SEED_PASSWORD || "nexai2025";
  const password = await bcrypt.hash(plain, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {}, // no sobreescribe la contraseña si el admin ya existe
    create: {
      email,
      password,
      nombre: "Administrador NexAI",
      rol: Role.ADMIN,
      activo: true,
    },
  });

  console.log(`✔ Usuario ADMIN listo: ${admin.email}`);
  if (!process.env.ADMIN_SEED_PASSWORD) {
    console.log(
      "  Contraseña por defecto: 'nexai2025'. Cámbiala tras el primer ingreso o define ADMIN_SEED_PASSWORD.",
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("✖ Error en el seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
