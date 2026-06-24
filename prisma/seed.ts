import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@nexai.mx";
  const password = await bcrypt.hash("nexai2025", 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password,
      nombre: "Administrador NexAI",
      rol: Role.ADMIN,
      activo: true,
    },
  });

  console.log(`✔ Usuario ADMIN listo: ${admin.email}  (contraseña: nexai2025)`);
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
