import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { DEFAULT_SETTINGS, MSG_CHOICES, inQuietHours, mergeSettings } from '../shared/api/settings';

const q = { quietEnabled: true, quietStart: '22:00', quietEnd: '07:00', quietOffset: 0 };
describe('messaging settings model (pure)', () => {
  test('quiet hours wrap midnight, follow the person’s own offset, and are off by default', () => {
    assert.equal(inQuietHours(DEFAULT_SETTINGS.messaging, new Date('2026-10-15T23:00:00Z')), false);
    assert.equal(inQuietHours(q, new Date('2026-10-15T23:00:00Z')), true); assert.equal(inQuietHours(q, new Date('2026-10-16T06:59:00Z')), true);
    assert.equal(inQuietHours(q, new Date('2026-10-16T07:00:00Z')), false); assert.equal(inQuietHours(q, new Date('2026-10-15T12:00:00Z')), false);
    assert.equal(inQuietHours({ ...q, quietOffset: 60 }, new Date('2026-10-15T21:30:00Z')), true, 'UTC+1: 22:30 local');
    assert.equal(inQuietHours({ ...q, quietStart: '09:00', quietEnd: '17:00' }, new Date('2026-10-15T12:00:00Z')), true);
    assert.equal(inQuietHours({ ...q, quietStart: '08:00', quietEnd: '08:00' }, new Date('2026-10-15T08:00:00Z')), false);
  });
  test('unknown or malformed values fall back to the defaults', () => {
    const m = mergeSettings({ messaging: { requestsFrom: 'bananas', defaultExpiry: '1y', quietStart: '25:99', quietOffset: 99999, chatTheme: 'calm', allowReactions: false } }).messaging;
    assert.equal(m.requestsFrom, 'everyone'); assert.equal(m.defaultExpiry, 'never'); assert.equal(m.quietStart, '22:00'); assert.equal(m.quietOffset, 0); assert.equal(m.chatTheme, 'calm'); assert.equal(m.allowReactions, false);
    for (const [k, v] of Object.entries(MSG_CHOICES)) assert.ok((v as readonly string[]).includes((DEFAULT_SETTINGS.messaging as any)[k]), `default for ${k} is a valid choice`);
  });
});

for (const dialect of DIALECTS) {
  describe(`messaging controls are enforced by the server [${dialect}]`, () => {
    let t: TestApp; let a: { token: string; userId: string }, b: { token: string; userId: string }, c: { token: string; userId: string };
    const set = (who: { token: string }, messaging: object, notifications?: object) => t.call('PATCH', '/api/settings', { token: who.token, body: { messaging, ...(notifications ? { notifications } : {}) } });
    const msg = (who: { token: string }, handle: string, body = 'hello there') => t.call('POST', '/api/conversations', { token: who.token, body: { handle, body } });
    const notes = async (who: { token: string }) => (await t.call('GET', '/api/notifications', { token: who.token })).json.items as any[];
    before(async () => { t = await startTestApp(dialect); a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' }); c = await t.member('c@example.com', { handle: 'cara', name: 'Cara' }); });
    after(async () => { await t.close(); });

    test('settings are validated and persist', async () => {
      assert.equal((await set(a, { requestsFrom: 'bananas' })).status, 400); assert.equal((await set(a, { quietStart: '9pm' })).status, 400); assert.equal((await set(a, { surprise: true })).status, 400);
      assert.equal((await set(a, { chatTheme: 'calm', defaultExpiry: '7d', quietOffset: 60 })).status, 200);
      const m = (await t.call('GET', '/api/settings', { token: a.token })).json.settings.messaging; assert.equal(m.chatTheme, 'calm'); assert.equal(m.defaultExpiry, '7d'); assert.equal(m.quietOffset, 60);
      await set(a, { chatTheme: 'default', defaultExpiry: 'never', quietOffset: 0 });
    });

    test('who can send message requests: nobody, then followers only', async () => {
      await set(b, { requestsFrom: 'nobody' }); assert.equal((await msg(a, 'bob')).status, 403);
      await set(b, { requestsFrom: 'followers' }); assert.equal((await msg(a, 'bob')).status, 403, 'a does not follow b');
      await t.call('POST', '/api/members/bob/follow', { token: a.token }); const r = await msg(a, 'bob'); assert.equal(r.status, 201); assert.equal(r.json.asRequest, true);
      await set(b, { requestsFrom: 'everyone' });
    });

    test('Filter holds requests from people you share nothing with, without a notification; Restrict is silent; Allow notifies', async () => {
      await set(c, { requestHandling: 'filter' }); const before = (await notes(c)).length;
      assert.equal((await msg(a, 'cara', 'filter me')).status, 201);
      let l = (await t.call('GET', '/api/conversations', { token: c.token })).json; assert.equal(l.requests.length, 0); assert.equal(l.filtered.length, 1); assert.equal((await notes(c)).length, before, 'no notification');
      assert.equal((await t.call('POST', `/api/conversations/${l.filtered[0].id}/unfilter`, { token: c.token })).status, 200);
      l = (await t.call('GET', '/api/conversations', { token: c.token })).json; assert.equal(l.requests.length, 1); assert.equal(l.filtered.length, 0);
      // a shared community sends it to Requests, with a notification
      const made = await t.call('POST', '/api/communities', { token: b.token, body: { name: 'Night Owls', description: 'For people who study at night.', category: 'Study', rules: ['Be kind to each other'] } }); assert.equal(made.status, 201, JSON.stringify(made.json));
      assert.ok((await t.call('POST', `/api/communities/${made.json.community?.slug ?? made.json.slug ?? 'night-owls'}/join`, { token: c.token })).status < 300);
      await set(c, { requestHandling: 'filter' }); const n0 = (await notes(c)).length; assert.equal((await msg(b, 'cara', 'we share a community')).status, 201);
      l = (await t.call('GET', '/api/conversations', { token: c.token })).json; assert.equal(l.requests.length, 2); assert.equal(l.filtered.length, 0); assert.equal((await notes(c)).length, n0 + 1);
      // Restrict: even a shared-community request is silent
      const d = await t.member('d@example.com', { handle: 'dave', name: 'Dave' }); await set(d, { requestHandling: 'restrict' }); const nd = (await notes(d)).length;
      assert.equal((await msg(a, 'dave')).status, 201); assert.equal((await notes(d)).length, nd); assert.equal((await t.call('GET', '/api/conversations', { token: d.token })).json.requests.length, 1);
      await set(c, { requestHandling: 'allow' }); const e = await t.member('e@example.com', { handle: 'erin', name: 'Erin' }); const ne = (await notes(e)).length; await msg(a, 'erin'); assert.equal((await notes(e)).length, ne + 1);
    });

    test('notification switches really switch things off (the plural-key bug), per-conversation mute, and quiet hours', async () => {
      const f = await t.member('f@example.com', { handle: 'fay', name: 'Fay' }); await t.call('POST', '/api/members/alice/follow', { token: f.token });
      const cid = (await msg(a, 'fay', 'one')).json.conversationId; let n = (await notes(f)).length;
      await set(f, {}, { messages: false }); await t.call('POST', `/api/conversations/${cid}/messages`, { token: a.token, body: { body: 'two' } }); assert.equal((await notes(f)).length, n, 'Messages switch is off');
      await set(f, {}, { messages: true }); await t.call('POST', `/api/conversations/${cid}/mute`, { token: f.token, body: { muted: true } });
      await t.call('POST', `/api/conversations/${cid}/messages`, { token: a.token, body: { body: 'three' } }); assert.equal((await notes(f)).length, n, 'muted conversation is quiet');
      assert.equal((await t.call('GET', `/api/conversations/${cid}`, { token: f.token })).json.conversation.muted, true);
      await t.call('POST', `/api/conversations/${cid}/mute`, { token: f.token, body: { muted: false } });
      await set(f, { quietEnabled: true, quietStart: '00:00', quietEnd: '23:59', quietOffset: 0 }); await t.call('POST', `/api/conversations/${cid}/messages`, { token: a.token, body: { body: 'four' } }); assert.equal((await notes(f)).length, n, 'quiet hours hold it back');
      assert.equal((await t.call('GET', '/api/conversations', { token: f.token })).json.unreadTotal >= 3, true, 'the messages still wait in the Inbox');
      await set(f, { quietEnabled: false }); await t.call('POST', `/api/conversations/${cid}/messages`, { token: a.token, body: { body: 'five' } }); assert.equal((await notes(f)).length, n + 1);
    });

    test('expiry: new messages get an end time and vanish after it; earlier ones are untouched', async () => {
      const g = await t.member('g@example.com', { handle: 'gus', name: 'Gus' }); await t.call('POST', '/api/members/alice/follow', { token: g.token });
      const cid = (await msg(a, 'gus', 'no expiry')).json.conversationId; t.clock.advance(1000); await set(a, { defaultExpiry: '24h' });
      await t.call('POST', `/api/conversations/${cid}/messages`, { token: a.token, body: { body: 'disappears' } });
      let items = (await t.call('GET', `/api/conversations/${cid}/messages`, { token: g.token })).json.items; assert.equal(items.length, 2); assert.equal(items[0].expiresAt, null); assert.ok(items[1].expiresAt);
      t.clock.advance(25 * 3600_000);
      items = (await t.call('GET', `/api/conversations/${cid}/messages`, { token: g.token })).json.items; assert.deepEqual(items.map((m: any) => m.body), ['no expiry']);
      await set(a, { defaultExpiry: 'never' });
    });

    test('replies and reactions are the author’s choice, and replies carry what they quote', async () => {
      const h = await t.member('h@example.com', { handle: 'hana', name: 'Hana' }); await t.call('POST', '/api/members/alice/follow', { token: h.token });
      const cid = (await msg(a, 'hana', 'original')).json.conversationId; t.clock.advance(1000); let items = (await t.call('GET', `/api/conversations/${cid}/messages`, { token: h.token })).json.items; const mid = items[0].id;
      assert.equal((await t.call('POST', `/api/conversations/${cid}/messages`, { token: h.token, body: { body: 'answer', replyTo: mid } })).status, 201); t.clock.advance(1000);
      assert.equal((await t.call('PUT', `/api/messages/${mid}/reaction`, { token: h.token, body: { emoji: 'heart' } })).status, 200);
      items = (await t.call('GET', `/api/conversations/${cid}/messages`, { token: a.token })).json.items;
      assert.equal(items[1].replyTo.preview, 'original'); assert.deepEqual(items[0].reactions, [{ emoji: 'heart', count: 1, mine: false }]);
      assert.equal((await t.call('PUT', `/api/messages/${mid}/reaction`, { token: h.token, body: { emoji: 'party' } })).status, 400);
      await set(a, { allowReactions: false, allowReplies: false });
      assert.equal((await t.call('PUT', `/api/messages/${mid}/reaction`, { token: h.token, body: { emoji: 'like' } })).status, 409);
      assert.equal((await t.call('POST', `/api/conversations/${cid}/messages`, { token: h.token, body: { body: 'again', replyTo: mid } })).status, 409);
      assert.equal((await t.call('PUT', `/api/messages/${mid}/reaction`, { token: h.token, body: { emoji: null } })).status, 200, 'taking your own reaction back is always allowed');
    });
  });
}
