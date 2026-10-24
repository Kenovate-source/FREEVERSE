import type { Db } from '../db';
import { uuid } from '../db';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  caseId?: string | null;
  reason?: string | null;
  outcome?: 'success' | 'denied' | 'failed';
  meta?: Record<string, unknown>;
}

/** Appends to the append-only audit log (a database trigger rejects UPDATE/DELETE). Never put private content in meta. */
export async function audit(db: Db, e: AuditEntry, now: Date = new Date()): Promise<string> {
  const id = uuid();
  await db.run(
    `INSERT INTO audit_events (id, occurred_at, actor_id, actor_role, action, target_type, target_id, case_id, reason, outcome, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, now.toISOString(), e.actorId ?? null, e.actorRole ?? null, e.action, e.targetType ?? null, e.targetId ?? null, e.caseId ?? null, e.reason ?? null, e.outcome ?? 'success', e.meta ?? {}],
  );
  return id;
}
