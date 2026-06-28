import { Lock } from "lucide-react";

export function AccessDenied({
  mensaje = "No tienes acceso a esta sección.",
}: {
  mensaje?: string;
}) {
  return (
    <div className="flex h-full flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="size-7" />
        </div>
        <h2 className="text-lg font-semibold">{mensaje}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Contacta al administrador de tu cuenta para solicitar acceso.
        </p>
      </div>
    </div>
  );
}
