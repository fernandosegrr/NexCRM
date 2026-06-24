import { cn } from "@/lib/utils";
import { channelMeta } from "@/lib/channels";

export function ChannelBadge({
  canal,
  className,
  size = "sm",
}: {
  canal: string;
  className?: string;
  size?: "xs" | "sm";
}) {
  const meta = channelMeta(canal);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        meta.badgeClass,
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          // En el chip de IG (fondo degradado) el punto va blanco
          canal === "instagram" ? "bg-white/90" : meta.dotClass,
        )}
      />
      {meta.label}
    </span>
  );
}

export function ChannelDot({ canal }: { canal: string }) {
  const meta = channelMeta(canal);
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        canal === "instagram" ? "bg-instagram" : meta.dotClass,
      )}
      title={meta.label}
    />
  );
}
