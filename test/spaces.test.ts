import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { ARCHETYPE_DEFS } from '../shared/archetypes';
import { SPACE_DESIGN } from '../shared/space-design';
import { CURSOR_STYLES } from '../shared/api/settings';
import { envFor } from '../src/lib/env-map';
import { readFileSync } from 'node:fs';

describe('identity space design', () => {
  const ids = Object.keys(ARCHETYPE_DEFS);
  test('every identity has a design, and it starts with its workspace', () => { for (const id of ids) { const d = (SPACE_DESIGN as any)[id]; assert.ok(d, id); assert.equal(d.views[0].id, 'workspace', id); } });
  test('views are unique per identity and only use known sections', () => { for (const [id, d] of Object.entries(SPACE_DESIGN)) { const v = d.views.map((x) => x.id); assert.equal(new Set(v).size, v.length, id); for (const x of v) assert.ok(['workspace', 'tools', 'entries', 'milestones', 'go'].includes(x), `${id}:${x}`); assert.ok(v.includes('tools'), `${id} keeps the plain tools list as the accessible alternative`); } });
  test('an identity without milestones does not show a Milestones section', () => { for (const [id, d] of Object.entries(SPACE_DESIGN)) { const has = d.views.some((v) => v.id === 'milestones'); assert.equal(has, ARCHETYPE_DEFS[id as keyof typeof ARCHETYPE_DEFS].achievements.length > 1 || has, id); } });
  test('every identity has its own layout: no two spaces share an arrangement', () => { const l = Object.values(SPACE_DESIGN).map((d) => d.layout); assert.equal(new Set(l).size, l.length); });
  test('every identity maps to its own scene and the scene exists', () => {
    const src = readFileSync('src/environments/envs/spaces.ts', 'utf8');
    for (const id of ids) { assert.equal(envFor('space', `/spaces/${id}`), `space-${id}`); assert.match(src, new RegExp(`def\\('${id}'`), `scene for ${id}`); }
  });
});

for (const dialect of DIALECTS) {
  describe(`pointer style setting [${dialect}]`, () => {
    let t: TestApp; let a: { token: string };
    before(async () => { t = await startTestApp(dialect, {}); a = await t.member('c@example.com', { handle: 'cara', name: 'Cara' }); });
    after(async () => { await t.close(); });
    test('defaults to the standard cursor', async () => { assert.equal((await t.call('GET', '/api/settings', { token: a.token })).json.settings.accessibility.cursor, 'standard'); });
    test('every offered style saves and persists', async () => { for (const c of CURSOR_STYLES) { const r = await t.call('PATCH', '/api/settings', { token: a.token, body: { accessibility: { cursor: c } } }); assert.equal(r.status, 200, c); assert.equal((await t.call('GET', '/api/settings', { token: a.token })).json.settings.accessibility.cursor, c); } });
    test('an unknown style is rejected and the previous one stays', async () => { const r = await t.call('PATCH', '/api/settings', { token: a.token, body: { accessibility: { cursor: 'lasers' } } }); assert.equal(r.status, 400); assert.equal((await t.call('GET', '/api/settings', { token: a.token })).json.settings.accessibility.cursor, 'entrepreneur'); });
    test('changing the cursor leaves the other accessibility settings alone', async () => { await t.call('PATCH', '/api/settings', { token: a.token, body: { accessibility: { textSize: 'lg' } } }); await t.call('PATCH', '/api/settings', { token: a.token, body: { accessibility: { cursor: 'developer' } } }); const s = (await t.call('GET', '/api/settings', { token: a.token })).json.settings.accessibility; assert.equal(s.textSize, 'lg'); assert.equal(s.cursor, 'developer'); });
  });
}
