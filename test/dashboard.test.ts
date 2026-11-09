import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { ARCHETYPE_DEFS } from '../shared/archetypes';

for (const dialect of DIALECTS) {
  describe(`dashboard data: ecosystem map and recommendations are real [${dialect}]`, () => {
    let t: TestApp; let a: { token: string; userId: string };
    before(async () => { t = await startTestApp(dialect, { SEED_DEMO_DATA: '1' }); a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); });
    after(async () => { await t.close(); });
    const home = async () => (await t.call('GET', '/api/home', { token: a.token })).json;

    test('no identity means an empty map, never invented Universes', async () => { assert.deepEqual((await home()).ecosystem.universes, []); });
    test('the map is exactly the Universes the chosen identities are defined to connect to', async () => {
      for (const archetype of ['student', 'creator']) { const r = await t.call('POST', '/api/identities', { token: a.token, body: { archetype, answers: {} } }); assert.ok(r.status < 300, JSON.stringify(r.json)); }
      const h = await home(); const got = h.ecosystem.universes.map((u: any) => u.id).sort();
      const want = [...new Set([...ARCHETYPE_DEFS.student.universes, ...ARCHETYPE_DEFS.creator.universes])].sort();
      assert.deepEqual(got, want);
      for (const u of h.ecosystem.universes) { assert.ok(u.via.length >= 1); assert.ok(u.route.startsWith('/universes/')); }
      const learn = h.ecosystem.universes.find((u: any) => u.id === 'freelearn'); assert.deepEqual([...learn.via].sort(), ['creator', 'student']);
    });
    test('recommendations exclude what the person has already started', async () => {
      const before = (await home()).recommended.learn; assert.ok(before.length > 0, 'catalogue has items');
      const slug = String(before[0].href).split('/').pop();
      const r = await t.call('PUT', `/api/learn/${slug}/progress`, { token: a.token, body: { percent: 10 } }); assert.ok(r.status < 300, JSON.stringify(r.json));
      assert.ok(!(await home()).recommended.learn.some((x: any) => String(x.href).endsWith(`/${slug}`)), 'started item no longer recommended');
    });
    test('sample catalogue items are labelled as samples', async () => { for (const x of (await home()).recommended.learn) assert.equal(typeof x.demo, 'boolean'); });
  });
}
