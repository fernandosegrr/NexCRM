// Estado de cobro derivado de la configuración de pago de un negocio.
// Helper puro (sin I/O) usable tanto en cliente como en servidor.

export type PaymentEstado =
  | "sin_config"
  | "suspendido"
  | "vencido"
  | "por_vencer"
  | "al_corriente";

export function paymentEstado(
  input: { suspendido: boolean; proximoPago: string | Date } | null,
  now: number = Date.now(),
): { estado: PaymentEstado; dias: number } {
  if (!input) return { estado: "sin_config", dias: 0 };
  if (input.suspendido) return { estado: "suspendido", dias: 0 };

  const prox = new Date(input.proximoPago).getTime();
  const diasHasta = Math.ceil((prox - now) / 86_400_000);
  const diasDesde = -diasHasta;

  if (diasDesde > 0) return { estado: "vencido", dias: diasDesde };
  if (diasHasta < 7) return { estado: "por_vencer", dias: diasHasta };
  return { estado: "al_corriente", dias: diasHasta };
}

// Orden de urgencia para listados (menor = más urgente).
export const PAYMENT_ESTADO_ORDEN: Record<PaymentEstado, number> = {
  suspendido: 0,
  vencido: 1,
  por_vencer: 2,
  al_corriente: 3,
  sin_config: 4,
};
