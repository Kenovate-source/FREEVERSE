import type { Services } from './services';
import { purgeExpiredFlags } from './ai/safety';

/** Housekeeping that must happen on a schedule. Idempotent; safe to call at any time (tests call it directly). */
export async function runMaintenance(s: Services): Promise<{ flagsPurged: number; stepUpsPurged: number }> {
  const now = s.now();
  const flagsPurged = await purgeExpiredFlags(s.db, now);
  const stepUpsPurged = (await s.db.run('DELETE FROM step_up_grants WHERE expires_at <= $1', [now.toISOString()])).changes;
  await s.db.run('DELETE FROM dev_sessions WHERE expires_at <= $1', [now.toISOString()]).catch(() => undefined);
  return { flagsPurged, stepUpsPurged };
}

export function startJobs(s: Services, everyMs = 10 * 60_000): () => void {
  const run = () => runMaintenance(s).catch((e) => s.log.warn('maintenance_failed', { err: String(e) }));
  void run();
  const t = setInterval(run, everyMs);
  t.unref();
  return () => clearInterval(t);
}
