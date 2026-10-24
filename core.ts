import type { Services } from '../services';
import { uuid } from '../db';
import { GOVERNANCE_LEVELS } from '../../shared/constants';
import { ALL_SEAT_DEFAULTS, DEFAULTS_VERSION } from '../../shared/governance-defaults';

/** Reference rows every environment needs. Idempotent. */
export async function seedCore(s: Services): Promise<void> {
  const nowIso = s.now().toISOString();
  for (const lvl of GOVERNANCE_LEVELS) {
    for (let n = 1; n <= lvl.seats; n++) {
      const exists = await s.db.get('SELECT 1 AS x FROM governance_seats WHERE level = $1 AND seat_no = $2', [lvl.level, n]);
      if (exists) continue;
      const title = lvl.level === 1 ? 'Founder' : `${lvl.name.replace(/s$/, '')} seat ${n}`;
      const resp = lvl.level === 1 ? 'Original visionary and constitutional protector; final decision authority on product direction, values alignment and resource allocation (Governance.md v2.0).' : null;
      await s.db.run('INSERT INTO governance_seats (id, level, seat_no, title, responsibilities, updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [uuid(), lvl.level, n, title, resp, nowIso]);
    }
  }
  // Apply the proposed seat definitions to seats the Founder has not customised (still generic, never keyed). Never overwrites edits.
  for (const d of ALL_SEAT_DEFAULTS) {
    const seat = await s.db.get<{ id: string; title: string; seat_key: string | null; responsibilities: string | null }>('SELECT id, title, seat_key, responsibilities FROM governance_seats WHERE level = $1 AND seat_no = $2', [d.level, d.seatNo]);
    if (!seat || seat.seat_key) continue;
    if (!/ seat \d+$/.test(seat.title) || seat.responsibilities) continue; // customised before defaults existed
    await s.db.run('UPDATE governance_seats SET seat_key = $2, title = $3, scope = $4, responsibilities = $5, reports_to = $6, boundaries = $7, area = $8, defaults_version = $9, updated_at = $10 WHERE id = $1',
      [seat.id, d.key, d.title, d.scope, d.responsibilities.join('\n'), d.reportsTo, d.boundaries.join('\n'), d.area ?? null, DEFAULTS_VERSION, nowIso]);
  }
  if (!(await s.db.get('SELECT 1 AS x FROM founder_ai_settings WHERE id = 1'))) {
    await s.db.run("INSERT INTO founder_ai_settings (id, mode, autonomy_rules, updated_at) VALUES (1, 'approval_required', '[]', $1)", [nowIso]);
  }
}
