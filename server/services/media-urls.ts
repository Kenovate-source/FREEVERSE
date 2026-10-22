import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Services } from './index';

/**
 * <img> tags cannot send an Authorization header, so media is served from short-lived signed URLs. A URL is only minted
 * AFTER the serializer has established that this viewer may see the media (profile field audience, post visibility, ...),
 * so possession of a valid URL is the authorization. Tokens are bound to media id + viewer id + expiry.
 */
export const MEDIA_URL_TTL_MS = 30 * 60 * 1000;

const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function signedMediaUrl(s: Pick<Services, 'config' | 'now'>, viewerId: string, mediaId: string): string {
  const exp = s.now().getTime() + MEDIA_URL_TTL_MS;
  const sig = mac(s.config.mediaUrlSecret, `${mediaId}.${viewerId}.${exp}`);
  return `/api/media/${mediaId}?v=${encodeURIComponent(viewerId)}&e=${exp}&s=${sig}`;
}

export function verifyMediaToken(s: Pick<Services, 'config' | 'now'>, mediaId: string, q: { v?: string; e?: string; s?: string }): boolean {
  if (!q.v || !q.e || !q.s) return false;
  const exp = Number(q.e);
  if (!Number.isFinite(exp) || exp < s.now().getTime()) return false;
  const want = mac(s.config.mediaUrlSecret, `${mediaId}.${q.v}.${exp}`);
  const a = Buffer.from(want), b = Buffer.from(q.s);
  return a.length === b.length && timingSafeEqual(a, b);
}
