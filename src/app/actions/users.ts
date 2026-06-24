"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createUserSchema, updateUserSchema } from "@/lib/validations";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.rol !== "ADMIN") return null;
  return session;
}

export async function createUser(input: unknown): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { nombre, email, password, rol } = parsed.data;
  const businessId = rol === "ADMIN" ? null : parsed.data.businessId ?? null;
  if (rol === "CLIENTE" && !businessId) {
    return { ok: false, error: "Selecciona un negocio para el cliente." };
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        nombre,
        email: email.toLowerCase(),
        password: hash,
        rol,
        businessId,
      },
      select: { id: true },
    });
    revalidatePath("/admin/usuarios");
    return { ok: true, id: user.id };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, error: "Ese correo ya está registrado." };
    }
    return { ok: false, error: "No se pudo crear el usuario." };
  }
}

export async function updateUser(input: unknown): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { id, nombre, email, password, rol, activo } = parsed.data;
  const businessId = rol === "ADMIN" ? null : parsed.data.businessId ?? null;
  if (rol === "CLIENTE" && !businessId) {
    return { ok: false, error: "Selecciona un negocio para el cliente." };
  }

  try {
    const data: Prisma.UserUpdateInput = {
      nombre,
      email: email.toLowerCase(),
      rol,
      activo,
      business: businessId
        ? { connect: { id: businessId } }
        : { disconnect: true },
    };
    if (password && password.length >= 6) {
      data.password = await bcrypt.hash(password, 10);
    }
    await prisma.user.update({ where: { id }, data });
    revalidatePath("/admin/usuarios");
    return { ok: true, id };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, error: "Ese correo ya está registrado." };
    }
    return { ok: false, error: "No se pudo actualizar el usuario." };
  }
}

export async function setUserActivo(
  id: string,
  activo: boolean,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };
  try {
    await prisma.user.update({ where: { id }, data: { activo } });
    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el usuario." };
  }
}
