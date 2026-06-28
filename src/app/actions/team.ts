"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type Permiso } from "@/lib/permissions";

export type TeamActionResult = { ok: boolean; error?: string };

async function requireTeamAccess(businessId: string) {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.rol === "ADMIN") return session;
  if (session.user.businessId !== businessId) return null;
  return session;
}

// Lee permisos actuales del usuario desde DB (fuente de verdad para mutations)
async function getCallerPermisos(userId: string): Promise<string[] | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { rol: true, businessRole: { select: { permisos: true } } },
  });
  if (!user) return null;
  if (user.rol === "ADMIN") return null; // null = acceso total
  return user.businessRole?.permisos ?? null; // null = sin rol = acceso total
}

function callerHasPermiso(permisos: string[] | null, permiso: Permiso): boolean {
  if (permisos === null) return true; // ADMIN o sin rol = todo
  return permisos.includes(permiso);
}

export async function createBusinessRole(
  businessId: string,
  data: { nombre: string; permisos: string[] },
): Promise<TeamActionResult> {
  const session = await requireTeamAccess(businessId);
  if (!session) return { ok: false, error: "No autorizado." };

  const callerPermisos = await getCallerPermisos(session.user.id);
  if (!callerHasPermiso(callerPermisos, "gestionar_roles")) {
    return { ok: false, error: "No tienes permiso para gestionar roles." };
  }

  // Un usuario no puede crear un rol con permisos que él mismo no tiene
  if (callerPermisos !== null) {
    const permisosSinAcceso = data.permisos.filter((p) => !callerPermisos.includes(p));
    if (permisosSinAcceso.length > 0) {
      return { ok: false, error: "No puedes asignar permisos que tú mismo no tienes." };
    }
  }

  try {
    await prisma.businessRole.create({
      data: { businessId, nombre: data.nombre.trim(), permisos: data.permisos },
    });
    revalidatePath(`/admin/negocios/${businessId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "Ya existe un rol con ese nombre." };
  }
}

export async function updateBusinessRole(
  roleId: string,
  data: { nombre: string; permisos: string[] },
): Promise<TeamActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autorizado." };

  const role = await prisma.businessRole.findUnique({
    where: { id: roleId },
    select: { businessId: true },
  });
  if (!role) return { ok: false, error: "Rol no encontrado." };

  const sess = await requireTeamAccess(role.businessId);
  if (!sess) return { ok: false, error: "No autorizado." };

  const callerPermisos = await getCallerPermisos(session.user.id);
  if (!callerHasPermiso(callerPermisos, "gestionar_roles")) {
    return { ok: false, error: "No tienes permiso para gestionar roles." };
  }

  // Un usuario no puede editar su propio rol
  const callerUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { businessRoleId: true },
  });
  if (callerUser?.businessRoleId === roleId) {
    return { ok: false, error: "No puedes editar tu propio rol." };
  }

  if (callerPermisos !== null) {
    const permisosSinAcceso = data.permisos.filter((p) => !callerPermisos.includes(p));
    if (permisosSinAcceso.length > 0) {
      return { ok: false, error: "No puedes asignar permisos que tú mismo no tienes." };
    }
  }

  try {
    await prisma.businessRole.update({
      where: { id: roleId },
      data: { nombre: data.nombre.trim(), permisos: data.permisos },
    });
    revalidatePath(`/admin/negocios/${role.businessId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el rol." };
  }
}

export async function deleteBusinessRole(roleId: string): Promise<TeamActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autorizado." };

  const role = await prisma.businessRole.findUnique({
    where: { id: roleId },
    include: { _count: { select: { usuarios: true } } },
  });
  if (!role) return { ok: false, error: "Rol no encontrado." };

  const sess = await requireTeamAccess(role.businessId);
  if (!sess) return { ok: false, error: "No autorizado." };

  const callerPermisos = await getCallerPermisos(session.user.id);
  if (!callerHasPermiso(callerPermisos, "gestionar_roles")) {
    return { ok: false, error: "No tienes permiso para gestionar roles." };
  }

  if (role._count.usuarios > 0) {
    return { ok: false, error: "No puedes eliminar un rol con usuarios asignados." };
  }

  try {
    await prisma.businessRole.delete({ where: { id: roleId } });
    revalidatePath(`/admin/negocios/${role.businessId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo eliminar el rol." };
  }
}

export async function inviteTeamMember(
  businessId: string,
  data: { nombre: string; email: string; password: string; businessRoleId: string },
): Promise<TeamActionResult> {
  const session = await requireTeamAccess(businessId);
  if (!session) return { ok: false, error: "No autorizado." };

  const callerPermisos = await getCallerPermisos(session.user.id);
  if (!callerHasPermiso(callerPermisos, "gestionar_usuarios")) {
    return { ok: false, error: "No tienes permiso para gestionar usuarios." };
  }

  if (!data.nombre.trim() || !data.email.trim()) {
    return { ok: false, error: "Nombre y email son obligatorios." };
  }
  if (data.password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }

  // Verificar que el rol pertenece al negocio
  const role = await prisma.businessRole.findFirst({
    where: { id: data.businessRoleId, businessId },
    select: { permisos: true },
  });
  if (!role) return { ok: false, error: "Rol no válido para este negocio." };

  // Verificar que no se asigna rol con permisos que el caller no tiene
  if (callerPermisos !== null) {
    const permisosSinAcceso = role.permisos.filter((p) => !callerPermisos.includes(p));
    if (permisosSinAcceso.length > 0) {
      return { ok: false, error: "No puedes asignar un rol con permisos que tú mismo no tienes." };
    }
  }

  try {
    const hash = await bcrypt.hash(data.password, 10);
    await prisma.user.create({
      data: {
        nombre: data.nombre.trim(),
        email: data.email.toLowerCase().trim(),
        password: hash,
        rol: "CLIENTE",
        businessId,
        businessRoleId: data.businessRoleId,
      },
    });
    revalidatePath(`/admin/negocios/${businessId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "El email ya está registrado." };
  }
}

export async function updateMemberRole(
  userId: string,
  businessRoleId: string,
): Promise<TeamActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autorizado." };

  if (session.user.id === userId) {
    return { ok: false, error: "No puedes cambiar tu propio rol." };
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { businessId: true },
  });
  if (!targetUser?.businessId) return { ok: false, error: "Usuario no encontrado." };

  const sess = await requireTeamAccess(targetUser.businessId);
  if (!sess) return { ok: false, error: "No autorizado." };

  const callerPermisos = await getCallerPermisos(session.user.id);
  if (!callerHasPermiso(callerPermisos, "gestionar_usuarios")) {
    return { ok: false, error: "No tienes permiso para gestionar usuarios." };
  }

  const role = await prisma.businessRole.findFirst({
    where: { id: businessRoleId, businessId: targetUser.businessId },
    select: { permisos: true },
  });
  if (!role) return { ok: false, error: "Rol no válido." };

  if (callerPermisos !== null) {
    const permisosSinAcceso = role.permisos.filter((p) => !callerPermisos.includes(p));
    if (permisosSinAcceso.length > 0) {
      return { ok: false, error: "No puedes asignar un rol con permisos que tú mismo no tienes." };
    }
  }

  try {
    await prisma.user.update({ where: { id: userId }, data: { businessRoleId } });
    revalidatePath(`/admin/negocios/${targetUser.businessId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el rol." };
  }
}

export async function setMemberActivo(
  userId: string,
  activo: boolean,
): Promise<TeamActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autorizado." };

  if (session.user.id === userId) {
    return { ok: false, error: "No puedes desactivarte a ti mismo." };
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { businessId: true },
  });
  if (!targetUser?.businessId) return { ok: false, error: "Usuario no encontrado." };

  const sess = await requireTeamAccess(targetUser.businessId);
  if (!sess) return { ok: false, error: "No autorizado." };

  const callerPermisos = await getCallerPermisos(session.user.id);
  if (!callerHasPermiso(callerPermisos, "gestionar_usuarios")) {
    return { ok: false, error: "No tienes permiso para gestionar usuarios." };
  }

  try {
    await prisma.user.update({ where: { id: userId }, data: { activo } });
    revalidatePath(`/admin/negocios/${targetUser.businessId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el estado." };
  }
}

export async function resetMemberPassword(
  userId: string,
  newPassword: string,
): Promise<TeamActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "No autorizado." };

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { businessId: true },
  });
  if (!targetUser?.businessId) return { ok: false, error: "Usuario no encontrado." };

  const isAdmin = session.user.rol === "ADMIN";
  const isOwner = session.user.businessId === targetUser.businessId;
  const isSelf = session.user.id === userId;

  if (!isAdmin && !isOwner && !isSelf) {
    return { ok: false, error: "No autorizado." };
  }

  if (!isAdmin && !isSelf) {
    const callerPermisos = await getCallerPermisos(session.user.id);
    if (!callerHasPermiso(callerPermisos, "gestionar_usuarios")) {
      return { ok: false, error: "No tienes permiso para gestionar usuarios." };
    }
  }

  if (newPassword.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password: hash } });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la contraseña." };
  }
}
