import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";

import { getBusinessesForSelect, getMessagesPage } from "@/lib/data";
import { fullDateTime, truncate } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { MessageFilters } from "@/components/admin/messages/message-filters";
import { ChannelBadge } from "@/components/channel-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Mensajes" };
export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

function pick(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v.length ? v : undefined;
}

function preview(m: { contenido: string | null; tipoMedia: string }) {
  if (m.contenido && m.contenido.trim()) return truncate(m.contenido, 90);
  if (m.tipoMedia && m.tipoMedia !== "text") return `[${m.tipoMedia}]`;
  return "—";
}

function RolBadge({ rol }: { rol: string }) {
  return rol === "bot" ? (
    <Badge>bot</Badge>
  ) : (
    <Badge variant="muted">user</Badge>
  );
}

export default async function MensajesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const businessId = pick(searchParams, "businessId");
  const canal = pick(searchParams, "canal");
  const fromStr = pick(searchParams, "from");
  const toStr = pick(searchParams, "to");
  const page = Math.max(1, Number(pick(searchParams, "page") ?? 1) || 1);

  const from = fromStr ? new Date(`${fromStr}T00:00:00`) : undefined;
  const to = toStr ? new Date(`${toStr}T23:59:59`) : undefined;

  const [businesses, data] = await Promise.all([
    getBusinessesForSelect(),
    getMessagesPage({ businessId, canal, from, to, page, pageSize: 20 }),
  ]);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (businessId) params.set("businessId", businessId);
    if (canal) params.set("canal", canal);
    if (fromStr) params.set("from", fromStr);
    if (toStr) params.set("to", toStr);
    params.set("page", String(p));
    return `/admin/mensajes?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mensajes"
        description="Historial de conversaciones registradas desde n8n."
      />

      <MessageFilters businesses={businesses} />

      {data.rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Sin mensajes"
          description="No encontramos mensajes con los filtros actuales. Ajusta los filtros o espera a que tus bots registren conversaciones."
        />
      ) : (
        <>
          {/* Escritorio */}
          <div className="hidden overflow-hidden rounded-xl border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Negocio</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>UID usuario</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Contenido</TableHead>
                  <TableHead className="text-right">Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.nombreNegocio}
                    </TableCell>
                    <TableCell>
                      <ChannelBadge canal={m.canal} size="xs" />
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate font-mono text-xs text-muted-foreground">
                      {m.uidUsuario}
                    </TableCell>
                    <TableCell>
                      <RolBadge rol={m.rol} />
                    </TableCell>
                    <TableCell className="max-w-sm text-muted-foreground">
                      {preview(m)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                      {fullDateTime(m.enviadoAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Móvil */}
          <div className="space-y-3 md:hidden">
            {data.rows.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{m.nombreNegocio}</span>
                  <ChannelBadge canal={m.canal} size="xs" />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {preview(m)}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <RolBadge rol={m.rol} />
                    <span className="font-mono">{truncate(m.uidUsuario, 18)}</span>
                  </span>
                  <span>{fullDateTime(m.enviadoAt)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Paginación */}
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              {data.total.toLocaleString("es-MX")} mensajes · Página {data.page}{" "}
              de {data.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                asChild
                disabled={data.page <= 1}
                className={data.page <= 1 ? "pointer-events-none opacity-50" : ""}
              >
                <Link href={pageHref(data.page - 1)} aria-label="Página anterior">
                  <ChevronLeft /> Anterior
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
                disabled={data.page >= data.totalPages}
                className={
                  data.page >= data.totalPages
                    ? "pointer-events-none opacity-50"
                    : ""
                }
              >
                <Link href={pageHref(data.page + 1)} aria-label="Página siguiente">
                  Siguiente <ChevronRight />
                </Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
