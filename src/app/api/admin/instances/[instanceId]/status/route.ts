import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL ?? "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";

export async function GET(
  _req: NextRequest,
  { params }: { params: { instanceId: string } },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user || session.user.rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inst = await prisma.businessInstance.findUnique({
    where: { id: params.instanceId },
    select: { instanciaId: true, canal: true },
  });

  if (!inst || inst.canal !== "whatsapp") {
    return NextResponse.json({ error: "Instancia no encontrada" }, { status: 404 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);

  try {
    const r = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_API_KEY },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!r.ok) {
      return NextResponse.json({ status: "unknown" });
    }

    const all = (await r.json()) as Array<{
      instance?: { instanceName?: string; state?: string; connectionStatus?: string; status?: string };
      connectionStatus?: string;
      state?: string;
    }>;

    console.log("[status] fetchInstances raw (first 3):", JSON.stringify(all.slice(0, 3), null, 2));

    const found = all.find(
      (i) => i.instance?.instanceName === inst.instanciaId,
    );
    const status =
      found?.instance?.state ??
      found?.instance?.connectionStatus ??
      found?.instance?.status ??
      found?.connectionStatus ??
      found?.state ??
      "unknown";

    return NextResponse.json({ status });
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ status: "unknown" });
  }
}
