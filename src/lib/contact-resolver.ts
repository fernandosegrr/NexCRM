import { prisma } from "@/lib/prisma";
import { META_VERSION } from "@/lib/meta";

/**
 * Resolves a contact's name and profile photo from Meta Graph API or
 * Evolution API (WhatsApp) and upserts it into the contacts table.
 * Silently ignores all errors — never blocks message ingestion.
 */
export async function resolveContact(
  uidUsuario: string,
  instanciaId: string,
  canal: string,
  token?: string | null,
  jidCompleto?: string | null,
): Promise<void> {
  try {
    const existing = await prisma.contact.findUnique({
      where: { instanciaId_uidUsuario: { instanciaId, uidUsuario } },
    });
    if (existing) {
      const hasName  = !!(existing.nombre || existing.username);
      const hasPhoto = !!existing.fotoPerfil;
      // IG/Messenger: photos never available via API — skip once name is resolved
      if ((canal === "instagram" || canal === "messenger") && hasName) return;
      // WA: retry while photo is still missing; skip only when fully resolved
      if (canal === "whatsapp" && hasName && hasPhoto) return;
      // Any canal: skip if nothing can be improved
      if (hasName && hasPhoto) return;
    }

    let nombre: string | null = null;
    let username: string | null = null;
    let fotoPerfil: string | null = null;

    if (canal === "instagram" && token) {
      // Instagram tokens (IGAA…) only work on graph.instagram.com
      try {
        const res = await fetch(
          `https://graph.instagram.com/${encodeURIComponent(uidUsuario)}?fields=name,username&access_token=${encodeURIComponent(token)}`,
        );
        if (res.ok) {
          const data = await res.json();
          nombre = typeof data.name === "string" ? data.name : null;
          username = typeof data.username === "string" ? data.username : null;
          // graph.instagram.com doesn't expose profile_pic for DM users
        }
      } catch {
        // API unreachable — save null values below
      }
    } else if (canal === "messenger" && token) {
      // Use conversations API (pages_messaging) to get participant name.
      // Direct PSID lookup requires pages_user_profile (advanced access).
      try {
        const res = await fetch(
          `https://graph.facebook.com/${META_VERSION}/${encodeURIComponent(instanciaId)}/conversations` +
          `?fields=participants&user_id=${encodeURIComponent(uidUsuario)}&access_token=${encodeURIComponent(token)}`,
        );
        if (res.ok) {
          const data = await res.json();
          const participants: { name?: string; id: string }[] =
            data?.data?.[0]?.participants?.data ?? [];
          const user = participants.find((p) => p.id === uidUsuario);
          nombre = user?.name ?? null;
        }
      } catch {
        // API unreachable
      }
    } else if (canal === "whatsapp") {
      const apiUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_API_KEY;
      if (apiUrl && apiKey) {
        const waNumber = `${uidUsuario}@s.whatsapp.net`;
        try {
          // Step 1: get pushName
          const numbersRes = await fetch(
            `${apiUrl.replace(/\/$/, "")}/chat/whatsappNumbers/${encodeURIComponent(instanciaId)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: apiKey },
              body: JSON.stringify({ numbers: [waNumber] }),
            },
          );
          if (numbersRes.ok) {
            const numbersData = await numbersRes.json();
            const entry = Array.isArray(numbersData) ? numbersData[0] : null;
            nombre = entry?.name ?? entry?.pushName ?? null;
          }
        } catch {
          // Evolution API unreachable
        }
        try {
          // Step 2: get profile picture (Evolution v2 uses POST for fetchProfile)
          const picRes = await fetch(
            `${apiUrl.replace(/\/$/, "")}/chat/fetchProfile/${encodeURIComponent(instanciaId)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: apiKey },
              body: JSON.stringify({ number: waNumber }),
            },
          );
          if (picRes.ok) {
            const picData = await picRes.json();
            fotoPerfil =
              picData?.profilePictureUrl ??
              picData?.pictureUrl ??
              picData?.picture ??
              null;
          }
        } catch {
          // ignore
        }
      }
    }

    await prisma.contact.upsert({
      where: { instanciaId_uidUsuario: { instanciaId, uidUsuario } },
      create: { uidUsuario, instanciaId, canal, nombre, username, fotoPerfil, jidCompleto: jidCompleto ?? null },
      update: {
        // Never overwrite an existing name/photo with null if the API call failed.
        ...(nombre      !== null ? { nombre }      : {}),
        ...(username    !== null ? { username }    : {}),
        ...(fotoPerfil  !== null ? { fotoPerfil }  : {}),
        ...(jidCompleto ? { jidCompleto } : {}),
        resolvedAt: new Date(),
      },
    });
  } catch {
    // Never throw — contact resolution is best-effort
  }
}
