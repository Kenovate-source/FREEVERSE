export type MediaPurpose = 'avatar' | 'cover' | 'post' | 'showcase';
export interface MediaItem { id: string; purpose: MediaPurpose; mime: string; bytes: number; width: number | null; height: number | null; altText: string | null; url: string; createdAt: string }
export interface UploadResponse { media: MediaItem }
export const MEDIA_LIMITS = { maxBytes: 5 * 1024 * 1024, quota: 300, allowedInput: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] } as const;
