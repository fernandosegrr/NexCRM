"use client";

import { useTransition, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { ConversationContact, FunnelStageDTO } from "@/lib/data";
import { upsertContactStage } from "@/app/actions/businesses";
import { avatarColor, initialOf, relativeTime, truncate } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChannelBadge } from "@/components/channel-badge";
import { cn } from "@/lib/utils";

const NO_STAGE_ID = "__none__";

// ── Draggable card ───────────────────────────────────────────────────────

// Contenido visual puro (sin hooks de dnd) — reusado por la card y el overlay
function CardBody({ contact }: { contact: ConversationContact }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8 shrink-0">
          {contact.fotoPerfil && (
            <AvatarImage
              src={contact.fotoPerfil}
              alt={contact.nombre ?? contact.uidUsuario}
            />
          )}
          <AvatarFallback className={cn("text-xs", avatarColor(contact.uidUsuario))}>
            {initialOf(contact.nombre ?? contact.username ?? contact.uidUsuario)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            {contact.nombre ?? contact.username ?? contact.uidUsuario}
          </p>
          <div className="flex items-center gap-1.5">
            <ChannelBadge canal={contact.canal} size="xs" />
            {contact.sugerenciaStageId && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                style={{
                  backgroundColor: (contact.sugerenciaColor ?? "#6366F1") + "22",
                  color: contact.sugerenciaColor ?? "#6366F1",
                }}
                title={`IA sugiere: ${contact.sugerenciaNombre}${contact.sugerenciaRazon ? ` — ${contact.sugerenciaRazon}` : ""}`}
              >
                <Sparkles className="size-2.5" />
                {contact.sugerenciaNombre}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
        {contact.lastContent
          ? truncate(contact.lastContent, 60)
          : contact.lastTipoMedia === "image"    ? "📷 Imagen"
          : contact.lastTipoMedia === "audio"    ? "🎵 Audio"
          : contact.lastTipoMedia === "video"    ? "🎬 Video"
          : contact.lastTipoMedia === "document" ? "📄 Documento"
          : "(sin texto)"}
      </p>
      <p className="mt-1.5 text-right text-[10px] text-muted-foreground">
        {relativeTime(contact.lastAt)}
      </p>
    </>
  );
}

function KanbanCard({
  contact,
  onClick,
  isDragging = false,
}: {
  contact: ConversationContact;
  onClick?: () => void;
  isDragging?: boolean;
}) {
  const cardKey = `${contact.instanciaId}::${contact.uidUsuario}`;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: cardKey,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        "touch-none cursor-grab select-none rounded-lg border border-border bg-card p-3 shadow-sm transition-shadow",
        isDragging && "opacity-50",
        !isDragging && "hover:shadow-md active:cursor-grabbing",
      )}
    >
      <CardBody contact={contact} />
    </div>
  );
}

// ── Droppable column ─────────────────────────────────────────────────────

function KanbanColumn({
  id,
  label,
  color,
  contacts,
  onCardClick,
  activeId,
}: {
  id: string;
  label: string;
  color?: string;
  contacts: ConversationContact[];
  onCardClick: (c: ConversationContact) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex min-w-[220px] w-56 shrink-0 flex-col gap-2 lg:w-64">
      {/* Column header */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
        {color && color !== "#000000" && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="flex-1 truncate text-xs font-semibold">{label}</span>
        <span className="text-[11px] text-muted-foreground">{contacts.length}</span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-lg p-1 transition-colors",
          isOver && "bg-primary/5 ring-1 ring-primary/20",
        )}
      >
        {contacts.map((c) => {
          const cardKey = `${c.instanciaId}::${c.uidUsuario}`;
          return (
            <KanbanCard
              key={cardKey}
              contact={c}
              onClick={() => onCardClick(c)}
              isDragging={activeId === cardKey}
            />
          );
        })}
        {contacts.length === 0 && (
          <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-border/50">
            <p className="text-[11px] text-muted-foreground">Vacío</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main kanban view ─────────────────────────────────────────────────────

export function KanbanView({
  contacts,
  stages,
  onContactSelect,
  onStageChange,
}: {
  contacts: ConversationContact[];
  stages: FunnelStageDTO[];
  onContactSelect: (c: ConversationContact) => void;
  onStageChange: (contactKey: string, newStageId: string | null) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    // distance:8 en mouse → un click sin arrastrar no inicia drag (no choca con onClick)
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const cardKey = active.id as string;
    const newColumnId = over.id as string;
    const newStageId = newColumnId === NO_STAGE_ID ? null : newColumnId;

    // Find the contact being dragged
    const [instanciaId, uidUsuario] = cardKey.split("::");
    const contact = contacts.find(
      (c) => c.instanciaId === instanciaId && c.uidUsuario === uidUsuario,
    );
    if (!contact) return;

    const oldStageId = contact.stageId ?? null;
    if (oldStageId === newStageId) return;

    // Optimistic update
    onStageChange(cardKey, newStageId);

    // Server action
    startTransition(async () => {
      const r = await upsertContactStage(
        instanciaId,
        uidUsuario,
        contact.canal,
        contact.businessId,
        newStageId,
      );
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo mover el contacto.");
        onStageChange(cardKey, oldStageId);
      }
    });
  }

  const activeContact = activeId
    ? (() => {
        const [instanciaId, uidUsuario] = activeId.split("::");
        return contacts.find(
          (c) => c.instanciaId === instanciaId && c.uidUsuario === uidUsuario,
        );
      })()
    : null;

  // Group contacts by column
  const noStageContacts = contacts.filter((c) => !c.stageId);
  const columnContacts = (stageId: string) =>
    contacts.filter((c) => c.stageId === stageId);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full gap-3 overflow-x-auto pb-4">
        {/* Sin etapa column */}
        <KanbanColumn
          id={NO_STAGE_ID}
          label="Sin etapa"
          contacts={noStageContacts}
          onCardClick={onContactSelect}
          activeId={activeId}
        />

        {/* Stage columns */}
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            id={stage.id}
            label={stage.nombre}
            color={stage.color}
            contacts={columnContacts(stage.id)}
            onCardClick={onContactSelect}
            activeId={activeId}
          />
        ))}
      </div>

      {/* Drag overlay — usa CardBody puro (sin re-registrar el draggable) */}
      <DragOverlay>
        {activeContact ? (
          <div className="rotate-2 rounded-lg border border-border bg-card p-3 shadow-lg">
            <CardBody contact={activeContact} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
