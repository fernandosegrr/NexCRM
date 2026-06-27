"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import type { FunnelStageDTO } from "@/lib/data";
import { upsertContactStage } from "@/app/actions/businesses";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Radix Select prohíbe value="" en los items, usamos un centinela para "Sin etapa".
const NONE = "__none__";

export type StageChange = {
  stageId: string | null;
  nombre: string | null;
  color: string | null;
};

export function StageSelector({
  instanciaId,
  uidUsuario,
  canal,
  businessId,
  currentStageId,
  onChanged,
}: {
  instanciaId: string;
  uidUsuario: string;
  canal: string;
  businessId: string;
  currentStageId: string | null;
  onChanged?: (change: StageChange) => void;
}) {
  const [stages, setStages] = useState<FunnelStageDTO[]>([]);
  const [value, setValue] = useState<string>(currentStageId ?? NONE);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/funnel-stages?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => r.json())
      .then((d: { stages?: FunnelStageDTO[] }) => setStages(d.stages ?? []))
      .catch(() => {});
  }, [businessId]);

  // Sync with parent when contact changes
  useEffect(() => {
    setValue(currentStageId ?? NONE);
  }, [currentStageId, instanciaId, uidUsuario]);

  function handleChange(newValue: string) {
    const stageId = newValue === NONE ? null : newValue;
    const prev = value;
    setValue(newValue);
    startTransition(async () => {
      const r = await upsertContactStage(
        instanciaId,
        uidUsuario,
        canal,
        businessId,
        stageId,
      );
      if (r.ok) {
        const stage = stages.find((s) => s.id === stageId);
        onChanged?.({
          stageId,
          nombre: stage?.nombre ?? null,
          color: stage?.color ?? null,
        });
      } else {
        toast.error(r.error ?? "No se pudo actualizar la etapa.");
        setValue(prev);
      }
    });
  }

  if (stages.length === 0) return null;

  const selectedStage = stages.find((s) => s.id === value);

  return (
    <Select value={value} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger className="h-8 w-auto max-w-[160px] gap-1.5 border-border bg-transparent text-xs">
        {selectedStage ? (
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: selectedStage.color }}
            />
            <span className="truncate">{selectedStage.nombre}</span>
          </span>
        ) : (
          <SelectValue placeholder="Sin etapa" />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">Sin etapa</span>
        </SelectItem>
        {stages.map((stage) => (
          <SelectItem key={stage.id} value={stage.id}>
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              {stage.nombre}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
