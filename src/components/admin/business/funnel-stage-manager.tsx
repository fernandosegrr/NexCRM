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
import { GripVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { FunnelStageDTO } from "@/lib/data";
import {
  countContactsInStage,
  createFunnelStage,
  deleteFunnelStage,
  reorderFunnelStages,
  updateFunnelStage,
  upsertFollowUpConfig,
  type FunnelStageInput,
  type FollowUpConfigInput,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

type FollowUpState = {
  activo: boolean;
  modoEnvio: string;
  tiempoInactividad: number;
  maxEnviosPorDia: number;
  maxEnviosTotal: number | null;
};

const DEFAULT_FOLLOWUP: FollowUpState = {
  activo: false,
  modoEnvio: "manual",
  tiempoInactividad: 120,
  maxEnviosPorDia: 1,
  maxEnviosTotal: 3,
};

function mensajePlaceholder(stageName: string): string {
  const n = stageName.toLowerCase();
  if (n.includes("nuevo") || n.includes("lead"))
    return "Ej: Pregunta cómo podemos ayudarles y ofrece información inicial. Tono amigable y sin presión.";
  if (n.includes("interesado"))
    return "Ej: Pregunta si pudo revisar la información y ofrece resolver dudas. Tono cercano.";
  if (n.includes("negociaci"))
    return "Ej: Pregunta si tuvo oportunidad de revisar la cotización. Tono profesional pero cálido.";
  if (n.includes("cerrar") || n.includes("cierre"))
    return "Ej: Pregunta si están listos para proceder y menciona la disponibilidad. Crear urgencia amable.";
  return "Ej: Pregunta si pudo revisar la información enviada. Tono amigable y directo.";
}

// ── Stage form dialog ────────────────────────────────────────────────────

function StageDialog({
  open,
  onOpenChange,
  initial,
  initialFollowUp,
  businessPlan,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: FunnelStageInput;
  initialFollowUp?: FollowUpState | null;
  businessPlan: string;
  onSave: (input: FunnelStageInput, followUp: FollowUpState | null) => void;
  saving: boolean;
}) {
  const [nombre, setNombre] = useState(initial.nombre);
  const [color, setColor] = useState(initial.color);
  const [descripcion, setDescripcion] = useState(initial.descripcion ?? "");
  const [mensaje, setMensaje] = useState(initial.mensajeSeguimiento ?? "");
  const [followUp, setFollowUp] = useState<FollowUpState>(
    initialFollowUp ?? DEFAULT_FOLLOWUP,
  );

  // Sync when dialog reopens with new initial values
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setNombre(initial.nombre);
      setColor(initial.color);
      setDescripcion(initial.descripcion ?? "");
      setMensaje(initial.mensajeSeguimiento ?? "");
      setFollowUp(initialFollowUp ?? DEFAULT_FOLLOWUP);
    }
  }

  const isPro = businessPlan === "pro";

  function handleMaxEnviosTotal(val: string) {
    setFollowUp((f) => ({
      ...f,
      maxEnviosTotal: val === "null" ? null : Number(val),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial.nombre ? "Editar etapa" : "Nueva etapa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Nombre */}
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

          {/* Color */}
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

          {/* Descripción */}
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

          {/* Guía de tono */}
          <div className="space-y-1.5">
            <Label htmlFor="stage-msg">Guía de tono para el seguimiento</Label>
            <Textarea
              id="stage-msg"
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder={mensajePlaceholder(nombre)}
              rows={2}
            />
            <p className="text-[11px] text-muted-foreground">
              La IA usará esto como guía para generar un mensaje personalizado según la conversación de cada contacto. Si lo dejas vacío, la IA generará algo apropiado para la etapa automáticamente.
            </p>
          </div>

          {/* ── Seguimiento automático ─────────────────────────────── */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Seguimiento automático</Label>
              {isPro ? (
                <Switch
                  checked={followUp.activo}
                  onCheckedChange={(v) => setFollowUp((f) => ({ ...f, activo: v }))}
                />
              ) : (
                <div
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  title="Disponible en plan Pro"
                >
                  <Lock className="size-3.5" />
                  <span>Plan Pro</span>
                </div>
              )}
            </div>

            {!isPro && (
              <p className="text-[11px] text-muted-foreground">
                Disponible en plan Pro. Activa el seguimiento automático para esta etapa.
              </p>
            )}

            {isPro && followUp.activo && (
              <div className="space-y-3 pt-1">
                {/* Warning si falta mensajeSeguimiento */}
                {!mensaje.trim() && (
                  <p className="text-[11px] text-amber-500">
                    ⚠️ Define un mensaje de seguimiento en la etapa para activar el envío automático.
                  </p>
                )}

                {/* Modo de envío */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Modo de envío</Label>
                  <Select
                    value={followUp.modoEnvio}
                    onValueChange={(v) => setFollowUp((f) => ({ ...f, modoEnvio: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatico">⚡ Automático — la IA envía sin confirmación</SelectItem>
                      <SelectItem value="manual">👁 Sugerencia — la IA sugiere, yo apruebo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Tiempo de inactividad */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Tiempo de inactividad</Label>
                  <Select
                    value={String(followUp.tiempoInactividad)}
                    onValueChange={(v) => setFollowUp((f) => ({ ...f, tiempoInactividad: Number(v) }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutos</SelectItem>
                      <SelectItem value="60">1 hora</SelectItem>
                      <SelectItem value="120">2 horas</SelectItem>
                      <SelectItem value="240">4 horas</SelectItem>
                      <SelectItem value="480">8 horas</SelectItem>
                      <SelectItem value="1440">24 horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Límites */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Límite diario</Label>
                    <Select
                      value={String(followUp.maxEnviosPorDia)}
                      onValueChange={(v) => setFollowUp((f) => ({ ...f, maxEnviosPorDia: Number(v) }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 por día</SelectItem>
                        <SelectItem value="2">2 por día</SelectItem>
                        <SelectItem value="3">3 por día</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Límite total</Label>
                    <Select
                      value={followUp.maxEnviosTotal === null ? "null" : String(followUp.maxEnviosTotal)}
                      onValueChange={handleMaxEnviosTotal}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 en total</SelectItem>
                        <SelectItem value="2">2 en total</SelectItem>
                        <SelectItem value="3">3 en total</SelectItem>
                        <SelectItem value="5">5 en total</SelectItem>
                        <SelectItem value="null">Sin límite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onSave(
                {
                  nombre: nombre.trim(),
                  color,
                  descripcion: descripcion.trim() || null,
                  mensajeSeguimiento: mensaje.trim() || null,
                },
                isPro ? followUp : null,
              )
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
      {stage.followUpConfig?.activo && (
        <span className="hidden shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-500 sm:block">
          Auto
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

const NONE_OPTION = "__none__";

export function FunnelStageManager({
  businessId,
  businessPlan,
  initialStages,
}: {
  businessId: string;
  businessPlan: string;
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

  function handleSave(input: FunnelStageInput, followUp: FollowUpState | null) {
    startTransition(async () => {
      if (editingStage) {
        const r = await updateFunnelStage(editingStage.id, input);
        if (!r.ok) {
          toast.error(r.error ?? "Error al actualizar.");
          return;
        }
        if (followUp) {
          await upsertFollowUpConfig(editingStage.id, followUp as FollowUpConfigInput);
        }
        setStages((prev) =>
          prev.map((s) =>
            s.id === editingStage.id
              ? { ...s, ...input, followUpConfig: followUp ?? s.followUpConfig }
              : s,
          ),
        );
        toast.success("Etapa actualizada.");
        setDialogOpen(false);
      } else {
        const r = await createFunnelStage(businessId, input);
        if (!r.ok || !r.id) {
          toast.error(r.error ?? "Error al crear.");
          return;
        }
        if (followUp) {
          await upsertFollowUpConfig(r.id, followUp as FollowUpConfigInput);
        }
        const newStage: FunnelStageDTO = {
          id: r.id,
          businessId,
          nombre: input.nombre,
          color: input.color,
          descripcion: input.descripcion ?? null,
          mensajeSeguimiento: input.mensajeSeguimiento ?? null,
          orden: stages.length + 1,
          followUpConfig: followUp ?? null,
        };
        setStages((prev) => [...prev, newStage]);
        toast.success("Etapa creada.");
        setDialogOpen(false);
      }
    });
  }

  function requestDelete(stage: FunnelStageDTO) {
    setDeleteTarget(stage);
    setMoveToId(NONE_OPTION);
    setDeleteCount(null);
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

  const editingFollowUp = editingStage?.followUpConfig ?? null;

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
        initialFollowUp={editingFollowUp}
        businessPlan={businessPlan}
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
