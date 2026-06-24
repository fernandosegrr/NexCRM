import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, MessageSquare, Users } from "lucide-react";

import { getBusinessById } from "@/lib/data";
import { buildN8nSnippets } from "@/lib/n8n-snippets";
import { isCanal, type Canal } from "@/lib/channels";
import { shortDate } from "@/lib/format";
import { ChannelBadge } from "@/components/channel-badge";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const business = await getBusinessById(params.id);
  return { title: business?.nombre ?? "Negocio" };
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Bot;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-[18px]" />
      </div>
      <div>
        <p className="text-lg font-semibold leading-none">
          {value.toLocaleString("es-MX")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function SnippetBlock({
  title,
  rol,
  code,
}: {
  title: string;
  rol: "user" | "bot";
  code: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background/50">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge variant={rol === "bot" ? "default" : "muted"}>{rol}</Badge>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <CopyButton value={code} />
      </div>
      <pre className="max-h-72 overflow-auto p-4 text-xs leading-relaxed text-muted-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default async function BusinessDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const business = await getBusinessById(params.id);
  if (!business) notFound();

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://postgres-nexcrm.d6cr6o.easypanel.host";

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/negocios"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Negocios
        </Link>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {business.nombre}
            </h1>
            <Badge variant={business.activo ? "success" : "muted"}>
              {business.activo ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Creado el {shortDate(business.creadoAt)}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {business.canales.map((c) => (
            <ChannelBadge key={c} canal={c} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={MessageSquare} value={business.totalMensajes} label="Mensajes" />
        <Stat icon={Bot} value={business.instancias.length} label="Instancias" />
        <Stat icon={Users} value={business.totalUsuarios} label="Usuarios" />
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Integración n8n</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Copia estos nodos{" "}
            <span className="font-medium text-foreground">HTTP Request</span> en
            tu flujo de n8n. Apuntan a{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {appUrl}/api/messages
            </code>{" "}
            y usan <code className="text-xs">onError: continueRegularOutput</code>{" "}
            para no romper el flujo del bot.
          </p>
        </div>

        {business.instancias.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card/30 px-4 py-8 text-center text-sm text-muted-foreground">
            Este negocio no tiene instancias registradas.
          </p>
        ) : (
          business.instancias.map((inst) => {
            const canal: Canal = isCanal(inst.canal) ? inst.canal : "whatsapp";
            const snippets = buildN8nSnippets(canal, inst.instanciaId, appUrl);
            return (
              <div
                key={inst.id}
                className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ChannelBadge canal={inst.canal} />
                  <code className="rounded bg-muted px-2 py-1 text-xs">
                    {inst.instanciaId}
                  </code>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <SnippetBlock
                    title="Nodo de inicio"
                    rol="user"
                    code={snippets.inicio}
                  />
                  <SnippetBlock
                    title="Nodo final"
                    rol="bot"
                    code={snippets.fin}
                  />
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
