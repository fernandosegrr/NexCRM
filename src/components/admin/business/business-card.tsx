"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bot, ChevronRight, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { setBusinessActivo } from "@/app/actions/businesses";
import { ChannelBadge } from "@/components/channel-badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { BusinessCard as BusinessCardData } from "@/lib/data";
import { cn } from "@/lib/utils";

export function BusinessCard({ business }: { business: BusinessCardData }) {
  const [activo, setActivo] = useState(business.activo);
  const [pending, start] = useTransition();

  function onToggle(v: boolean) {
    setActivo(v);
    start(async () => {
      const r = await setBusinessActivo(business.id, v);
      if (!r.ok) {
        setActivo(!v);
        toast.error(r.error ?? "No se pudo actualizar.");
      } else {
        toast.success(v ? "Negocio activado" : "Negocio desactivado");
      }
    });
  }

  return (
    <Card
      className={cn(
        "group flex flex-col overflow-hidden transition-colors hover:border-primary/40",
        !activo && "opacity-70",
      )}
    >
      <Link href={`/admin/negocios/${business.id}`} className="block p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight">{business.nombre}</h3>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {business.canales.length ? (
            business.canales.map((c) => (
              <ChannelBadge key={c} canal={c} size="xs" />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">Sin canales</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="size-4" />
            {business.totalMensajes.toLocaleString("es-MX")} mensajes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Bot className="size-4" />
            {business.instancias.length}{" "}
            {business.instancias.length === 1 ? "instancia" : "instancias"}
          </span>
        </div>
      </Link>

      <div className="mt-auto flex items-center justify-between border-t border-border px-5 py-3">
        <span
          className={cn(
            "text-xs font-medium",
            activo ? "text-emerald-400" : "text-muted-foreground",
          )}
        >
          {activo ? "Activo" : "Inactivo"}
        </span>
        <Switch
          checked={activo}
          onCheckedChange={onToggle}
          disabled={pending}
          aria-label="Activar o desactivar negocio"
        />
      </div>
    </Card>
  );
}
