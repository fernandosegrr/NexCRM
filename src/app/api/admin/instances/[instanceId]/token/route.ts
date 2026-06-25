import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveMetaId } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tokenSchema = z.object({
  metaPageAccessToken: z.string().min(10),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { instanceId: string } },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.rol !== "ADMIN") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 422 });
  }

  const { metaPageAccessToken } = parsed.data;

  const instance = await prisma.businessInstance.findUnique({
    where: { id: params.instanceId },
    select: { id: true, canal: true },
  });

  if (!instance) {
    return NextResponse.json({ error: "Instancia no encontrada" }, { status: 404 });
  }
  if (instance.canal !== "instagram" && instance.canal !== "messenger") {
    return NextResponse.json({ error: "Esta instancia no es de tipo Meta" }, { status: 400 });
  }

  const pageId = await resolveMetaId(instance.canal, metaPageAccessToken);
  if (!pageId) {
    return NextResponse.json(
      { error: "Token inválido o expirado — Meta no lo reconoce." },
      { status: 422 },
    );
  }

  const now = new Date();
  // Instagram tokens expire in 60 days; Messenger page tokens are permanent
  const expiresAt =
    instance.canal === "instagram"
      ? new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
      : null;

  const updated = await prisma.businessInstance.update({
    where: { id: params.instanceId },
    data: {
      metaPageId: pageId,
      metaPageAccessToken,
      metaTokenSetAt: now,
      metaTokenExpiresAt: expiresAt,
    },
    select: {
      id: true,
      metaPageId: true,
      metaTokenSetAt: true,
      metaTokenExpiresAt: true,
    },
  });

  return NextResponse.json({
    id: updated.id,
    metaPageId: updated.metaPageId,
    metaTokenSetAt: updated.metaTokenSetAt?.toISOString() ?? null,
    metaTokenExpiresAt: updated.metaTokenExpiresAt?.toISOString() ?? null,
  });
}
