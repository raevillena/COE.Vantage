const MAX_SIDE = 1600;
const KEEP_AS_IS_BYTES = 500 * 1024;

/**
 * Shrinks a screenshot before upload so stored pictures stay small: anything over ~500 KB or wider than
 * 1600 px is redrawn at most 1600 px on its longest side and saved as WebP (JPEG where WebP is unavailable).
 * Falls back to the original file when the browser cannot decode it.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "screenshot";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Redraws a picture at most `maxSide` px on its longest side (cropped to the centre square when `square`), saved as WebP
 * (JPEG where WebP is unavailable), so profile and card pictures stay small. Returns the original when it cannot be decoded.
 */
export async function resizeImage(file: File, opts: { maxSide: number; square?: boolean }): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const { maxSide, square } = opts;
    const side = square ? Math.min(bitmap.width, bitmap.height) : 0;
    const sx = square ? (bitmap.width - side) / 2 : 0;
    const sy = square ? (bitmap.height - side) / 2 : 0;
    const sw = square ? side : bitmap.width;
    const sh = square ? side : bitmap.height;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.88));
    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
    if (!blob) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `picture.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}
