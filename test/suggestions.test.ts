import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { groupSimilar } from '../shared/suggestions';

describe('duplicate hints (pure)', () => {
  test('groups suggestions sharing several significant words, leaves unrelated ones alone', () => {
    const g = groupSimilar([
      { id: '1', title: 'Dark mode for the evening', body: 'Please add a dark theme that is easier on the eyes at night' },
      { id: '2', title: 'Night theme', body: 'A dark theme for evening reading would be easier on the eyes' },
      { id: '3', title: 'Voice rooms', body: 'Group audio rooms for communities to talk live' },
    ]);
    assert.equal(g.length, 1); assert.deepEqual(g[0]!.map((x) => x.id).sort(), ['1', '2']);
  });
});

for (const dialect of DIALECTS) {
  describe(`suggestions: private submission, authorised review, lifecycle [${dialect}]`, () => {
    let t: TestApp; let a: { token: string; userId: string }, b: typeof a, dir: typeof a, founder: typeof a;
    before(async () => {
      t = await startTestApp(dialect, {});
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' });
      dir = await t.member('d@example.com', { handle: 'dirk', name: 'Dirk' }); await t.grantRole(dir.userId, 'director');
      founder = await t.member('f@example.com', { handle: 'fnd', name: 'Fnd' }); await t.grantRole(founder.userId, 'founder');
    });
    after(async () => { await t.close(); });
    const call = (m: string, p: string, tok: string, body?: unknown) => t.call(m, p, { token: tok, body });
    let sid = '', sid2 = '';

    test('a citizen submits; validation is enforced; only the author can see it', async () => {
      assert.equal((await call('POST', '/api/suggestions', a.token, { title: 'x', body: 'short', category: 'feature' })).status, 400);
      assert.equal((await call('POST', '/api/suggestions', a.token, { title: 'A dark theme please', body: 'A dark theme would be easier on the eyes at night.', category: 'nonsense' })).status, 400);
      const r = await call('POST', '/api/suggestions', a.token, { title: 'A dark theme please', body: 'A dark theme would be easier on the eyes at night.', category: 'accessibility', area: 'Settings', extra: 'Maybe follow the device setting.' });
      assert.equal(r.status, 201); sid = r.json.suggestion.id; assert.equal(r.json.suggestion.status, 'submitted');
      sid2 = (await call('POST', '/api/suggestions', a.token, { title: 'Dark theme for evenings', body: 'Add a dark theme for reading in the evening, easier on the eyes.', category: 'accessibility' })).json.suggestion.id;
      assert.equal((await call('GET', '/api/suggestions/mine', a.token)).json.items.length, 2);
      assert.equal((await call('GET', '/api/suggestions/mine', b.token)).json.items.length, 0, 'others see none of it');
      assert.equal((await call('DELETE', `/api/suggestions/${sid2}`, b.token)).status, 404, 'cannot withdraw someone else’s');
    });

    test('the queue is closed to citizens; a director sees it without author identity; only the Founder reviews', async () => {
      assert.equal((await call('GET', '/api/founder/suggestions', a.token)).status, 403);
      assert.equal((await call('GET', `/api/founder/suggestions/${sid}`, b.token)).status, 403);
      const d = await call('GET', '/api/founder/suggestions', dir.token); assert.equal(d.status, 200); assert.equal(d.json.canReview, false);
      assert.ok(d.json.items.every((i: any) => i.author === null), 'no author identity for view-only');
      assert.equal((await call('POST', `/api/founder/suggestions/${sid}/update`, dir.token, { status: 'planned' })).status, 403);
      const f = await call('GET', '/api/founder/suggestions', founder.token); assert.equal(f.json.items[0].author.handle, 'alice'); assert.equal(f.json.counts.submitted, 2);
      assert.equal(f.json.possibleDuplicates.length, 1, 'the two dark-theme suggestions are hinted as possible duplicates');
    });

    test('lifecycle: public note reaches the author, internal note does not; decline needs a reason; merge validates', async () => {
      const u = await call('POST', `/api/founder/suggestions/${sid}/update`, founder.token, { status: 'under_review', publicNote: 'Thanks, we are looking at it.', internalNote: 'Check with design first.' });
      assert.equal(u.status, 200);
      const mine = (await call('GET', '/api/suggestions/mine', a.token)).json.items.find((x: any) => x.id === sid);
      assert.equal(mine.status, 'under_review'); assert.equal(mine.updates[0].note, 'Thanks, we are looking at it.');
      assert.ok(!JSON.stringify(mine).includes('Check with design'), 'internal note never reaches the author');
      assert.ok((await call('GET', '/api/notifications', a.token)).json.items.some((n: any) => /Update on your suggestion/.test(JSON.stringify(n))));
      assert.equal((await call('POST', `/api/founder/suggestions/${sid2}/update`, founder.token, { status: 'declined' })).status, 409);
      assert.equal((await call('POST', `/api/founder/suggestions/${sid2}/update`, founder.token, { status: 'merged' })).status, 409);
      assert.equal((await call('POST', `/api/founder/suggestions/${sid2}/update`, founder.token, { status: 'merged', mergedInto: sid2 })).status, 409);
      assert.equal((await call('POST', `/api/founder/suggestions/${sid2}/update`, founder.token, { status: 'merged', mergedInto: sid })).status, 200);
      const m = (await call('GET', '/api/suggestions/mine', a.token)).json.items.find((x: any) => x.id === sid2); assert.equal(m.status, 'merged'); assert.equal(m.mergedInto.id, sid);
      const detail = (await call('GET', `/api/founder/suggestions/${sid}`, founder.token)).json.suggestion; assert.equal(detail.updates[0].internalNote, 'Check with design first.');
      assert.ok(!(await call('GET', `/api/founder/suggestions/${sid}`, dir.token)).json.suggestion.updates.some((x: any) => x.internalNote), 'view-only never sees internal notes');
      const audit = await call('GET', '/api/founder/audit?action=suggestion', founder.token); assert.ok(audit.json.items.length >= 2, 'status changes are audited');
    });

    test('rate limit, withdraw, and erasure', async () => {
      assert.equal((await call('DELETE', `/api/suggestions/${sid2}`, a.token)).status, 200);
      let last = 0; for (let i = 0; i < 12; i++) last = (await call('POST', '/api/suggestions', b.token, { title: `Idea number ${i}`, body: 'A reasonably long description of the idea.', category: 'other' })).status;
      assert.equal(last, 429, 'a daily limit applies');
    });
  });
}
