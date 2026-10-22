import { randomUUID } from 'node:crypto';

export const uuid = (): string => randomUUID();

/** Boolean column reader: true/false on PostgreSQL, 1/0 on SQLite. */
export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 't' || v === 'true';
}

/** JSON column reader: jsonb arrives parsed on PostgreSQL, TEXT arrives as a string on SQLite. */
export function json<T = unknown>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return v as T;
}

export function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** "$3, $4, $5" for n values starting at placeholder index `start`. */
export function placeholders(start: number, n: number): string {
  return Array.from({ length: n }, (_, i) => `$${start + i}`).join(', ');
}

/** Escape LIKE wildcards in user input; use with `LIKE $n ESCAPE '\'`. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
export const contains = (s: string): string => `%${likeEscape(s.toLowerCase())}%`;

export const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));
