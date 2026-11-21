// Utilidades de imágenes locales (sin red): compresión y URL de storage local.
export async function compressImage(file: File, maxSize = 800, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b || file), 'image/jpeg', quality));
  } catch {
    return file;
  }
}

/** URL local para mostrar una foto guardada en el storage (documents/). */
export function storageUrl(path?: string | null): string | null {
  if (!path) return null;
  return `/api/storage/download?path=${encodeURIComponent(path)}`;
}
