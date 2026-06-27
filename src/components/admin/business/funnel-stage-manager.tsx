"use client";

import { useTransition, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { FunnelStageDTO } from "@/lib/data";
import {
  countContactsInStage,
  createFunnelStage,
  deleteFunnelStage,
  reorderFunnelStages,
  updateFunnelStage,
  type FunnelStageInput,
} from "@/app/actions/businesses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Stage form dialog ────────────────────────────────────────────────────

function StageDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: FunnelStageInput;
  onSave: (input: FunnelStageInput) => void;
  saving: boolean;
}) {
  const [nombre, setNombre] = useState(initial.nombre);
  const [color, setColor] = useState(initial.color);
  const [descripcion, setDescripcion] = useState(initial.descripcion ?? "");
  const [mensaje, setMensaje] = useState(initial.mensajeSeguimiento ?? "");

  // Sync when dialog reopens with new initial values
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setNombre(initial.nombre);
      setColor(initial.color);
      setDescripcion(initial.descripcion ?? "");
      setMensaje(initial.mensajeSeguimiento ?? "");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial.nombre ? "Editar etapa" : "Nueva etapa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="stage-nombre">Nombre</Label>
            <Input
              id="stage-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ej: En negociación"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage-color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="stage-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border border-border bg-transparent p-1"
              />
              <code className="text-sm text-muted-foreground">{color}</code>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage-desc">Descripción (para la IA)</Label>
            <Textarea
              id="stage-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="ej: Mostró interés real: preguntó por precios, disponibilidad o detalles del producto."
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground">
              El clasificador de IA usa esta descripción para decidir si un contacto entra a esta etapa.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage-msg">Mensaje de seguimiento</Label>
            <Textarea
              id="stage-msg"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder="Hola {nombre}, ¿pudiste revisar la información que te enviamos?"
              rows={2}
            />
            <p className="text-[11px] text-muted-foreground">
              Opcional. Se enviará cuando un lead lleve tiempo sin responder en esta etapa.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onSave({
                nombre: nombre.trim(),
                color,
                descripcion: descripcion.trim() || null,
                mensajeSeguimiento: mensaje.trim() || null,
              })
            }
            disabled={saving || !nombre.trim()}
          >
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sortable row ─────────────────────────────────────────────────────────

function SortableStageRow({
  stage,
  onEdit,
  onDelete,
}: {
  stage: FunnelStageDTO;
  onEdit: (s: FunnelStageDTO) => void;
  onDelete: (s: FunnelStageDTO) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground"
        aria-label="Arrastrar"
      >
        <GripVertical className="size-4" />
      </button>
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: stage.color }}
      />
      <span className="flex-1 truncate text-sm font-medium">{stage.nombre}</span>
      {stage.mensajeSeguimiento && (
        <span className="hidden truncate text-xs text-muted-foreground sm:block sm:max-w-[200px]">
          {stage.mensajeSeguimiento}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => onEdit(stage)}
        aria-label="Editar"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
        onClick={() => onDelete(stage)}
        aria-label="Eliminar"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────

const EMPTY_STAGE: FunnelStageInput = {
  nombre: "",
  color: "#6366F1",
  descripcion: null,
  mensajeSeguimiento: null,
};

// Centinela para "dejar sin etapa" en el select de reasignación al borrar.
const NONE_OPTION = "__none__";

export function FunnelStageManager({
  businessId,
  initialStages,
}: {
  businessId: string;
  initialStages: FunnelStageDTO[];
}) {
  const [stages, setStages] = useState<FunnelStageDTO[]>(initialStages);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<FunnelStageDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FunnelStageDTO | null>(null);
  const [deleteCount, setDeleteCount] = useState<number | null>(null);
  const [moveToId, setMoveToId] = useState<string>(NONE_OPTION);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    const newOrder = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({
      ...s,
      orden: i + 1,
    }));
    setStages(newOrder);

    startTransition(async () => {
      const r = await reorderFunnelStages(
        businessId,
        newOrder.map((s) => s.id),
      );
      if (!r.ok) toast.error(r.error ?? "No se pudo reordenar.");
    });
  }

  function openCreate() {
    setEditingStage(null);
    setDialogOpen(true);
  }

  function openEdit(stage: FunnelStageDTO) {
    setEditingStage(stage);
    setDialogOpen(true);
  }

  function handleSave(input: FunnelStageInput) {
    startTransition(async () => {
      if (editingStage) {
        const r = await updateFunnelStage(editingStage.id, input);
        if (r.ok) {
          setStages((prev) =>
            prev.map((s) =>
              s.id === editingStage.id ? { ...s, ...input } : s,
            ),
          );
          toast.success("Etapa actualizada.");
          setDialogOpen(false);
        } else {
          toast.error(r.error ?? "Error al actualizar.");
        }
      } else {
        const r = await createFunnelStage(businessId, input);
        if (r.ok && r.id) {
          const newStage: FunnelStageDTO = {
            id: r.id,
            businessId,
            nombre: input.nombre,
            color: input.color,
            descripcion: input.descripcion ?? null,
            mensajeSeguimiento: input.mensajeSeguimiento ?? null,
            orden: stages.length + 1,
          };
          setStages((prev) => [...prev, newStage]);
          toast.success("Etapa creada.");
          setDialogOpen(false);
        } else {
          toast.error(r.error ?? "Error al crear.");
        }
      }
    });
  }

  function requestDelete(stage: FunnelStageDTO) {
    setDeleteTarget(stage);
    setMoveToId(NONE_OPTION);
    setDeleteCount(null);
    // Cuántos contactos hay en esta etapa (para decidir si pedir reasignación)
    void countContactsInStage(stage.id).then(setDeleteCount);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const stageId = deleteTarget.id;
    const moveTo = moveToId === NONE_OPTION ? null : moveToId;
    startTransition(async () => {
      const r = await deleteFunnelStage(stageId, moveTo);
      if (r.ok) {
        setStages((prev) => prev.filter((s) => s.id !== stageId));
        toast.success("Etapa eliminada.");
        setDeleteTarget(null);
      } else {
        toast.error(r.error ?? "Error al eliminar.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={stages.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {stages.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-card/30 px-4 py-6 text-center text-sm text-muted-foreground">
                Sin etapas. Crea la primera etapa del embudo.
              </p>
            ) : (
              stages.map((stage) => (
                <SortableStageRow
                  key={stage.id}
                  stage={stage}
                  onEdit={openEdit}
                  onDelete={requestDelete}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      <Button
        variant="outline"
        size="sm"
        onClick={openCreate}
        disabled={pending}
      >
        <Plus className="mr-1.5 size-3.5" />
        Nueva etapa
      </Button>

      <StageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editingStage ?? EMPTY_STAGE}
        onSave={handleSave}
        saving={pending}
      />

      {/* Diálogo de borrado con reasignación */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar etapa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm">
              Vas a eliminar la etapa{" "}
              <span className="font-semibold">{deleteTarget?.nombre}</span>.
            </p>
            {deleteCount === null ? (
              <p className="text-sm text-muted-foreground">Verificando contactos…</p>
            ) : deleteCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tiene contactos asignados. Se eliminará directamente.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Esta etapa tiene{" "}
                  <span className="font-medium text-foreground">{deleteCount}</span>{" "}
                  contacto{deleteCount > 1 ? "s" : ""}. ¿A qué etapa moverlos?
                </p>
                <Select value={moveToId} onValueChange={setMoveToId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_OPTION}>
                      <span className="text-muted-foreground">Dejar sin etapa</span>
                    </SelectItem>
                    {stages
                      .filter((s) => s.id !== deleteTarget?.id)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            {s.nombre}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending || deleteCount === null}
            >
              {pending ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
