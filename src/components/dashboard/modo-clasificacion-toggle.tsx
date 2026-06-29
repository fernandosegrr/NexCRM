"use client";

import { useState, useTransition } from "react";
import { Eye, Zap } from "lucide-react";
import { toast } from "sonner";

import { updateModoClasificacion } from "@/app/actions/businesses";
import { cn } from "@/lib/utils";

type Modo = "sugerencia" | "automatico";

const OPCIONES: {
  valor: Modo;
  label: string;
  Icon: React.ElementType;
  descripcion: string;
}[] = [
  {
    valor: "sugerencia",
    label: "Sugerencia",
    Icon: Eye,
    descripcion: "Verás sugerencias en el chat para aprobar o descartar.",
  },
  {
    valor: "automatico",
    label: "Automático",
    Icon: Zap,
    descripcion:
      "La IA moverá contactos sin confirmación cuando tenga alta confianza.",
  },
];

export function ModoClasificacionToggle({
  businessId,
  modoActual,
  canConfigure,
}: {
  businessId: string;
  modoActual: string;
  canConfigure: boolean;
}) {
  const [modo, setModo] = useState<Modo>(
    modoActual === "automatico" ? "automatico" : "sugerencia",
  );
  const [pending, startTransition] = useTransition();

  function handleSelect(nuevoModo: Modo) {
    if (nuevoModo === modo || !canConfigure) return;
    startTransition(async () => {
      const r = await updateModoClasificacion(businessId, nuevoModo);
      if (r.ok) {
        setModo(nuevoModo);
        toast.success("Modo de clasificación actualizado.");
      } else {
        toast.error(r.error ?? "No se pudo guardar.");
      }
    });
  }

  const descripcionActiva = OPCIONES.find((o) => o.valor === modo)?.descripcion ?? "";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">Cómo clasifica la IA tus contactos</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Elige cómo actúa la IA cuando detecta que un contacto debe cambiar de etapa.
        </p>
      </div>

      <div
        title={
          !canConfigure
            ? "Contacta al administrador para cambiar esta configuración"
            : undefined
        }
        className={cn(!canConfigure && "cursor-not-allowed opacity-60")}
      >
        <div className="flex rounded-lg border border-border overflow-hidden">
          {OPCIONES.map(({ valor, label, Icon }) => (
            <button
              key={valor}
              type="button"
              onClick={() => handleSelect(valor)}
              disabled={pending || !canConfigure}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors first:border-r first:border-border",
                modo === valor
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted",
                (!canConfigure || pending) && "cursor-not-allowed",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">{descripcionActiva}</p>
    </div>
  );
}
