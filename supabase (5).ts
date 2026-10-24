import type { StorageProvider } from './types';

export interface SupabaseStorageOptions { url: string; serviceRoleKey: string; bucket: string; fetchImpl?: typeof fetch; timeoutMs?: number }

/**
 * Supabase Storage over its REST API. SERVER-SIDE ONLY: it uses the service-role key, which must never reach the browser.
 * The bucket must be PRIVATE; files are only ever served through FREEVERSE's signed /api/media URLs.
 * NOT verified against a live Supabase project (none was available); covered by tests against a fake fetch only.
 */
export function createSupabaseStorage(o: SupabaseStorageOptions): StorageProvider {
  const f = o.fetchImpl ?? fetch;
  const base = `${o.url.replace(/\/+$/, '')}/storage/v1`;
  const enc = (k: string) => k.split('/').map(encodeURIComponent).join('/');
  const headers = (extra: Record<string, string> = {}) => ({ apikey: o.serviceRoleKey, authorization: `Bearer ${o.serviceRoleKey}`, ...extra });
  const signal = () => AbortSignal.timeout(o.timeoutMs ?? 10_000);
  return {
    kind: 'supabase',
    async put(key, data, mime) {
      const r = await f(`${base}/object/${o.bucket}/${enc(key)}`, { method: 'POST', headers: headers({ 'content-type': mime, 'x-upsert': 'true' }), body: new Uint8Array(data), signal: signal() });
      if (!r.ok) throw new Error(`storage put failed (${r.status})`);
    },
    async get(key) {
      const r = await f(`${base}/object/${o.bucket}/${enc(key)}`, { headers: headers(), signal: signal() });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) throw new Error(`storage get failed (${r.status})`);
      return { data: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') ?? 'application/octet-stream' };
    },
    async delete(key) {
      const r = await f(`${base}/object/${o.bucket}`, { method: 'DELETE', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ prefixes: [key] }), signal: signal() });
      if (!r.ok && r.status !== 404) throw new Error(`storage delete failed (${r.status})`);
    },
  };
}
