"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronRight, MessageSquare } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

import { setBusinessActivo } from "@/app/actions/businesses";
import { ChannelBadge } from "@/components/channel-badge";
import { EditBusinessDrawer } from "@/components/admin/business/edit-business-drawer";
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

  const waInstance = business.instancias.find((i) => i.canal === "whatsapp");
  const waActivo = waInstance?.activo ?? false;

  return (
    <Card
      className={cn(
        "group flex flex-col overflow-hidden transition-colors hover:border-primary/40",
        !activo && "opacity-70",
      )}
    >
      <Link href={`/admin/negocios/${business.id}`} className="block p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold leading-tight truncate">{business.nombre}</h3>
            {business.plan === "pro" ? (
              <span className="shrink-0 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-500">
                PRO
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                BÁSICO
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {waInstance && (
              <span
                className={cn(
                  "size-2 rounded-full",
                  waActivo ? "bg-emerald-400" : "bg-red-500",
                )}
                title={waActivo ? "WA activa" : "WA inactiva"}
              />
            )}
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
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
            {business.mensajesMes.toLocaleString("es-MX")} este mes
          </span>
          {business.lastMensajeAt && (
            <span className="text-xs">
              Último:{" "}
              {formatDistanceToNow(parseISO(business.lastMensajeAt), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          )}
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
        <div className="flex items-center gap-2">
          <EditBusinessDrawer
            businessId={business.id}
            initialPlan={business.plan}
            initialTablaMemoria={business.tablaMemoria}
          />
          <Switch
            checked={activo}
            onCheckedChange={onToggle}
            disabled={pending}
            aria-label="Activar o desactivar negocio"
          />
        </div>
      </div>
    </Card>
  );
}
