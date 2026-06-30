"use client";

import { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Plus, Trash2, GripVertical, Edit2, Check, X, Tag, Users } from "lucide-react";
import { toast } from "sonner";

import { hasPermission } from "@/lib/permissions";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { EquipoSection } from "@/components/dashboard/equipo-section";
import ErrorBoundary from "@/components/ui/error-boundary";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createCustomField,
  updateCustomField,
  deleteCustomField,
  reorderCustomFields,
} from "@/app/actions/contacts";

type CustomField = {
  id: string;
  nombre: string;
  tipo: string;
  opciones: string[];
  orden: number;
};

type FieldType = "texto" | "numero" | "fecha" | "select";

const TIPO_LABELS: Record<string, string> = {
  texto: "Texto",
  numero: "Número",
  fecha: "Fecha",
  select: "Lista de opciones",
};

export default function ConfiguracionPage() {
  return (
    <ErrorBoundary page="configuracion">
      <ConfiguracionPageInner />
    </ErrorBoundary>
  );
}

function ConfiguracionPageInner() {
  const { data: session, status } = useSession();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canFields =
    status === "loading" || !session
      ? null
      : hasPermission(session.user, "gestionar_contactos");
  const canTeam =
    status === "loading" || !session
      ? null
      : hasPermission(session.user, "gestionar_roles") ||
        hasPermission(session.user, "gestionar_usuarios");

  async function loadFields() {
    try {
      const res = await fetch("/api/dashboard/custom-fields");
      const data = (await res.json()) as { fields?: CustomField[] };
      setFields(data.fields ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => {
    console.log("[Configuracion] montado correctamente");
  }, []);

  useEffect(() => { void loadFields(); }, []);

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este campo? Se perderán todos los valores guardados.")) return;
    startTransition(async () => {
      try {
        await deleteCustomField(id);
        setFields((f) => f.filter((x) => x.id !== id));
        toast.success("Campo eliminado.");
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  async function handleMoveUp(idx: number) {
    if (idx === 0) return;
    const next = [...fields];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setFields(next);
    try {
      await reorderCustomFields(next.map((f) => f.id));
    } catch { /* best effort */ }
  }

  if (canFields === false && canTeam === false) {
    return <AccessDenied mensaje="No tienes acceso a la configuración." />;
  }

  if (canFields === null || canTeam === null || (canFields && loading)) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  const camposContent = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campos personalizados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agrega datos adicionales a las fichas de contacto.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-2">
          <Plus className="size-4" /> Nuevo campo
        </Button>
      </div>

      {fields.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No hay campos personalizados. Crea el primero para agregar información extra a tus contactos.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {fields.map((field, idx) => (
          <FieldRow
            key={field.id}
            field={field}
            isEditing={editId === field.id}
            onEdit={() => setEditId(field.id)}
            onCancelEdit={() => setEditId(null)}
            onSavedEdit={(updated) => {
              setFields((f) => f.map((x) => (x.id === field.id ? { ...x, ...updated } : x)));
              setEditId(null);
            }}
            onDelete={() => handleDelete(field.id)}
            onMoveUp={() => handleMoveUp(idx)}
            canMoveUp={idx > 0}
            isPending={isPending}
          />
        ))}
      </div>

      <NewFieldDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(field) => {
          setFields((f) => [...f, field]);
          setShowNew(false);
        }}
      />
    </div>
  );

  const equipoContent = session?.user?.businessId ? (
    <EquipoSection businessId={session.user.businessId} />
  ) : null;

  return (
    <div
      className="mx-auto h-full w-full max-w-2xl overflow-y-auto p-4 sm:p-6"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {canFields && canTeam ? (
        <Tabs defaultValue="campos" className="w-full">
          <TabsList>
            <TabsTrigger value="campos" className="gap-1.5">
              <Tag className="size-4" /> Campos
            </TabsTrigger>
            <TabsTrigger value="equipo" className="gap-1.5">
              <Users className="size-4" /> Equipo
            </TabsTrigger>
          </TabsList>
          <TabsContent value="campos">{camposContent}</TabsContent>
          <TabsContent value="equipo">{equipoContent}</TabsContent>
        </Tabs>
      ) : canTeam ? (
        equipoContent
      ) : (
        camposContent
      )}
    </div>
  );
}

function FieldRow({
  field,
  isEditing,
  onEdit,
  onCancelEdit,
  onSavedEdit,
  onDelete,
  onMoveUp,
  canMoveUp,
  isPending,
}: {
  field: CustomField;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSavedEdit: (data: { nombre: string; opciones: string[] }) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  canMoveUp: boolean;
  isPending: boolean;
}) {
  const [nombre, setNombre] = useState(field.nombre);
  const [opciones, setOpciones] = useState(field.opciones.join(", "));
  const [saving, setSaving] = useState(false);

  if (isEditing) {
    return (
      <div className="rounded-lg border p-3 space-y-2 bg-muted/40">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del campo"
        />
        {field.tipo === "select" && (
          <Input
            value={opciones}
            onChange={(e) => setOpciones(e.target.value)}
            placeholder="Opciones separadas por coma"
          />
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateCustomField(field.id, {
                  nombre,
                  ...(field.tipo === "select"
                    ? { opciones: opciones.split(",").map((s) => s.trim()).filter(Boolean) }
                    : {}),
                });
                onSavedEdit({
                  nombre,
                  opciones: field.tipo === "select"
                    ? opciones.split(",").map((s) => s.trim()).filter(Boolean)
                    : field.opciones,
                });
                toast.success("Campo actualizado.");
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <Check className="size-3.5 mr-1" /> Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>
            <X className="size-3.5 mr-1" /> Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <button
        className="cursor-grab text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={!canMoveUp || isPending}
        onClick={onMoveUp}
        title="Mover arriba"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{field.nombre}</p>
        <p className="text-xs text-muted-foreground">{TIPO_LABELS[field.tipo] ?? field.tipo}</p>
      </div>
      <button
        onClick={onEdit}
        className="text-muted-foreground hover:text-foreground"
        title="Editar"
      >
        <Edit2 className="size-4" />
      </button>
      <button
        onClick={onDelete}
        disabled={isPending}
        className="text-muted-foreground hover:text-destructive"
        title="Eliminar"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function NewFieldDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (field: CustomField) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<FieldType>("texto");
  const [opciones, setOpciones] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!nombre.trim()) {
      toast.error("Ingresa un nombre para el campo.");
      return;
    }
    setLoading(true);
    try {
      const result = await createCustomField({
        nombre,
        tipo,
        opciones:
          tipo === "select"
            ? opciones.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
      });
      onCreated({
        id: result.id,
        nombre,
        tipo,
        opciones: tipo === "select" ? opciones.split(",").map((s) => s.trim()).filter(Boolean) : [],
        orden: 0,
      });
      toast.success("Campo creado.");
      setNombre("");
      setTipo("texto");
      setOpciones("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo campo personalizado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              placeholder="Ej: Empresa, Cargo, Fecha de cumpleaños..."
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as FieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="texto">Texto</SelectItem>
                <SelectItem value="numero">Número</SelectItem>
                <SelectItem value="fecha">Fecha</SelectItem>
                <SelectItem value="select">Lista de opciones</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {tipo === "select" && (
            <div className="space-y-1.5">
              <Label>Opciones (separadas por coma)</Label>
              <Input
                placeholder="Opción 1, Opción 2, Opción 3"
                value={opciones}
                onChange={(e) => setOpciones(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? "Creando..." : "Crear campo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
