import { cn } from "@/lib/utils";

/**
 * Marca NexAI: flecha de crecimiento estilo trazo de circuito con nodos,
 * basada en el logo oficial. Usa un gradiente azul→índigo para destacar
 * sobre fondos oscuros (el navy original quedaría invisible sobre negro).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 40"
      className={cn("h-8 w-auto", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nexai-mark" x1="4" y1="34" x2="40" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="0.55" stopColor="#6366F1" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <g
        stroke="url(#nexai-mark)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Pincel/inicio del trazo */}
        <path d="M4 33 L9.5 26.5" />
        {/* Línea de crecimiento */}
        <path d="M7 30 L17 21 L24 28 L35 14" />
        {/* Punta de flecha (arriba-derecha) */}
        <path d="M28.5 14 L35 14 L35 20.5" />
        {/* Antena vertical hacia el nodo superior */}
        <path d="M17 21 L17 10.5" />
      </g>
      {/* Nodos de circuito */}
      <g fill="url(#nexai-mark)">
        <circle cx="17" cy="21" r="2.3" />
        <circle cx="24" cy="28" r="2.3" />
        <circle cx="17" cy="9" r="2.3" />
      </g>
    </svg>
  );
}

export function Logo({
  className,
  showText = true,
  showSuffix = true,
  textClassName,
}: {
  className?: string;
  showText?: boolean;
  showSuffix?: boolean;
  textClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {showText && (
        <span
          className={cn(
            "text-lg font-semibold tracking-tight text-foreground",
            textClassName,
          )}
        >
          NexAI
          {showSuffix && (
            <span className="ml-1.5 font-normal text-muted-foreground">CRM</span>
          )}
        </span>
      )}
    </div>
  );
}
