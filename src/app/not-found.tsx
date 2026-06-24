import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo showSuffix={false} className="mb-8" />
      <p className="text-sm font-medium text-primary">Error 404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Página no encontrada
      </h1>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        La página que buscas no existe o fue movida.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
