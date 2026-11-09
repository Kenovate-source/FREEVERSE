import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { buildMap, universeEdges, universeImpact, relationMatrix, KINDS } from '../src/lib/ecosystem';
import { UNIVERSES } from '../shared/universes';
import { FINDING_GUIDE } from '../src/pages/founder-agents';
import { NEXT } from '../src/pages/founder-governance';

const areas = ['citizens', 'communities', 'universes', 'safety', 'governance', 'ai', 'suggestions'].map((id) => ({ id, label: id, value: '3', level: 'calm' as const }));
const unis = UNIVERSES.map((u) => ({ id: u.id, name: u.name, status: u.status }));
const plat = (posts: number, comments = 0) => [{ key: 'posts_7d', value: posts }, { key: 'comments_7d', value: comments }];

describe('ecosystem model (pure)', () => {
  test('universe links come from each Universe’s own related list, one per pair, mutual when both point', () => {
    const m = buildMap(areas, unis, plat(0));
    const uni = m.links.filter((l) => l.kind === 'universe'); const pairs = uni.map((l) => [l.from, l.to].sort().join('|'));
    assert.equal(new Set(pairs).size, pairs.length, 'no duplicate pairs');
    for (const e of universeEdges()) assert.ok(pairs.includes([e.from, e.to].sort().join('|')), `${e.from}→${e.to} present`);
    for (const l of uni) assert.equal(l.both, universeEdges().some((e) => e.from === l.to && e.to === l.from));
  });
  test('citizen particles follow real counts and are zero with no activity', () => {
    assert.equal(buildMap(areas, unis, plat(0)).citizenParticles, 0);
    assert.equal(buildMap(areas, unis, plat(5)).citizenParticles, 1);
    assert.equal(buildMap(areas, unis, plat(20, 5)).citizenParticles, 2);
    assert.equal(buildMap(areas, unis, plat(60)).citizenParticles, 3);
    const quiet = buildMap(areas, unis, plat(0)).links.filter((l) => l.kind === 'citizen'); assert.ok(quiet.every((l) => l.particles === 0));
  });
  test('a link is active only when both ends are; unavailable Universes are inactive', () => {
    const off = unis.map((u, i) => (i === 0 ? { ...u, status: 'concept' } : u)); const m = buildMap(areas, off, plat(10));
    const n0 = m.nodes.find((n) => n.id === off[0]!.id)!; assert.equal(n0.active, false);
    for (const l of m.links.filter((x) => x.from === n0.id || x.to === n0.id)) assert.equal(l.active, false);
  });
  test('impact and matrix agree, and every kind has a plain explanation', () => {
    const id = UNIVERSES[1]!.id; const im = universeImpact(id); const row = relationMatrix(unis).find((r) => r.id === id)!;
    assert.deepEqual(row.cells.filter((c) => c.on).map((c) => c.id).sort(), im.pointsTo.map((x) => x.id).sort());
    for (const k of KINDS) assert.ok(k.means.length > 20);
  });
  test('only citizen links claim to be measured', () => { assert.deepEqual(KINDS.filter((k) => k.measured).map((k) => k.id), ['citizen']); });
  test('every finding type the analyser can produce has guidance with alternatives and an impact', () => {
    for (const k of Object.keys(NEXT)) { const g = FINDING_GUIDE[k]; assert.ok(g, `guidance for ${k}`); assert.ok(g!.alternatives.length >= 1 && g!.impact.length > 10); }
  });
});

for (const dialect of DIALECTS) {
  describe(`founder overview journey and finding audit [${dialect}]`, () => {
    let t: TestApp; let founder: { token: string; userId: string }; let m: { token: string; userId: string };
    before(async () => { t = await startTestApp(dialect, {}); m = await t.member('m@example.com', { handle: 'mem', name: 'Mem' }); founder = await t.member('f@example.com', { handle: 'fnd', name: 'Fnd' }); await t.grantRole(founder.userId, 'founder'); });
    after(async () => { await t.close(); });
    test('the overview carries a journey of real counts that never grows down the funnel', async () => {
      const r = await t.call('GET', '/api/founder/overview', { token: founder.token }); assert.equal(r.status, 200);
      const j = r.json.journey as { key: string; value: number }[]; assert.deepEqual(j.map((x) => x.key), ['created', 'eligible', 'joined', 'posted']);
      assert.ok(j[0]!.value >= 2); assert.ok(j[1]!.value <= j[0]!.value); assert.ok(j[2]!.value <= j[1]!.value && j[3]!.value <= j[1]!.value);
    });
    test('reviewing a finding is recorded in the audit log, and members cannot', async () => {
      await t.call('POST', '/api/founder-ai/analyze', { token: founder.token });
      const f = (await t.call('GET', '/api/founder-ai/findings', { token: founder.token })).json.items[0]; assert.ok(f);
      assert.equal((await t.call('POST', `/api/founder-ai/findings/${f.id}/acknowledge`, { token: m.token, body: {} })).status, 403);
      assert.equal((await t.call('POST', `/api/founder-ai/findings/${f.id}/acknowledge`, { token: founder.token, body: {} })).status, 200);
      const a = (await t.call('GET', '/api/founder/audit?action=founder_ai.finding', { token: founder.token })).json.items;
      assert.ok(a.some((x: any) => x.action === 'founder_ai.finding_acknowledge' && x.outcome === 'success'));
      assert.equal((await t.call('GET', '/api/founder-ai/findings?status=acknowledged', { token: founder.token })).json.items.length, 1);
    });
    test('a finding can become a proposal that still waits for approval (modify path)', async () => {
      const f = (await t.call('GET', '/api/founder-ai/findings', { token: founder.token })).json.items[0]; assert.ok(f);
      const r = await t.call('POST', '/api/founder-ai/proposals', { token: founder.token, body: { actionType: 'founder.notify', payload: { text: 'Check this finding' }, title: 'Follow up this finding', rationale: 'From finding', findingId: f.id } });
      assert.equal(r.status, 201, JSON.stringify(r.json)); const w = (await t.call('GET', '/api/founder-ai/work?filter=active', { token: founder.token })).json.items.find((x: any) => x.title === 'Follow up this finding');
      assert.equal(w.status, 'pending_approval');
    });
  });
}
