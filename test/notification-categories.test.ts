import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { runMaintenance } from '../server/jobs';
import { DEFAULT_SETTINGS } from '../shared/api/settings';

test('every notification category defaults on, including the new ones and safety', () => {
  for (const k of ['events', 'opportunities', 'learning', 'achievements', 'ai', 'announcements', 'safety', 'system']) assert.equal((DEFAULT_SETTINGS.notifications as any)[k], true, k);
});

for (const dialect of DIALECTS) {
  describe(`notification categories and scheduled cleanup [${dialect}]`, () => {
    let t: TestApp; let a: { token: string; userId: string }, b: { token: string; userId: string }, f: { token: string; userId: string };
    const notes = async (who: { token: string }, type?: string) => ((await t.call('GET', '/api/notifications', { token: who.token })).json.items as any[]).filter((n) => !type || n.type === type);
    const iso = (ms: number) => new Date(t.clock.now().getTime() + ms).toISOString();
    before(async () => {
      t = await startTestApp(dialect, {});
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' }); f = await t.member('f@example.com', { handle: 'fnd', name: 'Fnd' }); await t.grantRole(f.userId, 'founder');
    });
    after(async () => { await t.close(); });

    test('event reminders: only for yes/maybe, within a day, once; off means none', async () => {
      const soon = crypto.randomUUID(); const far = crypto.randomUUID();
      for (const [id, at] of [[soon, iso(5 * 3600_000)], [far, iso(5 * 86400_000)]]) await t.db.run("INSERT INTO events (id, title, description, category, format, starts_at, is_demo, status) VALUES ($1,$2,'d','Study skills','virtual',$3,$4,'published')", [id, id === soon ? 'Soon event' : 'Far event', at, dialect === 'sqlite' ? 1 : true]);
      for (const id of [soon, far]) { await t.call('PUT', `/api/events/${id}/rsvp`, { token: a.token, body: { response: 'yes' } }); await t.call('PUT', `/api/events/${id}/rsvp`, { token: b.token, body: { response: id === soon ? 'yes' : 'no' } }); }
      await t.call('PATCH', '/api/settings', { token: b.token, body: { notifications: { events: false } } });
      const r1 = await runMaintenance(t.s); assert.equal(r1.alerts.events, 1, 'only alice is told: bob has reminders off');
      const n = await notes(a, 'event_reminder'); assert.equal(n.length, 1); assert.match(n[0].text, /Soon event/);
      assert.equal((await notes(b, 'event_reminder')).length, 0, 'an off switch gives nothing');
      await runMaintenance(t.s); assert.equal((await notes(a, 'event_reminder')).length, 1, 'sent once');
    });

    test('opportunity deadlines: interested only, within three days, once', async () => {
      const id = crypto.randomUUID(); const far = crypto.randomUUID();
      for (const [i, d] of [[id, iso(2 * 86400_000)], [far, iso(30 * 86400_000)]]) await t.db.run("INSERT INTO opportunities (id, type, title, organisation, description, category, work_mode, deadline, is_demo, status, created_at) VALUES ($1,'grant',$2,'Org','d','Funding','remote',$3,$4,'published',$5)", [i, i === id ? 'Near grant' : 'Far grant', d, dialect === 'sqlite' ? 1 : true, iso(0)]);
      for (const i of [id, far]) await t.call('PUT', `/api/opportunities/${i}/tracking`, { token: a.token, body: { status: 'interested' } });
      await runMaintenance(t.s); await runMaintenance(t.s);
      const n = await notes(a, 'opportunity_deadline'); assert.equal(n.length, 1); assert.match(n[0].text, /Near grant/);
    });

    test('learning completion is announced once and honours its switch', async () => {
      const { seedCatalog } = await import('../server/seed/catalog'); await seedCatalog(t.s);
      const quiz = (await t.call('GET', '/api/learn?format=quiz', { token: a.token })).json.items[0]; assert.ok(quiz);
      await t.call('PUT', `/api/learn/${quiz.slug}/progress`, { token: a.token, body: { completed: true } });
      await t.call('PUT', `/api/learn/${quiz.slug}/progress`, { token: a.token, body: { completed: true } });
      assert.equal((await notes(a, 'learning')).length, 1, 'once');
      await t.call('PATCH', '/api/settings', { token: b.token, body: { notifications: { learning: false } } });
      await t.call('PUT', `/api/learn/${quiz.slug}/progress`, { token: b.token, body: { completed: true } });
      assert.equal((await notes(b, 'learning')).length, 0);
    });

    test('safety notices can be switched off, and are on by default', async () => {
      const { notify } = await import('../server/services/notify');
      assert.equal(await notify(t.db, { userId: a.userId, type: 'moderation', data: {} }, t.clock.now()), true, 'on by default');
      await t.call('PATCH', '/api/settings', { token: a.token, body: { notifications: { safety: false } } });
      for (const type of ['moderation', 'report_update', 'appeal']) assert.equal(await notify(t.db, { userId: a.userId, type, data: {} }, t.clock.now()), false, type);
      assert.equal(await notify(t.db, { userId: a.userId, type: 'comment', actorId: b.userId, data: {} }, t.clock.now()), true, 'other categories unaffected');
      await t.call('PATCH', '/api/settings', { token: a.token, body: { notifications: { safety: true } } });
      assert.equal(await notify(t.db, { userId: a.userId, type: 'appeal', data: {} }, t.clock.now()), true);
    });

    test('announcements: founder only, validated, audited, reach members who haven’t opted out', async () => {
      assert.equal((await t.call('POST', '/api/founder-ai/announcements', { token: a.token, body: { text: 'Hello everyone' } })).status, 403);
      assert.equal((await t.call('POST', '/api/founder-ai/announcements', { token: f.token, body: { text: 'hi' } })).status, 400);
      assert.equal((await t.call('POST', '/api/founder-ai/announcements', { token: f.token, body: { text: 'Hello everyone', href: 'https://evil.example' } })).status, 400);
      await t.call('PATCH', '/api/settings', { token: b.token, body: { notifications: { announcements: false } } });
      const r = await t.call('POST', '/api/founder-ai/announcements', { token: f.token, body: { text: 'Messaging settings are here.', href: '#/settings/messaging' } }); assert.equal(r.status, 201);
      assert.equal((await notes(a, 'announcement')).length, 1); assert.equal((await notes(b, 'announcement')).length, 0); assert.ok(r.json.sent >= 2);
      const list = (await t.call('GET', '/api/founder-ai/announcements', { token: f.token })).json.items; assert.equal(list[0].text, 'Messaging settings are here.');
    });

    test('scheduled job removes expired disappearing messages without anyone opening the chat', async () => {
      await t.call('PATCH', '/api/settings', { token: a.token, body: { messaging: { defaultExpiry: '24h' } } });
      await t.call('PATCH', '/api/settings', { token: b.token, body: { messaging: { requestsFrom: 'everyone', requestHandling: 'allow' } } });
      assert.equal((await t.call('POST', '/api/conversations', { token: a.token, body: { handle: 'bob', body: 'this will vanish' } })).status, 201);
      const count = async () => Number((await t.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE body = 'this will vanish'"))?.n);
      assert.equal(await count(), 1);
      await runMaintenance(t.s); assert.equal(await count(), 1, 'not yet expired');
      t.clock.advance(25 * 3600_000);
      const r = await runMaintenance(t.s); assert.equal(await count(), 0); assert.ok(r.alerts.messagesPurged >= 1);
    });

    test('Nova cleanup runs on schedule and tells the person once it removes something', async () => {
      await t.call('PATCH', '/api/settings', { token: a.token, body: { nova: { historyRetentionDays: 30 } } });
      const id = crypto.randomUUID(); const old = new Date(t.clock.now().getTime() - 40 * 86400_000).toISOString();
      await t.db.run("INSERT INTO ai_conversations (id, user_id, agent_id, title, pinned, created_at, updated_at) VALUES ($1,$2,'nova','Old chat',$3,$4,$4)", [id, a.userId, dialect === 'sqlite' ? 0 : false, old]);
      const r = await runMaintenance(t.s); assert.equal(r.alerts.novaCleanups, 1);
      assert.equal(Number((await t.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_conversations WHERE id = $1', [id]))?.n), 0);
      assert.equal((await notes(a, 'ai_activity')).length, 1);
      assert.equal((await runMaintenance(t.s)).alerts.novaCleanups, 0);
    });
  });
}
