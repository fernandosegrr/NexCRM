import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type EvolutionInstance = {
  name?: string;
  connectionStatus?: string;
  state?: string;
  instance?: {
    instanceName?: string;
    status?: string;
    state?: string;
    connectionStatus?: string;
  };
};

// Una sola llamada a Evolution; devuelve un mapa instanciaId -> conectado.
async function fetchAllStatuses(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
  const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return map;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_API_KEY },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return map;
    const all = (await r.json()) as EvolutionInstance[];
    for (const i of all) {
      const name = i.name ?? i.instance?.instanceName;
      if (!name) continue;
      const status =
        i.connectionStatus ??
        i.state ??
        i.instance?.state ??
        i.instance?.connectionStatus ??
        i.instance?.status ??
        "unknown";
      map.set(name, status === "open");
    }
    return map;
  } catch {
    clearTimeout(timer);
    return map;
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const instances = await prisma.businessInstance.findMany({
    where: { businessId: session.user.businessId, canal: "whatsapp", activo: true },
    select: { instanciaId: true },
  });

  const statusMap = await fetchAllStatuses();

  const results = instances.map((inst) => ({
    instanciaId: inst.instanciaId,
    nombre: inst.instanciaId,
    connected: statusMap.get(inst.instanciaId) ?? false,
  }));

  return NextResponse.json({ instances: results });
}
