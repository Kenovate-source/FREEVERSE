import { browserKV, type KV } from '../lib/kv';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { path: string; message: string }[]) { super(message); }
  /** First field-level message for a path, if the server sent any. */
  field(path: string): string | undefined { return this.details?.find((d) => d.path === path)?.message; }
}
const kv: KV = browserKV('local');
const TOKEN = 'fv.session';
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };
export const getToken = (): string | null => kv.get(TOKEN);
export const setToken = (t: string | null) => { if (t) kv.set(TOKEN, t); else kv.remove(TOKEN); };

interface Opts { stepUp?: string | null; signal?: AbortSignal; raw?: { body: Blob | ArrayBuffer | Uint8Array; contentType: string } }
async function request<T>(method: string, path: string, body?: unknown, o: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = getToken(); if (token) headers.authorization = `Bearer ${token}`;
  if (o.stepUp) headers['x-step-up'] = o.stepUp;
  let payload: BodyInit | undefined;
  if (o.raw) { headers['content-type'] = o.raw.contentType; payload = o.raw.body as BodyInit; }
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  let res: Response;
  try { res = await fetch(path, { method, headers, body: payload, signal: o.signal }); }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new ApiError(0, 'network', 'We couldn’t reach FREEVERSE. Check your connection and try again.'); }
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
  // A 2xx that is not JSON means something other than the FREEVERSE API answered (for example a static host returning its home page
  // because the API proxy is not configured). Say so plainly instead of pretending the call worked.
  if (res.ok && res.status !== 204 && !ct.includes('application/json') && !o.raw && !path.startsWith('/api/media/')) {
    throw new ApiError(502, 'bad_gateway', 'The FREEVERSE service returned an unexpected response. It may be misconfigured or starting up.');
  }
  if (!res.ok) {
    const err = data?.error;
    if (res.status === 401 && token && err?.code === 'session_invalid') onUnauthorized?.();
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? 'Something went wrong. Please try again.', err?.details);
  }
  return data as T;
}
export const api = {
  get: <T>(p: string, o?: Opts) => request<T>('GET', p, undefined, o),
  post: <T>(p: string, b?: unknown, o?: Opts) => request<T>('POST', p, b ?? {}, o),
  put: <T>(p: string, b?: unknown, o?: Opts) => request<T>('PUT', p, b ?? {}, o),
  patch: <T>(p: string, b?: unknown, o?: Opts) => request<T>('PATCH', p, b ?? {}, o),
  del: <T>(p: string, o?: Opts) => request<T>('DELETE', p, undefined, o),
  upload: <T>(p: string, file: Blob) => request<T>('POST', p, undefined, { raw: { body: file, contentType: file.type || 'application/octet-stream' } }),
};
export const qs = (o: Record<string, string | number | boolean | null | undefined>): string => {
  const u = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString(); return s ? `?${s}` : '';
};
