"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteBusiness } from "@/app/actions/businesses";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteBusinessButton({
  businessId,
  businessNombre,
}: {
  businessId: string;
  businessNombre: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();

  const canDelete = confirmText === businessNombre;

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) setConfirmText("");
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteBusiness(businessId);
      if (result.ok) {
        toast.success("Negocio eliminado.");
        router.push("/admin/negocios");
      } else {
        toast.error(result.error ?? "No se pudo eliminar el negocio.");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-1.5">
          <Trash2 className="size-4" /> Borrar negocio
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Borrar &ldquo;{businessNombre}&rdquo;?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p>
                Esta acción es <strong>permanente e irreversible</strong>. Se eliminarán:
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-sm">
                <li>Todas las conversaciones y mensajes</li>
                <li>Todos los contactos y sus datos</li>
                <li>Etapas del embudo y configuración de seguimiento</li>
                <li>Campañas e historial de envíos</li>
                <li>Configuración de pagos e historial de cobros</li>
                <li>Instancias de canales (WhatsApp, Instagram, Messenger)</li>
                <li>Los usuarios del negocio quedarán sin negocio asignado</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="confirm-name" className="text-sm">
            Escribe <strong className="font-semibold">{businessNombre}</strong> para confirmar:
          </Label>
          <Input
            id="confirm-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={businessNombre}
            autoComplete="off"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || isPending}
          >
            {isPending ? "Borrando..." : "Sí, borrar definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
