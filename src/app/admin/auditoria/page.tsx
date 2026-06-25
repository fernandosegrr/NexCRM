import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { fullDateTime } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { ChannelBadge } from "@/components/channel-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isCanal } from "@/lib/channels";

export const metadata: Metadata = { title: "Auditoría" };
export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

function pick(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v.length ? v : undefined;
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const statusFilter = pick(searchParams, "status");
  const instanciaFilter = pick(searchParams, "instanciaId");

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(instanciaFilter
        ? { instanciaId: { contains: instanciaFilter, mode: "insensitive" } }
        : {}),
    },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  const statusList = ["ok", "error_400", "error_401", "error_404", "error_422", "error_500"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoría"
        description="Últimas 100 llamadas a POST /api/messages."
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/admin/auditoria"
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !statusFilter
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          Todos
        </a>
        {statusList.map((s) => (
          <a
            key={s}
            href={`/admin/auditoria?status=${s}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s}
          </a>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/30 px-4 py-12 text-center text-sm text-muted-foreground">
          No hay registros de auditoría.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Timestamp</TableHead>
                <TableHead>Instancia</TableHead>
                <TableHead className="w-28">Canal</TableHead>
                <TableHead>UID</TableHead>
                <TableHead className="w-16">Rol</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fullDateTime(log.timestamp.toISOString())}
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate font-mono text-xs">
                    {log.instanciaId}
                  </TableCell>
                  <TableCell>
                    {log.canal && isCanal(log.canal) ? (
                      <ChannelBadge canal={log.canal} size="xs" />
                    ) : (
                      <span className="text-xs text-muted-foreground">{log.canal ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate text-xs">
                    {log.uidUsuario ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">{log.rol ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={log.status === "ok" ? "success" : "destructive"} className="text-[10px]">
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="max-w-[240px] truncate text-xs text-muted-foreground"
                    title={log.errorDetail ?? undefined}
                  >
                    {log.errorDetail
                      ? log.errorDetail.slice(0, 80) + (log.errorDetail.length > 80 ? "…" : "")
                      : log.messageId
                        ? `msg: ${log.messageId}`
                        : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
