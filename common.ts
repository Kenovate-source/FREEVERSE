import type { Db } from '../db';
import { bool, json } from '../db';

export async function savedSet(db: Db, userId: string, kind: string): Promise<Set<string>> {
  const rows = await db.query<{ ref_id: string }>('SELECT ref_id FROM saved_items WHERE user_id = $1 AND kind = $2', [userId, kind]);
  return new Set(rows.map((r) => r.ref_id));
}
export const tagsOf = (v: unknown): string[] => json<string[]>(v, []).filter((x) => typeof x === 'string');
export { bool, json };
/** Escapes LIKE wildcards so a search for “50%” is literal. */
export const likeTerm = (q: string) => `%${q.toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m)}%`;
