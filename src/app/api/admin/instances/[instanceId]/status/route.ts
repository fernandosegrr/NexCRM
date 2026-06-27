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

    // Evolution API v2 devuelve estructura plana: { name, connectionStatus, ... }
    // versiones antiguas usaban: { instance: { instanceName, state } }
    const all = (await r.json()) as Array<{
      name?: string;
      connectionStatus?: string;
      state?: string;
      instance?: { instanceName?: string; state?: string; connectionStatus?: string; status?: string };
    }>;

    const found = all.find(
      (i) => i.name === inst.instanciaId || i.instance?.instanceName === inst.instanciaId,
    );
    const status =
      found?.connectionStatus ??
      found?.state ??
      found?.instance?.state ??
      found?.instance?.connectionStatus ??
      found?.instance?.status ??
      "unknown";

    return NextResponse.json({ status });
  } catch (e) {
    clearTimeout(timer);
    console.error("[status] fetchInstances error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ status: "unknown" });
  }
}
