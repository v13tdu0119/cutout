export const MAX_BYTES = 40 * 1024 * 1024;

export function publicAsset(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

const PHOTO_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const HEIC_EXTENSIONS = /\.(heic|heif)$/i;

export function validateImageFile(file: {
  type: string;
  size: number;
  name?: string;
}): void {
  if (file.size <= 0) {
    throw new Error("That file is empty.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Keep photos under 40 MB.");
  }

  const name = file.name ?? "";
  const type = (file.type || "").toLowerCase();

  if (type.includes("heic") || type.includes("heif") || HEIC_EXTENSIONS.test(name)) {
    throw new Error(
      "HEIC photos cannot be read here. In Photos, export a JPEG or PNG and choose that file.",
    );
  }

  if (!type) {
    if (name && !PHOTO_EXTENSIONS.test(name)) {
      throw new Error("Use a JPEG, PNG, or WebP.");
    }
    return;
  }

  if (type.startsWith("image/")) return;

  throw new Error("Use a JPEG, PNG, or WebP.");
}
