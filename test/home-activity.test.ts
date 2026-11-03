import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';

for (const dialect of DIALECTS) {
  describe(`home "Right now": counts from your own activity, never message text [${dialect}]`, () => {
    let t: TestApp; let a: { token: string; userId: string }, b: typeof a;
    before(async () => { t = await startTestApp(dialect, {}); a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' }); });
    after(async () => { await t.close(); });
    const home = async (tok: string) => (await t.call('GET', '/api/home', { token: tok })).json;

    test('a fresh member has nothing waiting', async () => {
      const h = await home(a.token); assert.deepEqual([h.activity.unreadConversations, h.activity.messageRequests, h.activity.earnedTotal], [0, 0, 0]);
    });
    test('an incoming message shows as a count for the recipient only, and its text never appears', async () => {
      const secret = 'the-secret-phrase-7731';
      const r = await t.call('POST', '/api/conversations', { token: b.token, body: { handle: 'alice', body: secret } }); assert.ok(r.status < 300, JSON.stringify(r.json));
      const h = await home(a.token); assert.equal(h.activity.unreadConversations + h.activity.messageRequests, 1, 'one conversation waiting (request or unread)');
      assert.ok(!JSON.stringify(h).includes(secret), 'no message text on Home');
      const hb = await home(b.token); assert.equal(hb.activity.unreadConversations, 0, 'the sender has nothing unread from their own message');
    });
    test('notifications are counted and clear when read', async () => {
      const before = (await home(a.token)).activity.unreadNotifications;
      await t.call('POST', '/api/notifications/read', { token: a.token, body: {} });
      assert.equal((await home(a.token)).activity.unreadNotifications, 0); assert.ok(before >= 0);
    });
    test('earned achievements are listed from platform records once a rule is met', async () => {
      assert.equal((await t.call('POST', '/api/identities', { token: a.token, body: { archetype: 'creator' } })).status, 201);
      assert.equal((await home(a.token)).activity.earnedTotal, 0, 'nothing earned yet');
      assert.equal((await t.call('POST', '/api/me/entries', { token: a.token, body: { kind: 'showcase', title: 'My first showcase piece' } })).status, 201);
      const h = await home(a.token); assert.equal(h.activity.earnedTotal, 1); assert.deepEqual(h.activity.earned.map((x: any) => x.label), ['On display']);
      assert.equal((await t.call('GET', '/api/me/achievements', { token: a.token })).json.items.filter((x: any) => x.earned).length, 1, 'agrees with the achievements list');
    });
  });
}
