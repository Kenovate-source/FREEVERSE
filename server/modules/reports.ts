import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, notFound } from '../http/errors';
import { created } from '../http/router';
import { REPORT_CATEGORIES, REPORT_TARGETS } from '../../shared/constants';
import { loadVisiblePost } from './posts';
import { fileReport } from '../moderation/cases';
import { relation } from '../policy/visibility';
import { audit } from '../services/audit';
import { registerEraser, registerExporter } from '../services/erasure';

export const REPORT_HELP: Record<string, string> = {
  harassment: 'Bullying, threats or targeted abuse', unwanted_contact: 'Contact you did not want', self_harm_crisis: 'Someone may be at risk of harm',
  spam: 'Spam or scams', impersonation: 'Pretending to be someone else', illegal: 'Illegal or dangerous content', other: 'Something else',
};

export const reportsModule: ModuleDef = {
  name: 'reports',
  register(router) {
    router.get('/api/reports/categories', { auth: 'active' }, async () => ({
      categories: REPORT_CATEGORIES.map((id) => ({ id, label: REPORT_HELP[id] })),
      note: 'Reports go to a small review team. FREEVERSE does not have 24/7 moderation, so if someone is in immediate danger contact local emergency services.',
    }));

    router.post('/api/reports', {
      auth: 'active',
      body: z.object({ targetType: z.enum(REPORT_TARGETS), targetId: z.string().uuid(), category: z.enum(REPORT_CATEGORIES), details: z.string().trim().max(1000).optional() }).strict(),
      rate: { key: 'report', limit: 20, windowMs: 3600_000 },
    }, async (c) => {
      const me = c.me.userId; const b = c.body;
      // The reporter must be able to see what they report: reporting is not a way to probe for hidden content.
      if (b.targetType === 'post') { if (!(await loadVisiblePost(c.db, me, b.targetId))) throw notFound('We couldn’t find that.'); }
      else if (b.targetType === 'comment') {
        const cm = await c.db.get<any>('SELECT post_id, author_id FROM comments WHERE id = $1', [b.targetId]);
        if (!cm || !(await loadVisiblePost(c.db, me, cm.post_id))) throw notFound('We couldn’t find that.');
        if (cm.author_id === me) throw conflict('You cannot report your own content.', 'own_content');
      } else if (b.targetType === 'user') {
        if (b.targetId === me) throw conflict('You cannot report yourself.', 'own_content');
        const u = await c.db.get<any>("SELECT id FROM users WHERE id = $1 AND status IN ('active','suspended')", [b.targetId]);
        if (!u) throw notFound('We couldn’t find that.');
      } else {
        const m = await c.db.get<any>('SELECT m.id, m.sender_id FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $2 WHERE m.id = $1', [b.targetId, me]);
        if (!m) throw notFound('We couldn’t find that.');
        if (m.sender_id === me) throw conflict('You cannot report your own message.', 'own_content');
      }
      if (b.targetType === 'post') { const p = await c.db.get<any>('SELECT author_id FROM posts WHERE id = $1', [b.targetId]); if (p?.author_id === me) throw conflict('You cannot report your own content.', 'own_content'); }
      const dup = await c.db.get('SELECT 1 AS x FROM reports WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND category = $4 AND status <> $5', [me, b.targetType, b.targetId, b.category, 'resolved']);
      if (dup) throw conflict('You have already reported this. We are reviewing it.', 'already_reported');
      const r = await c.db.tx((t) => fileReport(t, { reporterId: me, targetType: b.targetType, targetId: b.targetId, category: b.category, details: b.details, now: c.now() }));
      await audit(c.db, { actorId: me, action: 'report.filed', targetType: b.targetType, targetId: b.targetId, caseId: r.caseId, meta: { category: b.category } }, c.now());
      return created({ report: { id: r.reportId, status: 'received' }, message: 'Thank you. Your report was received. You may also want to block or mute this person; neither tells them.' });
    });

    router.get('/api/reports', { auth: 'active' }, async (c) => {
      const rows = await c.db.query<any>('SELECT id, target_type, category, status, created_at FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 100', [c.me.userId]);
      return { items: rows.map((r) => ({ id: r.id, targetType: r.target_type, category: r.category, status: r.status, createdAt: r.created_at })) };
    });

    registerEraser('reports', async (db, userId) => {
      // Reports I filed keep their case, but lose my identity (reporter_id has ON DELETE SET NULL); report text is dropped.
      const r = await db.run('UPDATE reports SET reporter_id = NULL, details = NULL WHERE reporter_id = $1', [userId]);
      return { counts: { reports_detached: r.changes } };
    });
    registerExporter('reports', async (db, userId) => db.query('SELECT target_type, category, status, created_at FROM reports WHERE reporter_id = $1', [userId]));
    void relation;
  },
};
