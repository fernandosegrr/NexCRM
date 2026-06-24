"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createBusinessSchema, type CreateBusinessInput } from "@/lib/validations";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.rol !== "ADMIN") return null;
  return session;
}

export async function createBusiness(
  input: CreateBusinessInput,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };

  const parsed = createBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { nombre, instancias } = parsed.data;
  const canales = Array.from(new Set(instancias.map((i) => i.canal)));

  try {
    const business = await prisma.business.create({
      data: {
        nombre,
        canales,
        instancias: {
          create: instancias.map((i) => ({
            canal: i.canal,
            instanciaId: i.instanciaId.trim(),
          })),
        },
      },
      select: { id: true },
    });
    revalidatePath("/admin/negocios");
    return { ok: true, id: business.id };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        ok: false,
        error: "Ya existe una instancia con ese ID en ese canal.",
      };
    }
    return { ok: false, error: "No se pudo crear el negocio." };
  }
}

export async function setBusinessActivo(
  id: string,
  activo: boolean,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "No autorizado." };
  try {
    await prisma.business.update({ where: { id }, data: { activo } });
    revalidatePath("/admin/negocios");
    revalidatePath(`/admin/negocios/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el negocio." };
  }
}
