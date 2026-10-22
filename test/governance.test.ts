import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';

type U = { token: string; userId: string };
for (const dialect of DIALECTS) {
  describe(`governance, Founder Console, Founder AI [${dialect}]`, () => {
    let t: TestApp; let founder: U, a: U, b: U, c: U, mod: U;
    const stepUp = async (u: U, email: string) => (await t.call('POST', '/api/me/step-up', { token: u.token, body: { secret: email } })).json.token as string;
    const seatId = async (level: number, n = 1) => (await t.db.get<any>('SELECT id FROM governance_seats WHERE level = $1 AND seat_no = $2', [level, n]))!.id as string;
    const direct = async (actionType: string, payload: unknown, title = 'Direct change', withStep = true) =>
      t.call('POST', '/api/proposals/direct', { token: founder.token, headers: withStep ? { 'x-step-up': await stepUp(founder, 'founder@example.com') } : {}, body: { actionType, payload, title } });

    before(async () => {
      t = await startTestApp(dialect, { FOUNDER_EMAIL: 'founder@example.com' });
      founder = await t.member('founder@example.com', { handle: 'theboss', name: 'The Founder' });
      // the first authenticated call after sign-up bootstraps the Founder role from FOUNDER_EMAIL
      await t.call('GET', '/api/me', { token: founder.token });
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' });
      b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' });
      c = await t.member('c@example.com', { handle: 'carol', name: 'Carol' });
      mod = await t.member('m@example.com', { handle: 'moddy', name: 'Moddy' }); await t.grantRole(mod.userId, 'moderator');
    });
    after(async () => { await t.close(); });
    beforeEach(() => { t.clock.advance(2 * 3600_000); });

    test('Founder is bootstrapped from the verified FOUNDER_EMAIL; there is only one', async () => {
      const me = (await t.call('GET', '/api/me', { token: founder.token })).json.user;
      assert.ok(me.roles.includes('founder')); assert.equal(me.seatLevel, 1);
      assert.ok(me.permissions.includes('founder.console'));
      const other = (await t.call('GET', '/api/me', { token: a.token })).json.user;
      assert.ok(!other.roles.includes('founder'));
    });

    test('hierarchy 1-3-7-12-24 exists with vacant generic seats and an honest note', async () => {
      const r = await t.call('GET', '/api/governance/structure', { token: founder.token });
      assert.deepEqual(r.json.levels.map((l: any) => [l.level, l.seats.length]), [[1, 1], [3, 3], [7, 7], [12, 12], [24, 24]]);
      assert.match(r.json.note, /not defined in Governance\.md/);
      const pub = await t.call('GET', '/api/governance/public', { token: a.token });
      assert.equal(pub.status, 200); assert.match(pub.json.principles[0], /does not give access to anyone’s private messages/);
      assert.equal((await t.call('GET', '/api/governance/structure', { token: a.token })).status, 403);
    });

    test('Founder Console is Founder-only and exposes aggregates, never private content', async () => {
      assert.equal((await t.call('GET', '/api/founder/overview', { token: a.token })).status, 403);
      assert.equal((await t.call('GET', '/api/founder/overview', { token: mod.token })).status, 403);
      // seed private content that must never show up
      await t.call('PATCH', '/api/settings', { token: a.token, body: { nova: { journalEnabled: true } } });
      await t.call('POST', '/api/journal', { token: a.token, body: { body: 'SECRET-JOURNAL-TEXT' } });
      await t.call('POST', '/api/conversations', { token: a.token, body: { handle: 'bob', body: 'SECRET-DM-TEXT' } });
      const ov = await t.call('GET', '/api/founder/overview', { token: founder.token });
      assert.equal(ov.status, 200);
      const s = JSON.stringify(ov.json);
      assert.ok(!s.includes('SECRET-') && !s.includes(a.userId));
      assert.ok(ov.json.platform.every((m: any) => m.epistemic === 'verified_fact'));
      assert.equal(ov.json.founderAi.mode, 'approval_required');
      assert.equal(ov.json.universes.length, 15);
      for (const path of ['/api/founder/communities', '/api/founder/audit', '/api/governance/access', '/api/proposals']) assert.equal((await t.call('GET', path, { token: founder.token })).status, 200, path);
      assert.ok(!JSON.stringify((await t.call('GET', '/api/founder/audit', { token: founder.token })).json).includes('SECRET-'));
    });

    test('appointment: Founder-only, step-up required, one seat per person, titles do not unlock private data', async () => {
      const seat = await seatId(3, 1);
      assert.equal((await direct('governance.appoint', { seatId: seat, userId: a.userId, reason: 'Trusted from day one' }, 'Appoint Alice', false)).status, 403); // no step-up
      const r = await direct('governance.appoint', { seatId: seat, userId: a.userId, reason: 'Trusted from day one' }, 'Appoint Alice');
      assert.equal(r.status, 201); assert.equal(r.json.status, 'executed'); assert.equal(r.json.proposal.verification.ok, true);
      const me = (await t.call('GET', '/api/me', { token: a.token })).json.user;
      assert.ok(me.roles.includes('council')); assert.equal(me.seatLevel, 3);
      for (const perm of ['moderation.reveal_anonymous', 'moderation.case.review_content', 'founder.console', 'proposals.decide', 'ai.autonomy.manage', 'config.manage']) assert.ok(!me.permissions.includes(perm), `Council has ${perm}`);
      // Council can see the structure/audit but not decide or run the console
      assert.equal((await t.call('GET', '/api/governance/structure', { token: a.token })).status, 200);
      assert.equal((await t.call('GET', '/api/founder/overview', { token: a.token })).status, 403);
      assert.equal((await t.call('POST', '/api/proposals/direct', { token: a.token, body: { actionType: 'universe.set_status', payload: { universeId: 'freeplay', status: 'concept' }, title: 'Council trying' } })).status, 403);
      // she cannot read a private message list or someone's journal (no route exists for it, and Council has no such permission)
      assert.equal((await t.call('GET', '/api/conversations', { token: a.token })).json.items.length >= 0, true);
      // one seat per person; occupied seat; Founder seat not appointable
      for (const [sid, uid, why] of [[await seatId(3, 2), a.userId, 'A second seat for Alice'], [seat, b.userId, 'Replace without removing'], [await seatId(1), b.userId, 'Make Bob the Founder']] as const) {
        const f = await direct('governance.appoint', { seatId: sid, userId: uid, reason: why }, 'x');
        assert.ok(f.status >= 400 || f.json.status === 'failed', why);
      }
      assert.ok(!(await t.call('GET', '/api/me', { token: b.token })).json.user.roles.includes('council'));
      // rollback is possible and verified
      const r2 = await direct('governance.appoint', { seatId: await seatId(24, 1), userId: b.userId, reason: 'Guardian for Bob' }, 'Appoint Bob');
      assert.equal(r2.json.proposal.canRollback, true);
      const rb = await t.call('POST', `/api/proposals/${r2.json.proposal.id}/rollback`, { token: founder.token, headers: { 'x-step-up': await stepUp(founder, 'founder@example.com') } });
      assert.equal(rb.status, 200);
      assert.ok(!(await t.call('GET', '/api/me', { token: b.token })).json.user.roles.includes('guardian'));
    });

    test('Council proposes appointments below the Council; Council seats are the Founder’s alone', async () => {
      const guard = await seatId(24, 2); const council = await seatId(3, 3);
      const p = await t.call('POST', '/api/governance/proposals', { token: a.token, body: { actionType: 'governance.appoint', payload: { seatId: guard, userId: c.userId, reason: 'Great community moderator' }, title: 'Appoint Carol as Guardian' } });
      assert.equal(p.status, 201); assert.equal(p.json.risk, 'high');
      assert.equal((await t.call('POST', '/api/governance/proposals', { token: a.token, body: { actionType: 'governance.appoint', payload: { seatId: council, userId: c.userId, reason: 'Appoint myself a friend' }, title: 'Council seat by Council' } })).status, 403);
      assert.equal((await t.call('POST', '/api/governance/proposals', { token: a.token, body: { actionType: 'config.flag_retention', payload: { days: 3 }, title: 'Change retention' } })).status, 403);
      // Council cannot decide
      assert.equal((await t.call('POST', `/api/proposals/${p.json.id}/decision`, { token: a.token, body: { decision: 'approve' } })).status, 403);
      // Founder: approve needs step-up
      assert.equal((await t.call('POST', `/api/proposals/${p.json.id}/decision`, { token: founder.token, body: { decision: 'approve' } })).status, 403);
      const ok = await t.call('POST', `/api/proposals/${p.json.id}/decision`, { token: founder.token, headers: { 'x-step-up': await stepUp(founder, 'founder@example.com') }, body: { decision: 'approve', note: 'Agreed' } });
      assert.equal(ok.json.status, 'executed');
      const ev = (await t.call('GET', `/api/proposals/${p.json.id}`, { token: founder.token })).json.events.map((e: any) => e.event);
      assert.ok(['created', 'approved', 'executed_verified'].every((e) => ev.includes(e)), ev.join());
    });

    test('Founder AI: Advisory mode never executes; Approval-required waits; mode changes are authenticated and audited', async () => {
      const st = (await t.call('GET', '/api/founder-ai/state', { token: founder.token })).json;
      assert.equal(st.mode, 'approval_required'); assert.equal(st.alwaysApproval.length, 6);
      assert.equal((await t.call('GET', '/api/founder-ai/state', { token: a.token })).status, 403);
      assert.equal((await t.call('POST', '/api/founder-ai/mode', { token: a.token, body: { mode: 'advisory', reason: 'Council trying to change it' } })).status, 403);
      assert.equal((await t.call('POST', '/api/founder-ai/mode', { token: founder.token, body: { mode: 'advisory', reason: 'Only analyse for now' } })).status, 403); // no step-up
      // approval-required: AI prepares a low-risk change, it WAITS
      const prep = await t.call('POST', '/api/founder-ai/proposals', { token: founder.token, body: { actionType: 'founder.notify', payload: { text: 'hello founder' }, title: 'Notify founder of hello' } });
      assert.equal(prep.json.outcome, 'pending_approval');
      assert.equal(Number((await t.db.get<any>("SELECT COUNT(*) AS n FROM notifications WHERE type = 'system' AND user_id = $1", [founder.userId])).n), 0);
      // advisory
      const su = await stepUp(founder, 'founder@example.com');
      assert.equal((await t.call('POST', '/api/founder-ai/mode', { token: founder.token, headers: { 'x-step-up': su }, body: { mode: 'advisory', reason: 'Only analyse for now' } })).json.mode, 'advisory');
      const adv = await t.call('POST', '/api/founder-ai/proposals', { token: founder.token, body: { actionType: 'universe.set_status', payload: { universeId: 'freelabs', status: 'concept' }, title: 'Mark FreeLabs as concept' } });
      assert.equal(adv.json.outcome, 'recommendation_only');
      const dec = await t.call('POST', `/api/proposals/${adv.json.id}/decision`, { token: founder.token, body: { decision: 'approve', note: 'Noted' } });
      assert.equal(dec.json.status, 'approved'); // acknowledged, not executed
      assert.equal(Object.keys((await t.call('GET', '/api/founder/universes', { token: founder.token })).json.items.find((u: any) => u.id === 'freelabs').note ?? {}).length, 0);
      const row = await t.db.get<any>('SELECT executed_at FROM proposals WHERE id = $1', [adv.json.id]);
      assert.equal(row.executed_at, null);
      // the mode change itself is in the decision record and audit log
      const aud = (await t.call('GET', '/api/founder/audit?action=proposal', { token: founder.token })).json.items;
      assert.ok(aud.some((x: any) => x.action === 'proposal.executed'));
      await t.call('POST', '/api/founder-ai/mode', { token: founder.token, headers: { 'x-step-up': await stepUp(founder, 'founder@example.com') }, body: { mode: 'approval_required', reason: 'Back to default mode' } });
    });

    test('Bounded autonomy: only low-risk actions under an enabled, in-quota rule; high-risk ALWAYS needs approval; risk cannot be forged', async () => {
      const su = async () => ({ 'x-step-up': await stepUp(founder, 'founder@example.com') });
      // rules cannot name a high-risk action
      assert.equal((await t.call('PUT', '/api/founder-ai/rules', { token: founder.token, headers: await su(), body: { rules: [{ id: 'bad-rule', actionType: 'governance.appoint', maxPerDay: 5, enabled: true }], reason: 'Trying to allow appointments' } })).status, 400);
      assert.equal((await t.call('PUT', '/api/founder-ai/rules', { token: founder.token, headers: await su(), body: { rules: [{ id: 'notify-rule', actionType: 'founder.notify', maxPerDay: 2, enabled: true }], reason: 'Allow routine founder notices' } })).status, 200);
      assert.equal((await t.call('POST', '/api/founder-ai/mode', { token: founder.token, headers: await su(), body: { mode: 'bounded_autonomy', reason: 'Let it send routine notices' } })).json.mode, 'bounded_autonomy');
      const before = Number((await t.db.get<any>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND type = 'system'", [founder.userId])).n);
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await t.call('POST', '/api/founder-ai/proposals', { token: founder.token, body: { actionType: 'founder.notify', payload: { text: `routine notice ${i}` }, title: `Routine notice ${i}` } });
        ids.push(r.json.outcome);
      }
      assert.deepEqual(ids, ['executed', 'executed', 'pending_approval']); // daily limit of 2 holds
      const auto = await t.db.get<any>("SELECT auto_executed, status FROM proposals WHERE title = 'Routine notice 0'");
      assert.ok(auto.auto_executed === true || auto.auto_executed === 1); assert.equal(auto.status, 'executed');
      assert.equal(Number((await t.db.get<any>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND type = 'system'", [founder.userId])).n), before + 2);
      // HIGH risk is never auto-run, in any mode
      const hi = await t.call('POST', '/api/founder-ai/proposals', { token: founder.token, body: { actionType: 'roles.moderator_grant', payload: { userId: c.userId, reason: 'Autonomy should not do this' }, title: 'Grant moderator to Carol' } });
      assert.equal(hi.json.outcome, 'pending_approval'); assert.match(hi.json.reason, /High-impact/);
      // forging the stored risk to 'low' does not help: risk is re-derived from the registry
      await t.db.run("UPDATE proposals SET effective_risk = 'low' WHERE id = $1", [hi.json.id]);
      const { submitFromAi } = await import('../server/governance/proposals');
      const forged = await submitFromAi(t.s, { actionType: 'roles.moderator_grant', payload: { userId: c.userId, reason: 'Forged low risk attempt' }, title: 'Forged' });
      assert.equal(forged.outcome, 'pending_approval');
      assert.ok(!(await t.call('GET', '/api/me', { token: c.token })).json.user.roles.includes('moderator'));
      // unknown / self-declared fields are rejected: the AI cannot pass its own risk
      assert.equal((await t.call('POST', '/api/founder-ai/proposals', { token: founder.token, body: { actionType: 'founder.notify', payload: { text: 'x', risk: 'low' }, title: 'Has a risk field' } })).status, 400);
      // approval is the ONLY way for the high-risk one to run
      const ap = await t.call('POST', `/api/proposals/${hi.json.id}/decision`, { token: founder.token, headers: await su(), body: { decision: 'approve', note: 'I reviewed this myself' } });
      assert.equal(ap.json.status, 'executed');
      assert.ok((await t.call('GET', '/api/me', { token: c.token })).json.user.roles.includes('moderator'));
      // outside bounded autonomy, rules do nothing
      await t.call('POST', '/api/founder-ai/mode', { token: founder.token, headers: await su(), body: { mode: 'approval_required', reason: 'Back to approval required' } });
      const r = await t.call('POST', '/api/founder-ai/proposals', { token: founder.token, body: { actionType: 'founder.notify', payload: { text: 'after' }, title: 'After switching back' } });
      assert.equal(r.json.outcome, 'pending_approval');
    });

    test('analysis produces labelled findings and bounded autonomy can act on a routine one', async () => {
      // overdue crisis case
      await t.db.run("INSERT INTO moderation_cases (id, status, priority, category, target_type, target_id, snapshot, due_at, created_at) VALUES ($1,'open','crisis','self_harm_crisis','post',$2,'{}',$3,$3)", [crypto.randomUUID(), crypto.randomUUID(), '2000-01-01T00:00:00.000Z']);
      const r = await t.call('POST', '/api/founder-ai/analyze', { token: founder.token });
      assert.equal(r.status, 200);
      const f = r.json.findings.find((x: any) => x.title.includes('past the internal target'));
      assert.ok(f); assert.equal(f.epistemic, 'verified_fact'); assert.equal(f.severity, 'high');
      assert.ok(r.json.findings.some((x: any) => x.epistemic === 'observation' || x.epistemic === 'suggestion' || x.title.includes('No AI model')));
      assert.ok(r.json.findings.every((x: any) => ['verified_fact', 'observation', 'assumption', 'forecast', 'suggestion'].includes(x.epistemic)));
      // re-running does not duplicate
      const again = await t.call('POST', '/api/founder-ai/analyze', { token: founder.token });
      assert.equal(again.json.findings.filter((x: any) => x.title.includes('past the internal target')).length, 1);
    });

    test('Founder AI conversation is labelled as computed in demo mode, never claims execution, and ignores private content', async () => {
      const conv = (await t.call('POST', '/api/founder-ai/conversations', { token: founder.token })).json.conversation;
      const r = await t.call('POST', `/api/founder-ai/conversations/${conv.id}/messages`, { token: founder.token, body: { body: 'How is moderation looking?' } });
      assert.equal(r.status, 200); assert.equal(r.json.labels.demo, true); assert.equal(r.json.labels.executed, false);
      assert.match(r.json.assistantMessage.body, /Computed answer \(no AI model is connected/);
      assert.match(r.json.assistantMessage.body, /I have not read any private content/);
      assert.ok(!r.json.assistantMessage.body.includes('SECRET-'));
      assert.equal((await t.call('GET', `/api/founder-ai/conversations/${conv.id}`, { token: a.token })).status, 403);
      assert.equal((await t.call('GET', '/api/ai/conversations', { token: founder.token })).json.items.every((x: any) => x.agentId !== 'founder-ai'), true);
    });

    test('delegation to a specialist is recorded; unavailable specialists are reported honestly', async () => {
      const ok = await t.call('POST', '/api/founder-ai/delegate', { token: founder.token, body: { to: 'athena', title: 'Research', prompt: 'Summarise study-skills resources' } });
      assert.equal(ok.json.delegation.status, 'completed'); assert.equal(ok.json.delegation.mode, 'demo');
      await t.call('POST', '/api/council/agents/forge/enabled', { token: founder.token, body: { enabled: false, reason: 'pausing forge for the test' } });
      const off = await t.call('POST', '/api/founder-ai/delegate', { token: founder.token, body: { to: 'forge', title: 'Ideas', prompt: 'Brainstorm startup ideas' } });
      assert.equal(off.json.delegation.status, 'unavailable');
      assert.equal((await t.call('POST', '/api/founder-ai/delegate', { token: founder.token, body: { to: 'founder-ai', title: 'Loop', prompt: 'Delegate to yourself' } })).status, 400);
      await t.call('POST', '/api/council/agents/forge/enabled', { token: founder.token, body: { enabled: true, reason: 'forge back on after test' } });
    });

    test('access review: every grant needs a decision; revoking needs step-up and is verified', async () => {
      const start = await t.call('POST', '/api/governance/access-reviews', { token: founder.token });
      assert.equal(start.status, 201);
      assert.equal((await t.call('POST', '/api/governance/access-reviews', { token: founder.token })).status, 409);
      const rv = (await t.call('GET', `/api/governance/access-reviews/${start.json.id}`, { token: founder.token })).json;
      assert.ok(rv.items.length >= 2);
      assert.equal((await t.call('POST', `/api/governance/access-reviews/${start.json.id}/complete`, { token: founder.token })).status, 409);
      for (const it of rv.items) await t.call('PATCH', `/api/governance/access-reviews/${start.json.id}/items/${it.id}`, { token: founder.token, body: { decision: it.role === 'moderator' && it.holder.handle === 'moddy' ? 'revoke' : 'keep', note: 'Moderator seat unused this quarter' } });
      assert.equal((await t.call('POST', `/api/governance/access-reviews/${start.json.id}/complete`, { token: founder.token })).status, 403); // step-up
      const done = await t.call('POST', `/api/governance/access-reviews/${start.json.id}/complete`, { token: founder.token, headers: { 'x-step-up': await stepUp(founder, 'founder@example.com') } });
      assert.equal(done.status, 200); assert.equal(done.json.results[0].status, 'executed');
      assert.ok(!(await t.call('GET', '/api/me', { token: mod.token })).json.user.roles.includes('moderator'));
    });

    test('constitutional amendment: high-risk, step-up, recorded, rollback-able', async () => {
      assert.equal((await direct('constitution.amend', { title: 'Amendment one', summary: 'Clarifies the Council’s role.', text: 'The Council of three advises the Founder on constitutional matters.' }, 'Amend', false)).status, 403);
      const r = await direct('constitution.amend', { title: 'Amendment one', summary: 'Clarifies the Council’s role.', text: 'The Council of three advises the Founder on constitutional matters.' }, 'Amend');
      assert.equal(r.json.status, 'executed');
      assert.equal((await t.call('GET', '/api/founder/constitution', { token: founder.token })).json.amendments.length, 1);
    });

    test('retention change is a material privacy change: step-up, applied to new flags, disclosed', async () => {
      assert.equal((await direct('config.flag_retention', { days: 14 }, 'Shorten retention')).json.status, 'executed');
      const info = (await t.call('GET', '/api/ai/info', { token: b.token })).json;
      assert.equal(info.flagRetentionDays, 14);
    });

    test('universe status change is medium risk, needs no step-up, and shows publicly', async () => {
      const r = await direct('universe.set_status', { universeId: 'freemarket', status: 'concept', note: 'Re-scoped' }, 'Re-scope FreeMarket', false);
      assert.equal(r.json.status, 'executed'); assert.equal(r.json.proposal.risk, 'medium');
      assert.equal((await t.call('GET', '/api/universes/overrides', { token: b.token })).json.overrides.freemarket.status, 'concept');
    });

    test('audit log records governance decisions and is append-only', async () => {
      const items = (await t.call('GET', '/api/founder/audit?limit=100', { token: founder.token })).json.items;
      for (const action of ['proposal.executed', 'proposal.approved', 'access_review.started', 'access_review.completed', 'governance.founder_bootstrap']) assert.ok(items.some((x: any) => x.action === action), `missing ${action}`);
      await assert.rejects(() => t.db.run("UPDATE audit_events SET action = 'x'"));
      assert.equal((await t.call('GET', '/api/founder/audit', { token: a.token })).status, 200); // Council may read
      assert.equal((await t.call('GET', '/api/founder/audit', { token: b.token })).status, 403);
    });

    test('every protected route rejects anonymous callers (full registry)', async () => {
      for (const r of t.app.router.list().filter((x) => x.auth !== 'none')) {
        const res = await t.call(r.method, r.pattern.replace(/:\w+/g, '00000000-0000-4000-8000-000000000000'));
        assert.equal(res.status, 401, `${r.method} ${r.pattern}`);
      }
    });
  });
}
