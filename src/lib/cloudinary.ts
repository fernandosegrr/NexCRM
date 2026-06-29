import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export function getResourceType(mimeType: string): "image" | "video" | "raw" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "video"; // Cloudinary uses "video" for audio
  return "raw"; // documents, PDFs, etc.
}

/**
 * Sube una imagen/video/audio en base64 a Cloudinary.
 * Devuelve la URL pública permanente (secure_url).
 */
export async function uploadBase64(
  base64: string,
  mimetype: string,
  folder = "nexai-crm/media",
): Promise<string> {
  const dataUri = `data:${mimetype};base64,${base64}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: getResourceType(mimetype),
  });
  return result.secure_url;
}

/**
 * Descarga un archivo del CDN de Meta y lo sube a Cloudinary.
 *
 * Intento 1: Authorization Bearer header.
 * Intento 2 (fallback): token como query param (?access_token=).
 * Si ambos fallan, lanza error (el caller debe capturarlo sin romper el flujo).
 */
export async function uploadFromUrl(
  url: string,
  accessToken: string,
  folder = "nexai-crm/media",
): Promise<string> {
  // Intento 1: Authorization Bearer
  let response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Intento 2: token como query param
  if (!response.ok) {
    const sep = url.includes("?") ? "&" : "?";
    response = await fetch(`${url}${sep}access_token=${accessToken}`);
  }

  if (!response.ok) {
    throw new Error(
      `Error descargando media de Meta CDN: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");
  const mimetype = response.headers.get("content-type") ?? "image/jpeg";

  return uploadBase64(base64, mimetype, folder);
}

export default cloudinary;
