"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MoreVertical, Plus, Shield, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  createBusinessRole,
  updateBusinessRole,
  deleteBusinessRole,
  inviteTeamMember,
  updateMemberRole,
  setMemberActivo,
  resetMemberPassword,
} from "@/app/actions/team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERMISOS_POR_CATEGORIA, PERMISO_LABELS, type Permiso } from "@/lib/permissions";

export type TeamMember = {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  businessRoleId: string | null;
  businessRole: { nombre: string } | null;
};

export type BusinessRoleWithCount = {
  id: string;
  businessId: string;
  nombre: string;
  permisos: string[];
  _count: { usuarios: number };
};

function RoleDrawer({
  businessId,
  role,
  onDone,
}: {
  businessId: string;
  role?: BusinessRoleWithCount;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(role?.nombre ?? "");
  const [selectedPermisos, setSelectedPermisos] = useState<Set<string>>(
    new Set(role?.permisos ?? []),
  );
  const [pending, start] = useTransition();

  function togglePermiso(p: string) {
    setSelectedPermisos((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function handleOpen(v: boolean) {
    if (v) {
      setNombre(role?.nombre ?? "");
      setSelectedPermisos(new Set(role?.permisos ?? []));
    }
    setOpen(v);
  }

  function handleSubmit() {
    start(async () => {
      const data = { nombre, permisos: Array.from(selectedPermisos) };
      const r = role
        ? await updateBusinessRole(role.id, data)
        : await createBusinessRole(businessId, data);
      if (r.ok) {
        toast.success(role ? "Rol actualizado." : "Rol creado.");
        setOpen(false);
        onDone();
      } else {
        toast.error(r.error ?? "No se pudo guardar el rol.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        {role ? (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
            Editar
          </DropdownMenuItem>
        ) : (
          <Button size="sm" variant="outline">
            <Plus className="size-4 mr-1.5" /> Nuevo rol
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader className="shrink-0">
          <SheetTitle>{role ? "Editar rol" : "Nuevo rol"}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="role-nombre">Nombre del rol</Label>
              <Input
                id="role-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej: Supervisor"
              />
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium">Permisos</p>
              {Object.entries(PERMISOS_POR_CATEGORIA).map(([cat, permisos]) => (
                <div key={cat} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {cat}
                  </p>
                  {permisos.map((p) => (
                    <div key={p} className="flex items-center gap-2.5">
                      <Checkbox
                        id={p}
                        checked={selectedPermisos.has(p)}
                        onCheckedChange={() => togglePermiso(p)}
                      />
                      <Label htmlFor={p} className="text-sm font-normal cursor-pointer">
                        {PERMISO_LABELS[p as Permiso]}
                      </Label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t bg-background pt-4 pb-2">
          <Button
            onClick={handleSubmit}
            disabled={pending || !nombre.trim()}
            className="w-full"
          >
            {pending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {role ? "Guardar cambios" : "Crear rol"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MemberDrawer({
  businessId,
  member,
  roles,
  onDone,
}: {
  businessId: string;
  member?: TeamMember;
  roles: BusinessRoleWithCount[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState(member?.nombre ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(member?.businessRoleId ?? "");
  const [pending, start] = useTransition();

  function handleOpenChange(v: boolean) {
    if (v) {
      setNombre(member?.nombre ?? "");
      setEmail(member?.email ?? "");
      setPassword("");
      setRoleId(member?.businessRoleId ?? "");
    }
    setOpen(v);
  }

  function handleSubmit() {
    start(async () => {
      if (!member) {
        const r = await inviteTeamMember(businessId, {
          nombre,
          email,
          password,
          businessRoleId: roleId,
        });
        if (r.ok) {
          toast.success("Miembro agregado.");
          setOpen(false);
          onDone();
        } else {
          toast.error(r.error ?? "No se pudo agregar el miembro.");
        }
        return;
      }

      // Edición: aplica cambio de rol y/o de contraseña, lo que se haya tocado.
      // Son dos acciones independientes (no hay transacción compartida), así que
      // si una falla después de que la otra ya se guardó, hay que avisarlo y
      // refrescar — nunca dejar al usuario creyendo que nada se aplicó.
      let changed = false;
      let roleError: string | null = null;
      let passwordError: string | null = null;

      if (roleId && roleId !== (member.businessRoleId ?? "")) {
        const r = await updateMemberRole(member.id, roleId);
        if (r.ok) changed = true;
        else roleError = r.error ?? "No se pudo actualizar el rol.";
      }
      if (password.length >= 6) {
        const r = await resetMemberPassword(member.id, password);
        if (r.ok) changed = true;
        else passwordError = r.error ?? "No se pudo actualizar la contraseña.";
      }

      if (roleError || passwordError) {
        toast.error([roleError, passwordError].filter(Boolean).join(" "));
        // Refresca si algo sí se guardó, o si el rol falló (puede ser que ya no
        // exista — al refrescar, el selector deja de ofrecer un rol borrado).
        if (changed || roleError) onDone();
        return;
      }
      if (!changed) {
        toast.error("No hay cambios para guardar.");
        return;
      }
      toast.success("Miembro actualizado.");
      setOpen(false);
      onDone();
    });
  }

  const passwordInvalid = password.length > 0 && password.length < 6;
  const nothingToSave = !!member && password.length === 0 && roleId === (member.businessRoleId ?? "");
  const disabled = member
    ? pending || passwordInvalid || nothingToSave
    : pending || passwordInvalid || !nombre.trim() || !email.trim() || !roleId || password.length < 6;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        {member ? (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
            Editar miembro
          </DropdownMenuItem>
        ) : (
          <Button size="sm" variant="outline">
            <Plus className="size-4 mr-1.5" /> Agregar miembro
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{member ? "Editar miembro" : "Agregar miembro"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 p-6">
          {!member && (
            <>
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" className="w-full" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.com" className="w-full" />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{member ? "Nueva contraseña" : "Contraseña temporal"}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              className="w-full"
            />
            {member && (
              <p className="text-xs text-muted-foreground">Déjalo en blanco para no cambiarla.</p>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={disabled}
            className="w-full mt-2"
            size="lg"
          >
            {pending ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {member ? "Guardar cambios" : "Agregar miembro"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Gestión de roles y miembros de un negocio. Compartido entre el panel admin
 * (acceso total siempre) y el dashboard del cliente (acceso según sus propios
 * permisos `gestionar_roles` / `gestionar_usuarios`, validados también server-side
 * en src/app/actions/team.ts contra la BD, no solo aquí).
 */
export function EquipoTab({
  businessId,
  initialMembers,
  initialRoles,
  currentUserId,
  canManageRoles = true,
  canManageUsers = true,
  onDataChanged,
}: {
  businessId: string;
  initialMembers: TeamMember[];
  initialRoles: BusinessRoleWithCount[];
  /** Oculta las acciones sobre la propia fila del usuario en sesión (no puede desactivarse ni cambiarse el rol a sí mismo). */
  currentUserId?: string;
  canManageRoles?: boolean;
  canManageUsers?: boolean;
  /** Si se omite, usa router.refresh() (Server Component padre). Pásalo cuando los datos vienen de un fetch client-side. */
  onDataChanged?: () => void;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [roles, setRoles] = useState(initialRoles);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => setMembers(initialMembers), [initialMembers]);
  useEffect(() => setRoles(initialRoles), [initialRoles]);

  function refresh() {
    if (onDataChanged) onDataChanged();
    else router.refresh();
  }

  function handleDeleteRole(roleId: string) {
    start(async () => {
      const r = await deleteBusinessRole(roleId);
      if (r.ok) {
        toast.success("Rol eliminado.");
        setRoles((prev) => prev.filter((r) => r.id !== roleId));
      } else {
        toast.error(r.error ?? "No se pudo eliminar.");
      }
    });
  }

  function handleToggleMember(userId: string, activo: boolean) {
    start(async () => {
      const r = await setMemberActivo(userId, activo);
      if (r.ok) {
        toast.success(activo ? "Usuario activado." : "Usuario desactivado.");
        setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, activo } : m));
      } else {
        toast.error(r.error ?? "No se pudo actualizar.");
      }
    });
  }

  return (
    <div className="space-y-10">
      {/* Sección Roles */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Roles</h2>
            <p className="text-sm text-muted-foreground">
              Define los permisos de cada tipo de usuario.
            </p>
          </div>
          {canManageRoles && <RoleDrawer businessId={businessId} onDone={refresh} />}
        </div>

        {roles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {canManageRoles ? "Sin roles creados. Crea el primero." : "Sin roles creados."}
          </p>
        ) : (
          <div className="space-y-3">
            {roles.map((role) => {
              const preview = role.permisos.slice(0, 3);
              const extra = role.permisos.length - 3;
              return (
                <div
                  key={role.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <Shield className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{role.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {role._count.usuarios} usuario{role._count.usuarios !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {preview.map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px]">
                        {PERMISO_LABELS[p as Permiso] ?? p}
                      </Badge>
                    ))}
                    {extra > 0 && (
                      <Badge variant="muted" className="text-[10px]">
                        y {extra} más
                      </Badge>
                    )}
                  </div>
                  {canManageRoles && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-8 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <RoleDrawer businessId={businessId} role={role} onDone={refresh} />
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={role._count.usuarios > 0 || pending}
                          onSelect={() => handleDeleteRole(role.id)}
                        >
                          <Trash2 className="size-4 mr-2" />
                          Eliminar
                          {role._count.usuarios > 0 && (
                            <span className="ml-2 text-muted-foreground text-xs">(con usuarios)</span>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Sección Miembros */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Miembros</h2>
            <p className="text-sm text-muted-foreground">
              Usuarios con acceso al dashboard de este negocio.
            </p>
          </div>
          {canManageUsers && <MemberDrawer businessId={businessId} roles={roles} onDone={refresh} />}
        </div>

        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {canManageUsers ? "Sin miembros. Agrega el primero." : "Sin miembros."}
          </p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => {
              const initial = m.nombre.charAt(0).toUpperCase();
              const isSelf = m.id === currentUserId;
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {m.nombre}
                      {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(tú)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.businessRole && (
                      <Badge variant="secondary" className="text-xs">
                        {m.businessRole.nombre}
                      </Badge>
                    )}
                    <Badge
                      variant={m.activo ? "success" : "muted"}
                      className="text-[10px]"
                    >
                      {m.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  {canManageUsers && !isSelf && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-8 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <MemberDrawer
                          businessId={businessId}
                          member={m}
                          roles={roles}
                          onDone={refresh}
                        />
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={pending}
                          onSelect={() => handleToggleMember(m.id, !m.activo)}
                          className={!m.activo ? "" : "text-destructive focus:text-destructive"}
                        >
                          {m.activo ? (
                            <><X className="size-4 mr-2" />Desactivar acceso</>
                          ) : (
                            <><Check className="size-4 mr-2" />Activar acceso</>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
