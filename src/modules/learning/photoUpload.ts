/**
 * Photo-first client helpers (M4 UI). Compress on device before upload for
 * weak/mobile networks (charter #9). Deterministic; no network calls.
 */

export interface CompressedPhoto {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
}

export const MAX_PHOTO_EDGE = 1600;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTOS_PER_SUBMISSION = 8;
export const PHOTO_JPEG_QUALITY = 0.72;

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function assertPhotoAcceptable(file: { type: string; size: number }, alreadyCount = 0): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a photo (image file).');
  }
  if (file.size <= 0) {
    throw new Error('That photo looks empty. Please retake it.');
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error('That photo is too large (max 15MB). Please retake or pick a smaller one.');
  }
  if (alreadyCount >= MAX_PHOTOS_PER_SUBMISSION) {
    throw new Error(`You can attach up to ${MAX_PHOTOS_PER_SUBMISSION} photos per hand-in.`);
  }
}

export async function compressPhotoForUpload(file: Blob): Promise<CompressedPhoto> {
  const passthrough = (): CompressedPhoto => ({
    blob: file,
    mime: file.type || 'image/jpeg',
    width: 0,
    height: 0,
    originalBytes: file.size,
    compressedBytes: file.size,
  });

  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return passthrough();
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return passthrough();
  }

  try {
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return passthrough();
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY),
    );
    if (!blob) return passthrough();
    return {
      blob,
      mime: 'image/jpeg',
      width,
      height,
      originalBytes: file.size,
      compressedBytes: blob.size,
    };
  } finally {
    bitmap.close?.();
  }
}

export interface QueuedPhoto {
  id: string;
  previewUrl: string;
  filename: string;
  compressed: CompressedPhoto;
}

export function toQueuedPhoto(file: File, compressed: CompressedPhoto): QueuedPhoto {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    previewUrl: URL.createObjectURL(compressed.blob),
    filename: file.name || 'photo.jpg',
    compressed,
  };
}
