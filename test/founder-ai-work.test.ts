import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { lifecycleOf, type LifecycleInput } from '../shared/proposal-lifecycle';

const base: LifecycleInput = { status: 'pending_approval', kind: 'change', source: 'founder-ai', createdAt: '2026-01-01T00:00:00Z', rationale: 'Because', hasImpact: true };
const by = (i: Partial<LifecycleInput>) => Object.fromEntries(lifecycleOf({ ...base, ...i }).map((s) => [s.key, s]));

describe('proposal lifecycle (pure)', () => {
  test('waiting for a decision: ask/plan/propose done, decide is current, nothing later is claimed done', () => {
    const s = by({});
    assert.deepEqual([s.ask!.state, s.plan!.state, s.propose!.state, s.decide!.state, s.execute!.state, s.complete!.state], ['done', 'done', 'done', 'current', 'waiting', 'waiting']);
  });
  test('executed with a recorded after-check completes; without one, complete stays current', () => {
    const ok = by({ status: 'executed', decidedAt: 'x', executedAt: 'y', verification: { ok: true } });
    assert.equal(ok.execute!.state, 'done'); assert.equal(ok.complete!.state, 'done');
    assert.equal(by({ status: 'executed', executedAt: 'y' }).complete!.state, 'current');
  });
  test('rejected stops the line; later stages are skipped, not done', () => {
    const s = by({ status: 'rejected', decisionNote: 'no' });
    assert.equal(s.decide!.state, 'stopped'); assert.equal(s.execute!.state, 'skipped'); assert.equal(s.complete!.state, 'skipped');
  });
  test('a failed run is shown as failed, never complete', () => {
    const s = by({ status: 'failed', decidedAt: 'x' });
    assert.equal(s.execute!.state, 'failed'); assert.equal(s.complete!.state, 'failed');
  });
  test('auto-executed work says it ran inside the rules; recommendations are never executed', () => {
    assert.equal(by({ status: 'executed', autoExecuted: true, executedAt: 'y', verification: {} }).decide!.state, 'skipped');
    const r = by({ kind: 'recommendation', status: 'pending_approval' });
    assert.equal(r.execute!.state, 'skipped'); assert.equal(r.decide!.state, 'current');
  });
  test('missing reasoning is shown as waiting rather than done', () => {
    assert.equal(by({ rationale: '', hasImpact: false }).plan!.state, 'waiting');
  });
});

for (const dialect of DIALECTS) {
  describe(`founder AI work endpoint [${dialect}]`, () => {
    let t: TestApp; let m: { token: string; userId: string }, dir: typeof m, founder: typeof m;
    before(async () => {
      t = await startTestApp(dialect, {});
      m = await t.member('m@example.com', { handle: 'mem', name: 'Mem' });
      dir = await t.member('d@example.com', { handle: 'dirk', name: 'Dirk' }); await t.grantRole(dir.userId, 'director');
      founder = await t.member('f@example.com', { handle: 'fnd', name: 'Fnd' }); await t.grantRole(founder.userId, 'founder');
    });
    after(async () => { await t.close(); });
    const call = (me: string, method: string, p: string, body?: unknown) => t.call(method, p, { token: me, body });

    test('members cannot read it; the Founder can', async () => {
      assert.equal((await call(m.token, 'GET', '/api/founder-ai/work')).status, 403);
      assert.equal((await call(founder.token, 'GET', '/api/founder-ai/work')).status, 200);
    });
    test('a prepared proposal appears in progress with Decide as the current stage, then moves to finished once decided', async () => {
      const r = await call(founder.token, 'POST', '/api/founder-ai/proposals', { actionType: 'founder.notify', payload: { text: 'Check the new reports' }, title: 'Notify me about reports', rationale: 'Quiet week' });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      const act = (await call(founder.token, 'GET', '/api/founder-ai/work?filter=active')).json.items;
      const w = act.find((x: any) => x.title === 'Notify me about reports'); assert.ok(w, 'listed as in progress');
      const cur = w.stages.find((s: any) => s.state === 'current'); assert.ok(cur);
      assert.equal(w.status, 'pending_approval', 'default mode is approval_required, so it must wait');
      assert.equal(cur.key, 'decide');
      const fin = (await call(founder.token, 'GET', '/api/founder-ai/work?filter=finished')).json.items;
      assert.ok(!fin.some((x: any) => x.id === w.id));
      const d = await call(founder.token, 'POST', `/api/proposals/${w.id}/decision`, { decision: 'reject', note: 'Not needed' });
      assert.equal(d.status, 200, JSON.stringify(d.json));
      const done = (await call(founder.token, 'GET', '/api/founder-ai/work?filter=finished')).json.items.find((x: any) => x.id === w.id);
      assert.ok(done, 'now finished');
      assert.equal(done.stages.find((s: any) => s.key === 'decide').state, 'stopped');
      assert.equal(done.stages.find((s: any) => s.key === 'execute').state, 'skipped');
    });
  });
}
