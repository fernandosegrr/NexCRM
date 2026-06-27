import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  value,
  label,
  sub,
  className,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3",
        className,
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none">
          {typeof value === "number" ? value.toLocaleString("es-MX") : value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground/70">{sub}</p>}
      </div>
    </div>
  );
}
