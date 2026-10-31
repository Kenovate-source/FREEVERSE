import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';

// Block and mute are enforced by the server, not just hidden in the interface. These tests call the API directly.
for (const dialect of DIALECTS) {
  describe(`block and mute are server-enforced [${dialect}]`, () => {
    let t: TestApp; let a: { token: string }, b: { token: string }, c: { token: string };
    before(async () => { t = await startTestApp(dialect); a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' }); c = await t.member('c@example.com', { handle: 'carol', name: 'Carol' }); });
    after(async () => { await t.close(); });

    test('members can be found by search, and a block has consequences a client cannot bypass', async () => {
      const found = await t.call('GET', '/api/members?q=bob', { token: a.token });
      assert.ok(found.json.items.some((x: any) => x.person.handle === 'bob'));
      // before blocking: bob can message alice
      assert.ok((await t.call('POST', '/api/conversations', { token: b.token, body: { handle: 'alice', body: 'hi alice' } })).status < 300);
      assert.ok((await t.call('POST', '/api/blocks/bob', { token: a.token })).status < 300);
      // blocked members vanish from search both ways
      assert.ok(!(await t.call('GET', '/api/members?q=bob', { token: a.token })).json.items.some((x: any) => x.person.handle === 'bob'));
      assert.ok(!(await t.call('GET', '/api/members?q=alice', { token: b.token })).json.items.some((x: any) => x.person.handle === 'alice'));
      // direct API calls are refused
      assert.equal((await t.call('POST', '/api/conversations', { token: b.token, body: { handle: 'alice', body: 'still there?' } })).status, 403);
      assert.equal((await t.call('POST', '/api/conversations', { token: a.token, body: { handle: 'bob', body: 'hello' } })).status, 403);
      assert.ok((await t.call('POST', '/api/members/alice/follow', { token: b.token })).status >= 400);
      // the list, then unblock
      assert.equal((await t.call('GET', '/api/blocks', { token: a.token })).json.items.length, 1);
      assert.ok((await t.call('DELETE', '/api/blocks/bob', { token: a.token })).status < 300);
      assert.equal((await t.call('GET', '/api/blocks', { token: a.token })).json.items.length, 0);
      { const r = await t.call('POST', '/api/conversations', { token: b.token, body: { handle: 'alice', body: 'back again' } }); assert.notEqual(r.json?.error?.code, 'cannot_message', 'unblocked: no longer refused as blocked'); }
    });

    test('mute is different: posts are hidden from the muter only, and messaging still works', async () => {
      await t.call('POST', '/api/posts', { token: c.token, body: { kind: 'text', body: 'carol-visible-post zebra', visibility: 'members' } });
      const seen = async (tok: string) => JSON.stringify((await t.call('GET', '/api/feed?sort=recent', { token: tok })).json).includes('carol-visible-post');
      assert.equal(await seen(a.token), true);
      assert.ok((await t.call('POST', '/api/mutes/carol', { token: a.token })).status < 300);
      assert.equal(await seen(a.token), false, 'muted author hidden from the muter');
      assert.equal(await seen(b.token), true, 'other members still see the post');
      assert.ok((await t.call('POST', '/api/conversations', { token: c.token, body: { handle: 'alice', body: 'can still message' } })).status < 300, 'mute does not block messages');
      assert.equal((await t.call('GET', '/api/mutes', { token: a.token })).json.items.length, 1);
      assert.equal((await t.call('POST', '/api/mutes/alice', { token: a.token })).status, 400, 'cannot mute yourself');
      assert.ok((await t.call('DELETE', '/api/mutes/carol', { token: a.token })).status < 300);
      assert.equal(await seen(a.token), true);
    });
  });
}

// Handle availability (used live by the onboarding step).
describe('handle availability', () => {
  let t: TestApp; let a: { token: string };
  before(async () => { t = await startTestApp('sqlite'); a = await t.member('h1@example.com', { handle: 'taken_one', name: 'H One' }); await t.member('h2@example.com', { handle: 'other_two', name: 'H Two' }); });
  after(async () => { await t.close(); });
  test('reports available, taken, own, invalid and reserved handles, and needs sign-in', async () => {
    const q = (h: string, tok = a.token) => t.call('GET', `/api/handles/check?handle=${encodeURIComponent(h)}`, { token: tok });
    assert.equal((await q('fresh_name')).json.available, true);
    assert.equal((await q('other_two')).json.available, false);
    assert.equal((await q('taken_one')).json.available, true, 'own handle counts as available');
    assert.equal((await q('x')).json.available, false); assert.equal((await q('admin')).json.available, false);
    assert.equal((await t.call('GET', '/api/handles/check?handle=abc')).status, 401);
  });
  test('abusive custom labels, headlines and names are refused by the server (and told why); ordinary ones are kept', async () => {
    const put = (label: string) => t.call('PUT', '/api/personalization', { token: a.token, body: { kind: 'interest', items: [{ label, isCustom: true }] } });
    const bad = await put('n1gger'); assert.equal(bad.status, 400); assert.equal(bad.json.error.code, 'label_not_allowed');
    assert.equal((await put('Urban beekeeping')).status, 200);
    assert.equal((await t.call('PATCH', '/api/profile', { token: a.token, body: { headline: 'f4ggot' } })).status, 400);
    assert.equal((await t.call('PATCH', '/api/profile', { token: a.token, body: { headline: 'Beekeeper and carer' } })).status, 200);
  });
});
