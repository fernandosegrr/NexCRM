import Link from "next/link";
import { CreditCard } from "lucide-react";

import { getPaymentOverview } from "@/lib/data";
import {
  paymentEstado,
  PAYMENT_ESTADO_ORDEN,
  type PaymentEstado,
} from "@/lib/payment-status";

const ESTADO_META: Record<
  PaymentEstado,
  { emoji: string; label: string; className: string }
> = {
  suspendido: { emoji: "⛔", label: "Suspendido", className: "bg-red-600/20 text-red-500" },
  vencido: { emoji: "🔴", label: "Vencido", className: "bg-red-500/15 text-red-500" },
  por_vencer: { emoji: "🟡", label: "Por vencer", className: "bg-yellow-500/15 text-yellow-500" },
  al_corriente: { emoji: "🟢", label: "Al corriente", className: "bg-emerald-500/15 text-emerald-500" },
  sin_config: { emoji: "⚪", label: "Sin config", className: "bg-muted text-muted-foreground" },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MXN`;
}

export async function PaymentOverviewSection() {
  const items = await getPaymentOverview();
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => {
    const ea = paymentEstado(a).estado;
    const eb = paymentEstado(b).estado;
    if (PAYMENT_ESTADO_ORDEN[ea] !== PAYMENT_ESTADO_ORDEN[eb]) {
      return PAYMENT_ESTADO_ORDEN[ea] - PAYMENT_ESTADO_ORDEN[eb];
    }
    return new Date(a.proximoPago).getTime() - new Date(b.proximoPago).getTime();
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <CreditCard className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Estado de facturación</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item) => {
          const { estado, dias } = paymentEstado(item);
          const meta = ESTADO_META[estado];
          const detalle =
            estado === "vencido"
              ? `Venció hace ${dias} día${dias !== 1 ? "s" : ""}`
              : estado === "suspendido"
                ? item.suspendidoAt
                  ? `Suspendido desde ${fmtDate(item.suspendidoAt)}`
                  : "Bot suspendido"
                : `Próximo pago: ${fmtDate(item.proximoPago)}`;

          return (
            <Link
              key={item.businessId}
              href={`/admin/negocios/${item.businessId}?tab=facturacion`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 truncate font-semibold leading-tight">
                  {item.businessNombre}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
                >
                  {meta.emoji} {meta.label}
                </span>
              </div>
              <p className="text-sm font-medium">{fmtMoney(item.montoMensual)}/mes</p>
              <p className="text-xs text-muted-foreground">{detalle}</p>
              <p className="text-xs text-muted-foreground">
                Último pago:{" "}
                {item.ultimoPago ? fmtDate(item.ultimoPago) : "Sin pagos registrados"}
              </p>
              <span className="mt-1 text-xs font-medium text-primary">Ver facturación →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
