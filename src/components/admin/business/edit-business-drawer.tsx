"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { updateBusiness } from "@/app/actions/businesses";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function EditBusinessDrawer({
  businessId,
  initialPlan,
  initialTablaMemoria,
}: {
  businessId: string;
  initialPlan: string;
  initialTablaMemoria?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(initialPlan);
  const [tablaMemoria, setTablaMemoria] = useState(initialTablaMemoria ?? "");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const r = await updateBusiness(businessId, {
        plan: plan as "basico" | "pro",
        tablaMemoria: tablaMemoria.trim() || null,
      });
      if (r.ok) {
        toast.success("Negocio actualizado.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo actualizar el negocio.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Editar negocio"
        >
          <Pencil className="size-3.5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Editar negocio</SheetTitle>
          <SheetDescription>
            Actualiza el plan y la tabla de memoria del bot.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="space-y-2">
            <Label htmlFor="edit-plan">Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger id="edit-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basico">Básico</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-tabla-memoria">Tabla de memoria del bot</Label>
            <Input
              id="edit-tabla-memoria"
              value={tablaMemoria}
              onChange={(e) => setTablaMemoria(e.target.value)}
              placeholder="ej: memory_vepiautomkt"
            />
            <p className="text-[11px] text-muted-foreground">
              Nombre exacto de la tabla de memoria en la BD de n8n.
              Si no usas seguimiento automático, déjalo vacío.
            </p>
          </div>
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" /> Guardando…
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
