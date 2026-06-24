"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createBusiness } from "@/app/actions/businesses";
import { CANAL_LIST, CHANNEL_META } from "@/lib/channels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function NewBusinessDrawer({
  variant = "default",
}: {
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [ids, setIds] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function reset() {
    setNombre("");
    setSel({});
    setIds({});
  }

  function submit() {
    const instancias = CANAL_LIST.filter((c) => sel[c]).map((c) => ({
      canal: c,
      instanciaId: (ids[c] ?? "").trim(),
    }));

    if (!nombre.trim()) {
      toast.error("Escribe el nombre del negocio.");
      return;
    }
    if (instancias.length === 0) {
      toast.error("Selecciona al menos un canal.");
      return;
    }
    if (instancias.some((i) => !i.instanciaId)) {
      toast.error("Completa el ID de instancia de cada canal seleccionado.");
      return;
    }

    start(async () => {
      const r = await createBusiness({ nombre: nombre.trim(), instancias });
      if (r.ok) {
        toast.success("Negocio creado correctamente.");
        setOpen(false);
        reset();
        router.refresh();
        if (r.id) router.push(`/admin/negocios/${r.id}`);
      } else {
        toast.error(r.error ?? "No se pudo crear el negocio.");
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button variant={variant}>
          <Plus /> Nuevo negocio
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Nuevo negocio</SheetTitle>
          <SheetDescription>
            Registra un negocio y sus instancias por canal.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre del negocio</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tacos El Güero"
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <Label>Canales</Label>
            <div className="space-y-3">
              {CANAL_LIST.map((c) => {
                const meta = CHANNEL_META[c];
                const checked = !!sel[c];
                return (
                  <div
                    key={c}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "border-border",
                    )}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSel((s) => ({ ...s, [c]: !!v }))
                        }
                      />
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            c === "instagram" ? "bg-instagram" : meta.dotClass,
                          )}
                        />
                        {meta.label}
                      </span>
                    </label>

                    {checked && (
                      <div className="mt-3 space-y-1.5 pl-8">
                        <Label
                          htmlFor={`id-${c}`}
                          className="text-xs font-normal text-muted-foreground"
                        >
                          {meta.instanceLabel}
                        </Label>
                        <Input
                          id={`id-${c}`}
                          value={ids[c] ?? ""}
                          onChange={(e) =>
                            setIds((s) => ({ ...s, [c]: e.target.value }))
                          }
                          placeholder={meta.instancePlaceholder}
                          className="font-mono text-sm"
                        />
                        {meta.instanceHelp && (
                          <p className="text-[11px] text-muted-foreground">
                            {meta.instanceHelp}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
                <Loader2 className="animate-spin" /> Creando…
              </>
            ) : (
              "Crear negocio"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
