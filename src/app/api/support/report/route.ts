import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildBugReportHtml } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: { tipo?: string; descripcion?: string; url?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { tipo, descripcion, url = "" } = body;

  if (!tipo || !["bug", "sugerencia", "pregunta"].includes(tipo)) {
    return NextResponse.json({ error: "Tipo inválido." }, { status: 422 });
  }
  if (!descripcion || descripcion.trim().length < 10) {
    return NextResponse.json(
      { error: "Descripción demasiado corta (mínimo 10 caracteres)." },
      { status: 422 },
    );
  }

  let negocio = "NexAI";
  if (session.user.businessId) {
    const b = await prisma.business.findUnique({
      where: { id: session.user.businessId },
      select: { nombre: true },
    });
    if (b) negocio = b.nombre;
  }

  const fechaMex = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "full",
    timeStyle: "short",
  });

  const destino =
    process.env.NEXAI_SUPPORT_EMAIL ?? "jaimefernando3112@gmail.com";

  try {
    await sendEmail({
      to: destino,
      subject: `[${tipo}] ${session.user.nombre ?? session.user.email} — ${negocio}`,
      html: buildBugReportHtml({
        tipo,
        descripcion: descripcion.trim(),
        url: url.trim(),
        nombre: session.user.nombre ?? session.user.email ?? "Desconocido",
        email: session.user.email ?? "",
        negocio,
        fechaMex,
      }),
    });
  } catch (err) {
    console.error("[support/report] email error:", err);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
