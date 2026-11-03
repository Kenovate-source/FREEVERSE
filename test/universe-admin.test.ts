import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';

type U = { token: string; userId: string };
for (const dialect of DIALECTS) {
  describe(`Universe admin: preview, history, targeted rollback [${dialect}]`, () => {
    let t: TestApp; let founder: U, a: U;
    before(async () => {
      t = await startTestApp(dialect, {});
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' });
      founder = await t.member('founder@example.com', { handle: 'fnd', name: 'Fnd' }); await t.grantRole(founder.userId, 'founder');
    });
    after(async () => { await t.close(); });
    const stepUp = async () => (await t.call('POST', '/api/me/step-up', { token: founder.token, body: { secret: 'founder@example.com' } })).json.token as string;
    const setStatus = async (universeId: string, status: string, note = '') => t.call('POST', '/api/proposals/direct', { token: founder.token, headers: { 'x-step-up': await stepUp() }, body: { actionType: 'universe.set_status', payload: { universeId, status, note }, title: `Set ${universeId} to ${status}` } });
    const rollback = async (id: string) => t.call('POST', `/api/proposals/${id}/rollback`, { token: founder.token, headers: { 'x-step-up': await stepUp() } });
    const memberView = async (id: string) => (await t.call('GET', '/api/universes', { token: a.token })).json.items.find((u: any) => u.id === id);
    const preview = (tok: string, body: unknown) => t.call('POST', '/api/founder/universes/preview', { token: tok, body });
    const history = async (id: string) => (await t.call('GET', `/api/founder/universes/${id}/history`, { token: founder.token })).json.items;

    test('preview is staff-only, saves nothing, and equals what members then actually get', async () => {
      assert.equal((await preview(a.token, { universeId: 'freeplay', status: 'concept', note: '' })).status, 403);
      const before = await memberView('freeplay');
      const p = await preview(founder.token, { universeId: 'freeplay', status: 'concept', note: 'Rethinking this one' });
      assert.equal(p.status, 200); assert.equal(p.json.saved, false);
      assert.deepEqual(await memberView('freeplay'), before, 'previewing changed nothing');
      assert.ok(p.json.changes.length >= 1);
      assert.equal((await preview(founder.token, { universeId: 'nope', status: 'concept' })).status, 404);
      assert.equal((await preview(founder.token, { universeId: 'freeplay', status: 'bogus' })).status, 400);
      assert.equal((await setStatus('freeplay', 'concept', 'Rethinking this one')).status, 201);
      const live = await memberView('freeplay');
      const { interested: _i, interestedCount: _c, ...liveRest } = live; const { interested: _i2, interestedCount: _c2, ...prevRest } = p.json.after;
      assert.deepEqual(liveRest, prevRest, 'the preview was exactly the member view');
    });
    test('history lists changes for that Universe only, and rollback restores only that Universe', async () => {
      const mBefore = await memberView('freemarket');
      const r1 = await setStatus('freemarket', 'under_review', 'Payments first'); assert.equal(r1.status, 201);
      const r2 = await setStatus('freebuild', 'concept', 'Scope review'); assert.equal(r2.status, 201);
      const hm = await history('freemarket'); assert.equal(hm.length, 1); assert.equal(hm[0].status, 'under_review'); assert.equal(hm[0].canRollback, true);
      assert.ok(!hm.some((x: any) => x.status === 'concept' && x.note === 'Scope review'), 'other Universes do not leak into this history');
      // Rolling back freemarket must NOT undo the later freebuild change (the old whole-map rollback did).
      assert.equal((await rollback(r1.json.proposal.id)).status, 200);
      assert.equal((await memberView('freemarket')).status, mBefore.status, 'freemarket restored');
      assert.equal((await memberView('freebuild')).status, 'concept', 'freebuild left alone');
      assert.equal((await history('freemarket'))[0].rolledBack, true);
    });
    test('an older change cannot be rolled back over a newer one for the same Universe', async () => {
      const first = await setStatus('freeresearch', 'under_review', 'v1'); const second = await setStatus('freeresearch', 'concept', 'v2');
      assert.equal(first.status, 201); assert.equal(second.status, 201);
      const h = await history('freeresearch'); assert.equal(h.find((x: any) => x.note === 'v1').canRollback, false); assert.equal(h.find((x: any) => x.note === 'v2').canRollback, true);
      const bad = await rollback(first.json.proposal.id); assert.equal(bad.status, 409, JSON.stringify(bad.json));
      assert.equal((await memberView('freeresearch')).status, 'concept', 'unchanged by the refused rollback');
      assert.equal((await rollback(second.json.proposal.id)).status, 200);
      assert.equal((await memberView('freeresearch')).status, 'under_review', 'back to v1');
      assert.equal((await rollback(first.json.proposal.id)).status, 200, 'now the older one can go');
    });
  });
}
