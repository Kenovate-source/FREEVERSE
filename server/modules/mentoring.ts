import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict, forbidden, notFound } from '../http/errors';
import { created } from '../http/router';
import { json, uuid } from '../db';
import { audit } from '../services/audit';
import { notify } from '../services/notify';
import { personCards } from '../services/people';
import { registerEraser, registerExporter } from '../services/erasure';
import { screenLabel } from '../../shared/label-screen';

const id = z.string().uuid();
const tag = z.string().trim().min(2).max(30);
const REQUEST_STATE: Record<string, 'pending' | 'accepted' | 'declined'> = { received: 'pending', facilitated: 'accepted', closed: 'declined' };

/** What a mentor says about themselves. Every free-text field is screened, because other members read it. */
const profileBody = z.object({
  headline: z.string().trim().min(5).max(120),
  bio: z.string().trim().min(40, 'Tell people a little more: at least 40 characters.').max(800),
  expertise: z.array(tag).min(1).max(6),
  availabilityNote: z.string().trim().max(200).optional(),
  capacity: z.number().int().min(1).max(10).default(3),
  agreed: z.literal(true, 'Please confirm the mentor ground rules.'),
}).strict();

const mine = (r: any) => !r ? null : {
  id: r.id, headline: r.headline, bio: r.bio, expertise: json<string[]>(r.expertise, []), availabilityNote: r.availability_note ?? null, capacity: Number(r.capacity),
  state: r.review_status as 'pending' | 'approved' | 'rejected', paused: r.status === 'paused' && r.review_status === 'approved', reviewNote: r.review_note ?? null, submittedAt: r.submitted_at ?? null,
};

export const mentoringModule: ModuleDef = {
  name: 'mentoring',
  register(router, s) {
    const loadMine = (c: { db: typeof s.db; me: { userId: string } }) => c.db.get<any>('SELECT * FROM mentors WHERE user_id = $1', [c.me.userId]);
    const screen = (b: { headline: string; bio: string; expertise: string[]; availabilityNote?: string }) => {
      for (const [k, v] of Object.entries({ headline: b.headline, bio: b.bio, availabilityNote: b.availabilityNote ?? '', expertise: b.expertise.join(' ') })) { const bad = v ? screenLabel(v) : null; if (bad) throw badRequest(bad, { [k]: 'label_not_allowed' }, 'label_not_allowed'); }
    };

    // ───────── becoming a mentor ─────────
    router.get('/api/mentor-profile', { auth: 'active' }, async (c) => {
      const open = await c.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM mentor_requests r JOIN mentors m ON m.id = r.mentor_id WHERE m.user_id = $1 AND r.status = 'received'", [c.me.userId]);
      const active = await c.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM mentor_requests r JOIN mentors m ON m.id = r.mentor_id WHERE m.user_id = $1 AND r.status = 'facilitated'", [c.me.userId]);
      return { profile: mine(await loadMine(c)), openRequests: Number(open?.n ?? 0), activeMentees: Number(active?.n ?? 0), canReview: c.me.permissions.has('mentors.review') };
    });
    // Apply, or change what the directory shows. Changing the words you are reviewed on sends the profile back for review; it stays hidden until approved.
    router.put('/api/mentor-profile', { auth: 'active', body: profileBody, rate: { key: 'mentor-apply', limit: 6, windowMs: 3600_000 } }, async (c) => {
      screen(c.body); const b = c.body; const now = c.now().toISOString(); const row = await loadMine(c);
      const name = (await c.db.get<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [c.me.userId]))?.display_name ?? 'Member';
      if (!row) {
        await c.db.run(`INSERT INTO mentors (id, name, headline, bio, expertise, availability_note, is_demo, status, user_id, review_status, capacity, submitted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'paused',$8,'pending',$9,$10)`,
          [uuid(), name, b.headline, b.bio, JSON.stringify(b.expertise), b.availabilityNote ?? null, false, c.me.userId, b.capacity, now]);
      } else {
        const sameWords = row.headline === b.headline && row.bio === b.bio && JSON.stringify(json(row.expertise, [])) === JSON.stringify(b.expertise);
        const backToReview = !sameWords || row.review_status !== 'approved';
        await c.db.run(`UPDATE mentors SET name = $2, headline = $3, bio = $4, expertise = $5, availability_note = $6, capacity = $7, review_status = $8, status = $9, submitted_at = $10, review_note = $11 WHERE id = $1`,
          [row.id, name, b.headline, b.bio, JSON.stringify(b.expertise), b.availabilityNote ?? null, b.capacity, backToReview ? 'pending' : 'approved', backToReview ? 'paused' : row.status, backToReview ? now : row.submitted_at, backToReview ? null : row.review_note]);
      }
      await audit(c.db, { actorId: c.me.userId, action: 'mentor.application_submitted', targetType: 'user', targetId: c.me.userId, outcome: 'success' }, c.now());
      return created({ profile: mine(await loadMine(c)) });
    });
    router.patch('/api/mentor-profile', { auth: 'active', body: z.object({ availabilityNote: z.string().trim().max(200).nullable().optional(), capacity: z.number().int().min(1).max(10).optional(), paused: z.boolean().optional() }).strict() }, async (c) => {
      const row = await loadMine(c); if (!row) throw notFound('You have not applied to be a mentor.');
      const b = c.body;
      if (b.availabilityNote !== undefined) { const bad = b.availabilityNote ? screenLabel(b.availabilityNote) : null; if (bad) throw badRequest(bad, { availabilityNote: 'label_not_allowed' }, 'label_not_allowed'); }
      if (b.paused !== undefined && row.review_status !== 'approved') throw conflict('You can pause or resume once your application is approved.', 'not_approved');
      await c.db.run('UPDATE mentors SET availability_note = $2, capacity = $3, status = $4 WHERE id = $1', [row.id, b.availabilityNote !== undefined ? b.availabilityNote : row.availability_note, b.capacity ?? row.capacity, b.paused === undefined ? row.status : b.paused ? 'paused' : 'active']);
      return { profile: mine(await loadMine(c)) };
    });
    // Stepping down: the listing goes, open requests are closed with a note, and past requests keep their answers.
    router.delete('/api/mentor-profile', { auth: 'active' }, async (c) => {
      const row = await loadMine(c); if (!row) return { ok: true };
      const now = c.now().toISOString();
      const open = await c.db.query<any>("SELECT id, user_id FROM mentor_requests WHERE mentor_id = $1 AND status = 'received'", [row.id]);
      for (const r of open) { await c.db.run("UPDATE mentor_requests SET status = 'closed', reply = $2, responded_at = $3 WHERE id = $1", [r.id, 'This mentor is no longer taking requests.', now]); if (r.user_id) await notify(c.db, { userId: r.user_id, type: 'mentorship', data: { text: 'A mentor you asked is no longer available.', href: '#/mentors' } }, c.now()); }
      await c.db.run("UPDATE mentors SET status = 'paused', review_status = 'rejected', user_id = NULL, review_note = 'Stepped down by the mentor' WHERE id = $1", [row.id]);
      await audit(c.db, { actorId: c.me.userId, action: 'mentor.stepped_down', targetType: 'user', targetId: c.me.userId, outcome: 'success' }, c.now());
      return { ok: true };
    });

    // ───────── review ─────────
    const R = { perm: 'mentors.review' } as const;
    router.get('/api/mentor-applications', { auth: R }, async (c) => {
      const rows = await c.db.query<any>("SELECT m.*, u.handle FROM mentors m JOIN users u ON u.id = m.user_id WHERE m.review_status = 'pending' AND m.user_id IS NOT NULL ORDER BY m.submitted_at");
      return { items: rows.map((r) => ({ id: r.id, name: r.name, handle: r.handle, headline: r.headline, bio: r.bio, expertise: json<string[]>(r.expertise, []), availabilityNote: r.availability_note ?? null, capacity: Number(r.capacity), submittedAt: r.submitted_at, mine: r.user_id === c.me.userId })) };
    });
    router.post('/api/mentor-applications/:id/decision', { auth: R, body: z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() }).strict(), rate: { key: 'mentor-review', limit: 60, windowMs: 3600_000 } }, async (c) => {
      const m = await c.db.get<any>("SELECT * FROM mentors WHERE id = $1 AND review_status = 'pending' AND user_id IS NOT NULL", [c.params.id]);
      if (!m) throw notFound('That application is not waiting for review.');
      if (m.user_id === c.me.userId) throw forbidden('You can’t review your own application. Another reviewer will.', 'own_application');
      if (c.body.decision === 'reject' && !c.body.note) throw badRequest('Please give the applicant a short reason.', { note: 'required' }, 'note_required');
      const now = c.now().toISOString(); const ok = c.body.decision === 'approve';
      await c.db.run('UPDATE mentors SET review_status = $2, status = $3, reviewed_by = $4, reviewed_at = $5, review_note = $6 WHERE id = $1', [m.id, ok ? 'approved' : 'rejected', ok ? 'active' : 'paused', c.me.userId, now, c.body.note ?? null]);
      await audit(c.db, { actorId: c.me.userId, actorRole: 'reviewer', action: ok ? 'mentor.approved' : 'mentor.rejected', targetType: 'user', targetId: m.user_id, reason: c.body.note ?? null, outcome: 'success' }, c.now());
      await notify(c.db, { userId: m.user_id, type: 'mentorship', data: { text: ok ? 'You’re approved as a mentor. You now appear in the Mentors directory.' : `Your mentor application wasn’t approved. ${c.body.note}`, href: '#/mentoring/profile' } }, c.now());
      return { ok: true, state: ok ? 'approved' : 'rejected' };
    });

    // ───────── what mentors receive ─────────
    router.get('/api/mentoring/requests', { auth: 'active' }, async (c) => {
      const rows = await c.db.query<any>("SELECT r.* FROM mentor_requests r JOIN mentors m ON m.id = r.mentor_id WHERE m.user_id = $1 ORDER BY CASE r.status WHEN 'received' THEN 0 ELSE 1 END, r.created_at DESC", [c.me.userId]);
      const cards = await personCards(s, c.me.userId, rows.map((r) => r.user_id));
      return { items: rows.filter((r) => !cards.get(r.user_id)?.restricted).map((r) => { const p = cards.get(r.user_id); return { id: r.id, state: REQUEST_STATE[r.status] ?? 'pending', message: r.message ?? null, reply: r.reply ?? null, at: r.created_at, respondedAt: r.responded_at ?? null, person: p && !p.deleted ? { handle: p.handle, displayName: p.displayName } : null }; }) };
    });
    router.post('/api/mentoring/requests/:id/respond', { auth: 'active', body: z.object({ decision: z.enum(['accept', 'decline']), reply: z.string().trim().max(500).optional() }).strict(), rate: { key: 'mentor-respond', limit: 60, windowMs: 3600_000 } }, async (c) => {
      const r = await c.db.get<any>("SELECT r.*, m.capacity, m.id AS mid FROM mentor_requests r JOIN mentors m ON m.id = r.mentor_id WHERE r.id = $1 AND m.user_id = $2", [id.safeParse(c.params.id).data ?? '', c.me.userId]);
      if (!r) throw notFound('We couldn’t find that request.');
      if (r.status !== 'received') throw conflict('You have already answered this request.', 'already_answered');
      if (c.body.reply) { const bad = screenLabel(c.body.reply); if (bad) throw badRequest(bad, { reply: 'label_not_allowed' }, 'label_not_allowed'); }
      const accept = c.body.decision === 'accept';
      if (accept) { const n = await c.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM mentor_requests WHERE mentor_id = $1 AND status = 'facilitated'", [r.mid]); if (Number(n?.n ?? 0) >= Number(r.capacity)) throw conflict('You are at your mentee limit. Raise it in your mentor profile, or decline.', 'at_capacity'); }
      await c.db.run('UPDATE mentor_requests SET status = $2, reply = $3, responded_at = $4 WHERE id = $1', [r.id, accept ? 'facilitated' : 'closed', c.body.reply ?? null, c.now().toISOString()]);
      if (r.user_id) await notify(c.db, { userId: r.user_id, type: 'mentorship', actorId: c.me.userId, data: { text: accept ? 'A mentor accepted your request. Open Mentors to read their reply.' : 'A mentor can’t take your request right now. Open Mentors for their note.', href: '#/mentors' } }, c.now());
      return { ok: true, state: accept ? 'accepted' : 'declined' };
    });

    registerEraser('mentoring', async (db, userId) => {
      const open = await db.run("UPDATE mentor_requests SET status = 'closed', reply = 'This mentor is no longer available.', responded_at = $2 WHERE status = 'received' AND mentor_id IN (SELECT id FROM mentors WHERE user_id = $1)", [userId, new Date().toISOString()]);
      const m = await db.run('DELETE FROM mentors WHERE user_id = $1', [userId]);
      return { counts: { mentors: m.changes, requests_closed: open.changes } };
    });
    registerExporter('mentoring', async (db, userId) => ({ profile: await db.query('SELECT headline, bio, expertise, availability_note, capacity, review_status, submitted_at FROM mentors WHERE user_id = $1', [userId]) }));
  },
};
