import { CheckCircle, XCircle } from "lucide-react";

import type { IncidentLogEntry } from "@/lib/data";
import { fullDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function tipoBadge(tipo: string) {
  if (tipo === "auto-recuperada") return <Badge variant="success">Auto-recuperada</Badge>;
  if (tipo === "intervencion_manual") return <Badge variant="secondary">Intervención manual</Badge>;
  return <Badge variant="destructive">Caída detectada</Badge>;
}

function resultadoBadge(resultado: string | null) {
  if (!resultado || resultado === "pendiente") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (resultado === "exitosa") return <Badge variant="success">Exitosa</Badge>;
  if (resultado === "fallida") return <Badge variant="destructive">Fallida</Badge>;
  return <Badge variant="secondary">{resultado}</Badge>;
}

function durationStr(creadoAt: string, resolvedAt: string | null): string {
  if (!resolvedAt) return "—";
  const ms = new Date(resolvedAt).getTime() - new Date(creadoAt).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)} h ${mins % 60} min`;
}

export function IncidentTable({ incidents }: { incidents: IncidentLogEntry[] }) {
  if (incidents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-card/30 px-4 py-8 text-center text-sm text-muted-foreground">
        Sin incidentes registrados.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Instancia / Negocio</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Contactos</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead>Duración</TableHead>
            <TableHead className="text-center">Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {incidents.map((inc) => (
            <TableRow key={inc.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {fullDateTime(inc.creadoAt)}
              </TableCell>
              <TableCell>
                <p className="text-xs font-medium">{inc.nombreNegocio ?? "—"}</p>
                <code className="text-[11px] text-muted-foreground">{inc.instanciaId}</code>
              </TableCell>
              <TableCell>{tipoBadge(inc.tipo)}</TableCell>
              <TableCell className="text-right text-sm font-medium">
                {inc.contactosSinResp}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {inc.accion ?? "—"}
              </TableCell>
              <TableCell>{resultadoBadge(inc.resultado)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {durationStr(inc.creadoAt, inc.resolvedAt)}
              </TableCell>
              <TableCell className="text-center">
                {inc.emailEnviado ? (
                  <CheckCircle className="mx-auto size-4 text-emerald-500" />
                ) : (
                  <XCircle className="mx-auto size-4 text-muted-foreground" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
