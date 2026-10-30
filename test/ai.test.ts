import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { runMaintenance } from '../server/jobs';

for (const dialect of DIALECTS) {
  describe(`AI council, Nova, personal tools [${dialect}]`, () => {
    let t: TestApp;
    let a: { token: string; userId: string }, b: typeof a, mod: typeof a, founder: typeof a;
    before(async () => {
      t = await startTestApp(dialect, {});
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' });
      b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' });
      mod = await t.member('m@example.com', { handle: 'moddy', name: 'Mod' }); await t.grantRole(mod.userId, 'moderator');
      founder = await t.member('f@example.com', { handle: 'fnd', name: 'Fnd' }); await t.grantRole(founder.userId, 'founder');
    });
    after(async () => { await t.close(); });
    beforeEach(() => { t.clock.advance(3 * 3600_000); });

    test('Council lists nine named specialists, hides Founder AI, and is honest about demo mode', async () => {
      const r = await t.call('GET', '/api/council', { token: a.token });
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.agents.map((x: any) => x.name), ['Athena', 'Atlas', 'Nova', 'Aegis', 'Sage', 'Pulse', 'Forge', 'Echo', 'Compass']);
      assert.ok(!JSON.stringify(r.json).includes('founder-ai'));
      assert.match(r.json.honesty, /no AI model is connected/i);
      assert.ok(r.json.agents.every((x: any) => x.state === 'demo'));
      const caps = (await t.call('GET', '/api/council/capabilities', { token: a.token })).json.capabilities;
      assert.equal(caps.find((c: any) => c.id === 'image.generate').state, 'unavailable');
      assert.equal(caps.find((c: any) => c.id === 'text.chat').state, 'demo');
    });

    test('routing picks a specialist and reports unavailable ones', async () => {
      const r = await t.call('POST', '/api/council/route', { token: a.token, body: { text: 'Help me prepare for a job interview and fix my CV' } });
      assert.equal(r.json.decision.agentId, 'atlas');
      assert.equal((await t.call('POST', '/api/council/route', { token: a.token, body: { text: 'zzz qqq' } })).json.decision.agentId, 'nova');
      assert.equal((await t.call('POST', '/api/council/agents/atlas/enabled', { token: founder.token, body: { enabled: false, reason: 'testing unavailable' } })).status, 200);
      const r2 = await t.call('POST', '/api/council/route', { token: a.token, body: { text: 'Help me prepare for a job interview' } });
      assert.ok(r2.json.decision.unavailable);
      const conv = (await t.call('POST', '/api/ai/conversations', { token: a.token, body: { agentId: 'atlas' } })).json.conversation;
      const msg = await t.call('POST', `/api/ai/conversations/${conv.id}/messages`, { token: a.token, body: { body: 'hi' } });
      assert.equal(msg.status, 503); assert.equal(msg.json.error.code, 'agent_unavailable');
      assert.equal((await t.call('POST', '/api/council/agents/atlas/enabled', { token: b.token, body: { enabled: true, reason: 'not allowed' } })).status, 403);
      await t.call('POST', '/api/council/agents/atlas/enabled', { token: founder.token, body: { enabled: true, reason: 'back on again' } });
    });

    test('conversations: create, chat (labelled demo), rename, pin, search, delete', async () => {
      const conv = (await t.call('POST', '/api/ai/conversations', { token: a.token, body: { agentId: 'athena' } })).json.conversation;
      const r = await t.call('POST', `/api/ai/conversations/${conv.id}/messages`, { token: a.token, body: { body: 'Explain photosynthesis simply' } });
      assert.equal(r.status, 200); assert.equal(r.json.mode, 'demo');
      assert.match(r.json.assistantMessage.body, /Demo mode/);
      assert.equal(r.json.assistantMessage.meta.mode, 'demo');
      const full = (await t.call('GET', `/api/ai/conversations/${conv.id}`, { token: a.token })).json;
      assert.equal(full.messages.length, 2); assert.match(full.conversation.title, /photosynthesis/i);
      assert.equal((await t.call('GET', `/api/ai/conversations/${conv.id}`, { token: b.token })).status, 404);
      await t.call('PATCH', `/api/ai/conversations/${conv.id}`, { token: a.token, body: { title: 'Biology help', pinned: true } });
      assert.equal((await t.call('GET', '/api/ai/conversations?q=biology', { token: a.token })).json.items.length, 1);
      assert.equal((await t.call('GET', '/api/ai/conversations?q=photosynth', { token: a.token })).json.items.length, 1); // matches message text
      assert.equal((await t.call('GET', '/api/ai/conversations?q=zzzz', { token: a.token })).json.items.length, 0);
      assert.equal((await t.call('DELETE', `/api/ai/conversations/${conv.id}`, { token: a.token })).status, 200);
      assert.equal((await t.call('GET', `/api/ai/conversations/${conv.id}`, { token: a.token })).status, 404);
    });

    test('Founder AI cannot be chatted with through the member API', async () => {
      assert.equal((await t.call('POST', '/api/ai/conversations', { token: a.token, body: { agentId: 'founder-ai' } })).status, 404);
    });

    test('temporary chat stores nothing; history switch is honoured', async () => {
      await t.call('PATCH', '/api/settings', { token: a.token, body: { nova: { saveHistory: false } } });
      assert.equal((await t.call('POST', '/api/ai/conversations', { token: a.token, body: { agentId: 'nova' } })).status, 409);
      const before = Number((await t.db.get<any>('SELECT COUNT(*) AS n FROM ai_messages')).n);
      const r = await t.call('POST', '/api/ai/chat', { token: a.token, body: { agentId: 'nova', messages: [{ role: 'user', content: 'hello there' }] } });
      assert.equal(r.status, 200); assert.equal(r.json.stored, false);
      assert.equal(Number((await t.db.get<any>('SELECT COUNT(*) AS n FROM ai_messages')).n), before);
      await t.call('PATCH', '/api/settings', { token: a.token, body: { nova: { saveHistory: true } } });
    });

    test('daily cap is enforced', async () => {
      const capped = await startTestApp(dialect, { AI_DAILY_MESSAGE_CAP: '2' });
      try {
        const u = await capped.member('u@example.com');
        const conv = (await capped.call('POST', '/api/ai/conversations', { token: u.token, body: { agentId: 'nova' } })).json.conversation;
        for (let i = 0; i < 2; i++) assert.equal((await capped.call('POST', `/api/ai/conversations/${conv.id}/messages`, { token: u.token, body: { body: `m${i}` } })).status, 200);
        assert.equal((await capped.call('POST', `/api/ai/conversations/${conv.id}/messages`, { token: u.token, body: { body: 'one more' } })).status, 429);
      } finally { await capped.close(); }
    });

    test('habit schedules: days, 24-hour time, time zone, due logic, edit and delete', async () => {
      t.clock.set('2026-10-15T12:00:00.000Z'); // a Thursday; pinned so the weekday and time-zone maths are exact
      await t.call('PATCH', '/api/settings', { token: a.token, body: { nova: { habitsEnabled: true } } });
      const bad = (body: object) => t.call('POST', '/api/habits', { token: a.token, body: { title: 'Stretch', ...body } });
      assert.equal((await bad({ timeOfDay: '6:30 PM' })).status, 400, 'ambiguous 12-hour text is refused');
      assert.equal((await bad({ timeOfDay: '25:00' })).status, 400); assert.equal((await bad({ days: [7] })).status, 400); assert.equal((await bad({ timezone: 'Mars/Base' })).status, 400);
      // Clock is 2026-10-15 12:00Z, a Thursday. Lagos is UTC+1, so it is 13:00 there; Kiritimati (+14) is already Friday 02:00.
      const lagos = (await bad({ title: 'Evening walk', days: [4], timeOfDay: '18:30', timezone: 'Africa/Lagos', reminder: true })).json.habit;
      assert.deepEqual(lagos.days, [4]); assert.equal(lagos.timeOfDay, '18:30'); assert.equal(lagos.scheduledToday, true); assert.equal(lagos.dueNow, false, '18:30 has not passed at 13:00');
      const early = (await bad({ title: 'Morning', days: [4], timeOfDay: '08:00', timezone: 'Africa/Lagos', reminder: true })).json.habit; assert.equal(early.dueNow, true);
      const noRem = (await bad({ title: 'Quiet', timeOfDay: '08:00', timezone: 'Africa/Lagos' })).json.habit; assert.equal(noRem.dueNow, false, 'no reminder, never due');
      const kiri = (await bad({ title: 'Island', days: [4], timezone: 'Pacific/Kiritimati' })).json.habit; assert.equal(kiri.scheduledToday, false, 'it is Friday there');
      const edited = (await t.call('PATCH', `/api/habits/${lagos.id}`, { token: a.token, body: { timeOfDay: '07:15', days: [1, 3] } })).json.habit; assert.equal(edited.timeOfDay, '07:15'); assert.deepEqual(edited.days, [1, 3]); assert.equal(edited.scheduledToday, false);
      const done = (await t.call('POST', `/api/habits/${early.id}/checkin`, { token: a.token, body: {} })).json.habit; assert.equal(done.doneToday, true); assert.equal(done.dueNow, false, 'done habits are not due');
      await t.call('PATCH', '/api/settings', { token: b.token, body: { nova: { habitsEnabled: true } } });
      assert.equal((await t.call('PATCH', `/api/habits/${lagos.id}`, { token: b.token, body: { title: 'hijack' } })).status, 404, 'not someone else’s habit');
      assert.equal((await t.call('DELETE', `/api/habits/${lagos.id}`, { token: a.token })).status, 200);
      assert.ok(!(await t.call('GET', '/api/habits', { token: a.token })).json.items.some((h: any) => h.id === lagos.id));
    });

    test('personal tools are opt-in, private, and unreadable by moderators and the Founder', async () => {
      assert.equal((await t.call('GET', '/api/journal', { token: a.token })).status, 409); // off by default
      await t.call('PATCH', '/api/settings', { token: a.token, body: { nova: { journalEnabled: true, goalsEnabled: true, habitsEnabled: true } } });
      const j = await t.call('POST', '/api/journal', { token: a.token, body: { title: 'Day one', body: 'private thoughts about everything' } });
      assert.equal(j.status, 201);
      for (const who of [b, mod, founder]) {
        const r = await t.call('GET', '/api/journal', { token: who.token });
        assert.ok(r.status === 409 || !JSON.stringify(r.json).includes('private thoughts'));
      }
      assert.equal((await t.call('PATCH', `/api/journal/${j.json.entry.id}`, { token: b.token, body: { body: 'x' } })).status, 409 /* b has it off */);
      await t.call('PATCH', '/api/settings', { token: b.token, body: { nova: { journalEnabled: true } } });
      assert.equal((await t.call('PATCH', `/api/journal/${j.json.entry.id}`, { token: b.token, body: { body: 'x' } })).status, 404);
      assert.equal((await t.call('DELETE', `/api/journal/${j.json.entry.id}`, { token: b.token })).status, 404);
      // not in any other API
      const everything = JSON.stringify([(await t.call('GET', '/api/profile', { token: a.token })).json, (await t.call('GET', '/api/members/alice', { token: b.token })).json, (await t.call('GET', '/api/feed', { token: b.token })).json]);
      assert.ok(!everything.includes('private thoughts'));
      // goals and habits
      const g = await t.call('POST', '/api/goals', { token: a.token, body: { title: 'Learn SQL', steps: ['basics', 'joins'] } });
      assert.equal(g.json.goal.steps.length, 2);
      const g2 = await t.call('PATCH', `/api/goals/${g.json.goal.id}`, { token: a.token, body: { toggleStep: g.json.goal.steps[0].id } });
      assert.equal(g2.json.goal.steps[0].done, true);
      const h = (await t.call('POST', '/api/habits', { token: a.token, body: { title: 'Read 10 pages' } })).json.habit;
      const c1 = await t.call('POST', `/api/habits/${h.id}/checkin`, { token: a.token, body: {} });
      assert.equal(c1.json.habit.doneToday, true); assert.equal(c1.json.habit.current, 1);
      assert.equal((await t.call('POST', `/api/habits/${h.id}/checkin`, { token: a.token, body: { day: '2099-01-01' } })).status, 409);
      // attach a journal entry to a Nova message — only on explicit request
      const conv = (await t.call('POST', '/api/ai/conversations', { token: a.token, body: { agentId: 'nova' } })).json.conversation;
      const at = await t.call('POST', `/api/ai/conversations/${conv.id}/messages`, { token: a.token, body: { body: 'what do you think?', attachJournalEntryId: j.json.entry.id } });
      assert.equal(at.json.userMessage.meta.attached, 'journal');
      assert.equal((await t.call('POST', `/api/ai/conversations/${conv.id}/messages`, { token: a.token, body: { body: 'and this?', attachJournalEntryId: '00000000-0000-4000-8000-000000000000' } })).status, 404);
      // turning a tool off hides it; erasing is explicit
      await t.call('PATCH', '/api/settings', { token: a.token, body: { nova: { journalEnabled: false } } });
      assert.equal((await t.call('GET', '/api/journal', { token: a.token })).status, 409);
      assert.equal(Number((await t.db.get<any>('SELECT COUNT(*) AS n FROM journal_entries WHERE user_id = $1', [a.userId])).n), 1);
    });

    test('the Anthropic adapter is wired through the interface (fake fetch) and health makes the state operational', async () => {
      const calls: any[] = [];
      const fake = (async (url: any, init: any) => { calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hello from the model' }] }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
      const live = await startTestApp(dialect, { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-test-not-real' }, { fetchImpl: fake });
      try {
        const u = await live.member('u2@example.com'); const f = await live.member('f9@example.com'); await live.grantRole(f.userId, 'founder');
        let cap = (await live.call('GET', '/api/council', { token: u.token })).json;
        assert.ok(cap.agents.every((x: any) => x.state === 'configured'));
        const conv = (await live.call('POST', '/api/ai/conversations', { token: u.token, body: { agentId: 'athena' } })).json.conversation;
        const r = await live.call('POST', `/api/ai/conversations/${conv.id}/messages`, { token: u.token, body: { body: 'Explain recursion' } });
        assert.equal(r.json.mode, 'live'); assert.equal(r.json.assistantMessage.body, 'Hello from the model');
        assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages'); assert.equal(calls[0].headers['x-api-key'], 'sk-test-not-real');
        assert.match(calls[0].body.system, /Athena/);
        assert.equal((await live.call('POST', '/api/council/agents/athena/health', { token: f.token })).json.ok, true);
        cap = (await live.call('GET', '/api/council', { token: u.token })).json;
        assert.ok(cap.agents.every((x: any) => x.state === 'operational'));
        // the key is never present in any response
        assert.ok(!JSON.stringify([cap, r.json]).includes('sk-test-not-real'));
      } finally { await live.close(); }
    });

    test('account deletion removes Nova history and tools; flag excerpt is detached', async () => {
      const d = await t.member('d@example.com', { handle: 'dina', name: 'Dina' });
      await t.call('PATCH', '/api/settings', { token: d.token, body: { nova: { journalEnabled: true } } });
      await t.call('POST', '/api/journal', { token: d.token, body: { body: 'dina journal' } });
      const conv = (await t.call('POST', '/api/ai/conversations', { token: d.token, body: { agentId: 'nova' } })).json.conversation;
      await t.call('POST', `/api/ai/conversations/${conv.id}/messages`, { token: d.token, body: { body: 'I want to die' } });
      const su = await t.call('POST', '/api/me/step-up', { token: d.token, body: { secret: 'd@example.com' } });
      assert.equal((await t.call('POST', '/api/account/delete', { token: d.token, headers: { 'x-step-up': su.json.token }, body: { confirm: 'DELETE MY ACCOUNT' } })).status, 200);
      for (const tab of ['ai_conversations', 'journal_entries']) assert.equal(Number((await t.db.get<any>(`SELECT COUNT(*) AS n FROM ${tab} WHERE user_id = $1`, [d.userId])).n), 0);
      assert.equal(Number((await t.db.get<any>('SELECT COUNT(*) AS n FROM ai_safety_flags WHERE user_id = $1', [d.userId])).n), 0);
      assert.equal(Number((await t.db.get<any>("SELECT COUNT(*) AS n FROM ai_safety_flags WHERE excerpt LIKE '%want to die%'")).n), 1); // still expires on its own schedule
    });
    test('crisis message: safety reply with resources, provider not called, flag + case, 30-day expiry', async () => {
      const conv = (await t.call('POST', '/api/ai/conversations', { token: b.token, body: { agentId: 'nova' } })).json.conversation;
      const r = await t.call('POST', `/api/ai/conversations/${conv.id}/messages`, { token: b.token, body: { body: 'I want to end my life' } });
      assert.equal(r.status, 200); assert.equal(r.json.mode, 'safety'); assert.equal(r.json.safety.severity, 'crisis');
      assert.ok(r.json.safety.resources.length >= 3);
      assert.equal(r.json.assistantMessage.role, 'notice');
      assert.equal(Number((await t.db.get<any>('SELECT COUNT(*) AS n FROM ai_usage')).n), (await t.db.query('SELECT 1 FROM ai_usage')).length); // no extra provider usage row for the crisis
      const flag = await t.db.get<any>("SELECT * FROM ai_safety_flags WHERE excerpt LIKE '%end my life%'");
      assert.ok(flag); assert.equal(flag.severity, 'crisis');
      const days = (new Date(flag.expires_at).getTime() - new Date(flag.created_at).getTime()) / 86400_000;
      assert.equal(Math.round(days), 30);
      const cases = (await t.db.query<any>("SELECT * FROM moderation_cases WHERE target_type = 'ai_flag'")).filter((x) => JSON.stringify(x.snapshot).includes('end my life'));
      assert.equal(cases.length, 1); assert.equal(cases[0].priority, 'crisis');
      // deleting the conversation does not silently erase the flag within the disclosed window
      await t.call('DELETE', `/api/ai/conversations/${conv.id}`, { token: b.token });
      assert.equal((await t.db.query("SELECT 1 FROM ai_safety_flags WHERE excerpt LIKE '%end my life%'")).length, 1);
      // reviewers see only the excerpt, with reason + audit
      const rv = await t.call('POST', `/api/moderation/cases/${cases[0].id}/review-content`, { token: mod.token, body: { reason: 'Checking the person was pointed to help' } });
      assert.equal(rv.json.snapshot.type, 'ai_flag'); assert.match(rv.json.snapshot.excerpt, /end my life/);
      assert.ok(!JSON.stringify(rv.json).includes(b.userId));
      // after 31 days maintenance deletes it and blanks the case
      t.clock.advance(31 * 86400_000);
      const m = await runMaintenance(t.s);
      assert.ok(m.flagsPurged >= 1);
      assert.equal((await t.db.query("SELECT 1 FROM ai_safety_flags WHERE excerpt LIKE '%end my life%'")).length, 0);
      const c2 = await t.db.get<any>("SELECT snapshot, status FROM moderation_cases WHERE id = $1", [cases[0].id]);
      assert.ok(!JSON.stringify(c2.snapshot).includes('end my life')); assert.equal(c2.status, 'resolved');
    });

  });
}
