import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversations } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let businessId = searchParams.get("businessId") ?? "";

  // Un CLIENTE solo puede ver su propio negocio
  if (session.user.rol === "CLIENTE") {
    if (!session.user.businessId) {
      return NextResponse.json({ contacts: [] });
    }
    businessId = session.user.businessId;
  }

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId requerido" },
      { status: 400 },
    );
  }

  const search = searchParams.get("search") ?? undefined;
  const canal = searchParams.get("canal") ?? undefined;
  const take = Number(searchParams.get("take") ?? 25);
  const skip = Number(searchParams.get("skip") ?? 0);

  try {
    const contacts = await getConversations(businessId, {
      search,
      canal,
      take: Number.isFinite(take) ? take : 25,
      skip: Number.isFinite(skip) ? skip : 0,
    });
    return NextResponse.json({ contacts });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar las conversaciones" },
      { status: 500 },
    );
  }
}
