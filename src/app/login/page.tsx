import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Glows de fondo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-indigo-600/10 blur-[100px]"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo showSuffix={false} imageClassName="h-20" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Bienvenido de vuelta
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Entra a tu panel de NexAI CRM
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur-sm sm:p-7">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Conversaciones de WhatsApp, Instagram y Messenger en un solo lugar.
        </p>
      </div>
    </main>
  );
}
