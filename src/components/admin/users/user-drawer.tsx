"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createUser, updateUser } from "@/app/actions/users";
import type { BusinessOption, UserListItem } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Rol = "ADMIN" | "CLIENTE";

function UserForm({
  user,
  businesses,
  onDone,
}: {
  user?: UserListItem;
  businesses: BusinessOption[];
  onDone: () => void;
}) {
  const isEdit = !!user;
  const [nombre, setNombre] = useState(user?.nombre ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<Rol>((user?.rol as Rol) ?? "CLIENTE");
  const [businessId, setBusinessId] = useState<string>(user?.businessId ?? "");
  const [activo, setActivo] = useState(user?.activo ?? true);
  const [pending, start] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (nombre.trim().length < 2) return toast.error("Escribe el nombre.");
    if (!email.trim()) return toast.error("Escribe el correo.");
    if (!isEdit && password.length < 6)
      return toast.error("La contraseña debe tener al menos 6 caracteres.");
    if (rol === "CLIENTE" && !businessId)
      return toast.error("Selecciona un negocio para el cliente.");

    start(async () => {
      const result = isEdit
        ? await updateUser({
            id: user!.id,
            nombre: nombre.trim(),
            email: email.trim(),
            password: password || undefined,
            rol,
            businessId: rol === "CLIENTE" ? businessId : null,
            activo,
          })
        : await createUser({
            nombre: nombre.trim(),
            email: email.trim(),
            password,
            rol,
            businessId: rol === "CLIENTE" ? businessId : null,
          });

      if (result.ok) {
        toast.success(isEdit ? "Usuario actualizado." : "Usuario creado.");
        onDone();
      } else {
        toast.error(result.error ?? "No se pudo guardar el usuario.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <SheetHeader>
        <SheetTitle>{isEdit ? "Editar usuario" : "Nuevo usuario"}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? "Actualiza los datos del usuario."
            : "Crea una cuenta de acceso al CRM."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="space-y-2">
          <Label htmlFor="u-nombre">Nombre</Label>
          <Input
            id="u-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ana López"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="u-email">Correo</Label>
          <Input
            id="u-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ana@negocio.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="u-pass">
            {isEdit ? "Nueva contraseña" : "Contraseña temporal"}
          </Label>
          <Input
            id="u-pass"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEdit ? "Dejar en blanco para no cambiar" : "Mínimo 6 caracteres"}
            autoComplete="new-password"
          />
        </div>

        <div className="space-y-2">
          <Label>Rol</Label>
          <Select value={rol} onValueChange={(v) => setRol(v as Rol)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ADMIN">Administrador (NexAI)</SelectItem>
              <SelectItem value="CLIENTE">Cliente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {rol === "CLIENTE" && (
          <div className="space-y-2">
            <Label>Negocio asignado</Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un negocio" />
              </SelectTrigger>
              <SelectContent>
                {businesses.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    No hay negocios. Crea uno primero.
                  </div>
                ) : (
                  businesses.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nombre}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {isEdit && (
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Usuario activo</p>
              <p className="text-xs text-muted-foreground">
                Si se desactiva, no podrá iniciar sesión.
              </p>
            </div>
            <Switch checked={activo} onCheckedChange={setActivo} />
          </div>
        )}
      </div>

      <SheetFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" /> Guardando…
            </>
          ) : isEdit ? (
            "Guardar cambios"
          ) : (
            "Crear usuario"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function UserDrawer({
  open,
  onOpenChange,
  user,
  businesses,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserListItem;
  businesses: BusinessOption[];
  onSaved: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        {open && (
          <UserForm
            key={user?.id ?? "new"}
            user={user}
            businesses={businesses}
            onDone={() => {
              onSaved();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
