import sharp from 'sharp';
import { MEDIA_LIMITS, type MediaPurpose } from '../../shared/api/media';
import { badRequest, unprocessable } from '../http/errors';

export type Sniffed = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

/** Identifies the real format from magic bytes. The Content-Type header is never trusted. */
export function sniffImage(b: Buffer): Sniffed | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.length >= 6 && (b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a')) return 'image/gif';
  return null;
}

export interface Processed { data: Buffer; mime: 'image/webp'; width: number; height: number }

/** Validates, auto-rotates, resizes, strips ALL metadata (EXIF, GPS, ICC, XMP) and re-encodes to WebP. */
export async function processImage(raw: Buffer, declaredType: string | undefined, purpose: MediaPurpose): Promise<Processed> {
  if (!raw.length) throw badRequest('No image was received.', undefined, 'empty_upload');
  if (raw.length > MEDIA_LIMITS.maxBytes) throw new (await import('../http/errors')).HttpError(413, 'payload_too_large', 'That image is too large (5 MB maximum).');
  const declared = (declaredType ?? '').split(';')[0]!.trim().toLowerCase();
  if (!(MEDIA_LIMITS.allowedInput as readonly string[]).includes(declared)) throw unprocessable('Only PNG, JPEG, WebP or GIF images can be uploaded.', undefined, 'unsupported_media_type');
  const real = sniffImage(raw);
  if (!real) throw unprocessable('That file is not a supported image.', undefined, 'unsupported_media_type');
  if (real !== declared) throw unprocessable('The file does not match its declared type.', undefined, 'type_mismatch');
  try {
    let p = sharp(raw, { limitInputPixels: 40_000_000, failOn: 'error' }).rotate();
    p = purpose === 'avatar' ? p.resize({ width: 512, height: 512, fit: 'cover' }) : p.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
    // No .withMetadata(): sharp drops EXIF/ICC/XMP by default.
    const { data, info } = await p.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    return { data, mime: 'image/webp', width: info.width, height: info.height };
  } catch {
    throw unprocessable('That image could not be read. Try a different file.', undefined, 'bad_image');
  }
}
