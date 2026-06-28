"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { callerCan } from "@/lib/permissions-server";

async function getCallerBusinessId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.businessId) throw new Error("No autorizado.");
  if (!(await callerCan("gestionar_contactos"))) {
    throw new Error("No tienes permiso para gestionar contactos.");
  }
  return session.user.businessId;
}

async function assertContactOwnership(contactId: string, businessId: string) {
  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      instanciaId: {
        in: await prisma.businessInstance
          .findMany({ where: { businessId }, select: { instanciaId: true } })
          .then((rows) => rows.map((r) => r.instanciaId)),
      },
    },
    select: { id: true },
  });
  if (!contact) throw new Error("Contacto no encontrado.");
}

// ---------- Notas ----------

export async function createContactNote(
  contactId: string,
  contenido: string,
): Promise<{ ok: boolean }> {
  if (contenido.trim().length < 1) throw new Error("La nota no puede estar vacía.");
  const businessId = await getCallerBusinessId();
  const session = await auth();
  await assertContactOwnership(contactId, businessId);

  await prisma.contactNote.create({
    data: {
      contactId,
      businessId,
      contenido: contenido.trim(),
      creadoPor: session!.user!.nombre ?? session!.user!.email ?? "Desconocido",
    },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteContactNote(noteId: string): Promise<{ ok: boolean }> {
  const businessId = await getCallerBusinessId();
  const note = await prisma.contactNote.findFirst({
    where: { id: noteId, businessId },
    select: { id: true },
  });
  if (!note) throw new Error("Nota no encontrada.");
  await prisma.contactNote.delete({ where: { id: noteId } });
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------- Etiquetas ----------

export async function createContactTag(
  contactId: string,
  etiqueta: string,
): Promise<{ ok: boolean }> {
  if (!etiqueta.trim()) throw new Error("Etiqueta vacía.");
  const businessId = await getCallerBusinessId();
  await assertContactOwnership(contactId, businessId);
  await prisma.contactTag.upsert({
    where: { contactId_businessId_etiqueta: { contactId, businessId, etiqueta: etiqueta.trim() } },
    create: { contactId, businessId, etiqueta: etiqueta.trim() },
    update: {},
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteContactTag(tagId: string): Promise<{ ok: boolean }> {
  const businessId = await getCallerBusinessId();
  const tag = await prisma.contactTag.findFirst({
    where: { id: tagId, businessId },
    select: { id: true },
  });
  if (!tag) throw new Error("Etiqueta no encontrada.");
  await prisma.contactTag.delete({ where: { id: tagId } });
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------- Campos personalizados ----------

export async function upsertContactFieldValue(
  contactId: string,
  fieldId: string,
  valor: string,
): Promise<{ ok: boolean }> {
  const businessId = await getCallerBusinessId();
  await assertContactOwnership(contactId, businessId);
  // Verify field belongs to this business
  const field = await prisma.customField.findFirst({
    where: { id: fieldId, businessId },
    select: { id: true },
  });
  if (!field) throw new Error("Campo no encontrado.");
  await prisma.contactFieldValue.upsert({
    where: { contactId_fieldId: { contactId, fieldId } },
    create: { contactId, fieldId, valor },
    update: { valor },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createCustomField(data: {
  nombre: string;
  tipo: string;
  opciones?: string[];
}): Promise<{ ok: boolean; id: string }> {
  if (!["texto", "numero", "fecha", "select"].includes(data.tipo)) {
    throw new Error("Tipo de campo inválido.");
  }
  const businessId = await getCallerBusinessId();
  const max = await prisma.customField.aggregate({
    where: { businessId },
    _max: { orden: true },
  });
  const field = await prisma.customField.create({
    data: {
      businessId,
      nombre: data.nombre.trim(),
      tipo: data.tipo,
      opciones: data.opciones ?? [],
      orden: (max._max.orden ?? -1) + 1,
    },
  });
  revalidatePath("/dashboard");
  return { ok: true, id: field.id };
}

export async function updateCustomField(
  fieldId: string,
  data: { nombre?: string; opciones?: string[] },
): Promise<{ ok: boolean }> {
  const businessId = await getCallerBusinessId();
  const field = await prisma.customField.findFirst({
    where: { id: fieldId, businessId },
    select: { id: true },
  });
  if (!field) throw new Error("Campo no encontrado.");
  await prisma.customField.update({
    where: { id: fieldId },
    data: {
      ...(data.nombre ? { nombre: data.nombre.trim() } : {}),
      ...(data.opciones ? { opciones: data.opciones } : {}),
    },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteCustomField(fieldId: string): Promise<{ ok: boolean }> {
  const businessId = await getCallerBusinessId();
  const field = await prisma.customField.findFirst({
    where: { id: fieldId, businessId },
    select: { id: true },
  });
  if (!field) throw new Error("Campo no encontrado.");
  await prisma.customField.delete({ where: { id: fieldId } });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function reorderCustomFields(
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  const businessId = await getCallerBusinessId();
  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.customField.updateMany({
        where: { id, businessId },
        data: { orden: idx },
      }),
    ),
  );
  revalidatePath("/dashboard");
  return { ok: true };
}
