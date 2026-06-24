"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { CANAL_LIST, CHANNEL_META } from "@/lib/channels";
import type { BusinessOption } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function MessageFilters({
  businesses,
}: {
  businesses: BusinessOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const businessId = sp.get("businessId") ?? "all";
  const canal = sp.get("canal") ?? "all";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  function update(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === "all") params.delete(k);
      else params.set(k, v);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilters =
    businessId !== "all" || canal !== "all" || Boolean(from) || Boolean(to);

  const dateInputClass = cn(
    "h-11 w-full rounded-md border border-input bg-background/40 px-3 text-sm text-foreground",
    "[color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  return (
    <div className="sticky top-16 z-20 -mx-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5 sm:w-56">
          <Label className="text-xs text-muted-foreground">Negocio</Label>
          <Select
            value={businessId}
            onValueChange={(v) => update({ businessId: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los negocios</SelectItem>
              {businesses.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:w-44">
          <Label className="text-xs text-muted-foreground">Canal</Label>
          <Select value={canal} onValueChange={(v) => update({ canal: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los canales</SelectItem>
              {CANAL_LIST.map((c) => (
                <SelectItem key={c} value={c}>
                  {CHANNEL_META[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => update({ from: e.target.value })}
              className={dateInputClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => update({ to: e.target.value })}
              className={dateInputClass}
            />
          </div>
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => router.push(pathname)}
            className="sm:ml-auto"
          >
            <X /> Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
