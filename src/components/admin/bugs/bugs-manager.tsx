"use client";

import { useMemo, useState } from "react";
import { Bug as BugIcon } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { shortDate, truncate } from "@/lib/format";
import {
  ESTADO_BADGE_CLASS,
  ESTADO_LABELS,
  PRIORIDAD_BADGE_CLASS,
  PRIORIDAD_LABELS,
  TIPO_LABELS,
} from "@/lib/bug-report";
import { BugDetailSheet } from "./bug-detail-sheet";

export type BugReportListItem = {
  id: string;
  businessId: string;
  businessNombre: string;
  nombreReporta: string;
  emailReporta: string | null;
  tipo: string;
  descripcion: string;
  pagina: string | null;
  screenshot: string | null;
  estado: string;
  prioridad: string;
  creadoEn: string;
  resueltoEn: string | null;
  notasCount: number;
};

const ESTADO_FILTROS = ["todos", "abierto", "en_progreso", "resuelto", "descartado"];
const PRIORIDAD_FILTROS = ["todas", "baja", "media", "alta", "critica"];
const TIPO_FILTROS = ["todos", "bug", "sugerencia", "pregunta"];

export function BugsManager({
  reports,
  businesses,
}: {
  reports: BugReportListItem[];
  businesses: { id: string; nombre: string }[];
}) {
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [prioridadFiltro, setPrioridadFiltro] = useState("todas");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [businessFiltro, setBusinessFiltro] = useState("todos");
  const [selected, setSelected] = useState<BugReportListItem | null>(null);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (estadoFiltro !== "todos" && r.estado !== estadoFiltro) return false;
      if (prioridadFiltro !== "todas" && r.prioridad !== prioridadFiltro) return false;
      if (tipoFiltro !== "todos" && r.tipo !== tipoFiltro) return false;
      if (businessFiltro !== "todos" && r.businessId !== businessFiltro) return false;
      return true;
    });
  }, [reports, estadoFiltro, prioridadFiltro, tipoFiltro, businessFiltro]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bugs"
        description="Reportes enviados por usuarios desde el botón de reportar problema."
      />

      <div className="flex flex-wrap gap-2">
        <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADO_FILTROS.map((e) => (
              <SelectItem key={e} value={e}>
                {e === "todos" ? "Todos los estados" : ESTADO_LABELS[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={prioridadFiltro} onValueChange={setPrioridadFiltro}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORIDAD_FILTROS.map((p) => (
              <SelectItem key={p} value={p}>
                {p === "todas" ? "Todas las prioridades" : PRIORIDAD_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPO_FILTROS.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "todos" ? "Todos los tipos" : TIPO_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={businessFiltro} onValueChange={setBusinessFiltro}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los negocios</SelectItem>
            {businesses.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BugIcon}
          title="No hay reportes"
          description="No hay reportes de bugs que coincidan con los filtros."
        />
      ) : (
        <>
          {/* Escritorio */}
          <div className="hidden overflow-hidden rounded-xl border border-border lg:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Negocio</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Página</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="font-medium">{r.businessNombre}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {TIPO_LABELS[r.tipo] ?? r.tipo}
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate text-muted-foreground">
                      {truncate(r.descripcion, 80)}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                      {r.pagina ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={ESTADO_BADGE_CLASS[r.estado] ?? ""}>
                        {ESTADO_LABELS[r.estado] ?? r.estado}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={PRIORIDAD_BADGE_CLASS[r.prioridad] ?? ""}>
                        {PRIORIDAD_LABELS[r.prioridad] ?? r.prioridad}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {shortDate(r.creadoEn)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Móvil / tablet */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="w-full rounded-xl border border-border bg-card p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate font-medium">{r.businessNombre}</p>
                  <Badge className={ESTADO_BADGE_CLASS[r.estado] ?? ""}>
                    {ESTADO_LABELS[r.estado] ?? r.estado}
                  </Badge>
                </div>
                <p className="mt-1.5 truncate text-sm text-muted-foreground">
                  {TIPO_LABELS[r.tipo] ?? r.tipo} · {truncate(r.descripcion, 100)}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <Badge className={PRIORIDAD_BADGE_CLASS[r.prioridad] ?? ""}>
                    {PRIORIDAD_LABELS[r.prioridad] ?? r.prioridad}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {shortDate(r.creadoEn)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <BugDetailSheet
        report={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
