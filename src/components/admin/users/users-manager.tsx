"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { setUserActivo } from "@/app/actions/users";
import type { BusinessOption, UserListItem } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserDrawer } from "./user-drawer";

function RolBadge({ rol }: { rol: string }) {
  return rol === "ADMIN" ? (
    <Badge>Admin</Badge>
  ) : (
    <Badge variant="secondary">Cliente</Badge>
  );
}

function ActivoToggle({ id, activo }: { id: string; activo: boolean }) {
  const [val, setVal] = useState(activo);
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={val}
      disabled={pending}
      aria-label="Activar o desactivar usuario"
      onCheckedChange={(v) => {
        setVal(v);
        start(async () => {
          const r = await setUserActivo(id, v);
          if (!r.ok) {
            setVal(!v);
            toast.error(r.error ?? "No se pudo actualizar.");
          } else {
            toast.success(v ? "Usuario activado" : "Usuario desactivado");
          }
        });
      }}
    />
  );
}

function UsersTable({
  users,
  onEdit,
}: {
  users: UserListItem[];
  onEdit: (u: UserListItem) => void;
}) {
  return (
    <>
      {/* Escritorio */}
      <div className="hidden overflow-hidden rounded-xl border border-border lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Negocio</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nombre}</TableCell>
                <TableCell className="text-muted-foreground">
                  {u.email}
                </TableCell>
                <TableCell>
                  <RolBadge rol={u.rol} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.businessNombre ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {shortDate(u.creadoAt)}
                </TableCell>
                <TableCell className="text-center">
                  <ActivoToggle id={u.id} activo={u.activo} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(u)}
                    aria-label={`Editar ${u.nombre}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Móvil / tablet */}
      <div className="space-y-3 lg:hidden">
        {users.map((u) => (
          <div
            key={u.id}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.nombre}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {u.email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(u)}
                aria-label={`Editar ${u.nombre}`}
              >
                <Pencil className="size-4" />
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <RolBadge rol={u.rol} />
              <span className="text-muted-foreground">
                {u.businessNombre ?? "Sin negocio"}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                Creado {shortDate(u.creadoAt)}
              </span>
              <ActivoToggle id={u.id} activo={u.activo} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function UsersManager({
  users,
  businesses,
}: {
  users: UserListItem[];
  businesses: BusinessOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserListItem | undefined>(undefined);

  function openNew() {
    setEditing(undefined);
    setOpen(true);
  }
  function openEdit(u: UserListItem) {
    setEditing(u);
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Administra el acceso de tu equipo y de tus clientes."
      >
        <Button onClick={openNew}>
          <Plus /> Nuevo usuario
        </Button>
      </PageHeader>

      {users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Aún no hay usuarios"
          description="Crea el primer usuario para dar acceso al CRM."
          action={
            <Button onClick={openNew}>
              <Plus /> Nuevo usuario
            </Button>
          }
        />
      ) : (
        <UsersTable users={users} onEdit={openEdit} />
      )}

      <UserDrawer
        open={open}
        onOpenChange={setOpen}
        user={editing}
        businesses={businesses}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
