import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { LABEL_CATALOG, LABEL_CATEGORIES, screenIdentityClaim } from '../shared/identity-labels';

describe('identity label catalogue and claim screen (pure)', () => {
  test('keys are unique, every label has a real category, and the vocabulary is broad', () => {
    const keys = LABEL_CATALOG.map((x) => x.key); assert.equal(new Set(keys).size, keys.length);
    const cats = new Set(LABEL_CATEGORIES.map((c) => c.id)); assert.ok(LABEL_CATALOG.every((x) => cats.has(x.category)));
    assert.ok(LABEL_CATALOG.length >= 100 && LABEL_CATEGORIES.length >= 8);
  });
  test('labels that claim platform authority or impersonate FREEVERSE are refused, ordinary ones are not', () => {
    for (const bad of ['Founder', 'the founder', 'Admin', 'Moderator', 'FREEVERSE Staff', 'F R E E V E R S E team', 'Verified', 'Council']) assert.ok(screenIdentityClaim(bad), bad);
    for (const ok of ['Startup founder', 'Researcher', 'Community organiser', 'Co-founder', 'Guardian of my little sister'.slice(0, 20) === '' ? '' : 'Dreamer', 'Admin assistant']) assert.equal(screenIdentityClaim(ok), null, ok);
  });
});

for (const dialect of DIALECTS) {
  describe(`identity labels: custom, aspirational, changing; identity is not authority [${dialect}]`, () => {
    let t: TestApp; let a: { token: string; userId: string }, b: typeof a, c: typeof a;
    before(async () => { t = await startTestApp(dialect, {}); a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' }); c = await t.member('c@example.com', { handle: 'carol', name: 'Carol' }); });
    after(async () => { await t.close(); });
    const call = (m: string, p: string, tok: string, body?: unknown) => t.call(m, p, { token: tok, body });
    const add = (tok: string, body: unknown) => call('POST', '/api/me/identity-labels', tok, body);
    let researcherId = '', customId = '';

    test('the catalogue is served, and a catalogue label can be added with a stage', async () => {
      const cat = await call('GET', '/api/catalog/identity-labels', a.token); assert.equal(cat.status, 200); assert.ok(cat.json.items.length >= 100);
      const r = await add(a.token, { key: 'researcher', stage: 'aspiring' }); assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.label.label, 'Researcher'); assert.equal(r.json.label.stage, 'aspiring'); assert.equal(r.json.label.isCustom, false); researcherId = r.json.label.id;
      assert.equal((await add(a.token, { key: 'researcher' })).status, 409, 'no duplicates');
      assert.equal((await add(a.token, { key: 'not-a-label' })).status, 404);
      assert.equal((await add(a.token, { key: 'student', custom: 'Student' })).status, 400, 'one or the other');
    });
    test('a person can describe themselves in their own words; text equal to a catalogue label maps onto it', async () => {
      const r = await add(a.token, { custom: 'Beekeeper and amateur astronomer', stage: 'current', note: 'Two hives on my roof.' }); assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.label.isCustom, true); customId = r.json.label.id;
      const m = await add(a.token, { custom: 'gamer' }); assert.equal(m.status, 201); assert.equal(m.json.label.isCustom, false); assert.equal(m.json.label.label, 'Gamer');
      assert.equal((await add(a.token, { custom: 'Gamer' })).status, 409, 'and it still counts as a duplicate');
    });
    test('abusive and authority-claiming labels are refused, with a reason, for both labels and notes', async () => {
      for (const bad of ['Founder', 'FREEVERSE Admin', 'Moderator', 'n1gger']) { const r = await add(a.token, { custom: bad }); assert.equal(r.status, 400, bad); assert.ok(r.json.error?.message ?? r.json.message); }
      assert.equal((await add(a.token, { custom: 'Reasonable label', note: 'k y s' })).status, 400, 'abusive note');
      assert.equal((await call('PATCH', `/api/me/identity-labels/${customId}`, a.token, { label: 'Platform Owner' })).status, 400, 'editing is screened too');
    });
    test('IDENTITY IS NOT AUTHORITY: no label, however chosen, changes roles or opens privileged routes', async () => {
      const before = (await call('GET', '/api/me', a.token)).json.user.roles;
      for (const key of ['researcher', 'mentor', 'community-organiser', 'activist']) await add(a.token, { key, stage: 'current' });
      const after = (await call('GET', '/api/me', a.token)).json.user.roles; assert.deepEqual(after, before);
      for (const p of ['/api/founder/polls', '/api/founder/universes', '/api/founder-ai/state', '/api/moderation/cases']) assert.ok([401, 403, 404].includes((await call('GET', p, a.token)).status), p);
    });
    test('stages change over time and the change is recorded; catalogue wording is not editable, custom wording is', async () => {
      const p = await call('PATCH', `/api/me/identity-labels/${researcherId}`, a.token, { stage: 'current' }); assert.equal(p.status, 200); assert.equal(p.json.label.stage, 'current');
      const h = (await call('GET', `/api/me/identity-labels/${researcherId}/history`, a.token)).json.items; assert.deepEqual(h.map((x: any) => [x.from, x.to]), [[null, 'aspiring'], ['aspiring', 'current']]);
      assert.equal((await call('PATCH', `/api/me/identity-labels/${researcherId}`, a.token, { label: 'Renamed' })).status, 400);
      const e = await call('PATCH', `/api/me/identity-labels/${customId}`, a.token, { label: 'Beekeeper', stage: 'exploring' }); assert.equal(e.status, 200); assert.equal(e.json.label.label, 'Beekeeper');
    });
    test('only the owner can change or delete a label', async () => {
      assert.equal((await call('PATCH', `/api/me/identity-labels/${researcherId}`, b.token, { stage: 'exploring' })).status, 404);
      assert.equal((await call('DELETE', `/api/me/identity-labels/${researcherId}`, b.token)).status, 404);
      assert.equal((await call('GET', `/api/me/identity-labels/${researcherId}/history`, b.token)).status, 404);
    });
    test('others see only the labels whose audience includes them; "only me" stays private; blocked people see nothing', async () => {
      await call('PATCH', `/api/me/identity-labels/${researcherId}`, a.token, { visibility: 'only_me' });
      await call('PATCH', `/api/me/identity-labels/${customId}`, a.token, { visibility: 'everyone' });
      const seen = (await call('GET', '/api/members/alice/identity-labels', b.token)); assert.equal(seen.status, 200);
      const names = seen.json.items.map((x: any) => x.label); assert.ok(names.includes('Beekeeper')); assert.ok(!names.includes('Researcher'), 'only_me label hidden');
      assert.ok(!JSON.stringify(seen.json).includes('visibility'), 'audience settings are not leaked');
      assert.equal((await call('GET', '/api/members/alice/identity-labels', a.token)).json.items.length >= 2, true, 'owner view through the public route still respects audiences');
      await call('POST', '/api/blocks/bob', c.token).catch(() => undefined);
      assert.equal((await call('POST', '/api/blocks/carol', a.token)).status < 300, true);
      assert.equal((await call('GET', '/api/members/alice/identity-labels', c.token)).status, 404, 'a blocked person cannot see them');
    });
    test('the quota is enforced and removal works', async () => {
      const d = await t.member('d@example.com', { handle: 'dan', name: 'Dan' }); let last = 201;
      for (let i = 0; i < 25 && last === 201; i++) last = (await add(d.token, { custom: `Label number ${String.fromCharCode(97 + (i % 26))}${i}` })).status;
      assert.equal(last, 409);
      const list = (await call('GET', '/api/me/identity-labels', d.token)).json.items; assert.equal(list.length, 24);
      assert.equal((await call('DELETE', `/api/me/identity-labels/${list[0].id}`, d.token)).status, 200);
      assert.equal((await call('GET', '/api/me/identity-labels', d.token)).json.items.length, 23);
    });
  });
}

import { HANDLE_RE } from '../shared/constants';
for (const dialect of DIALECTS) {
  describe(`a brand-new member's auto-assigned handle works [${dialect}]`, () => {
    let t: TestApp; before(async () => { t = await startTestApp(dialect, {}); }); after(async () => { await t.close(); });
    test('the auto handle is a valid handle and the member’s own profile opens (regression: it used to contain a hyphen and 404)', async () => {
      const n = await t.member('new@example.com'); const me = (await t.call('GET', '/api/me', { token: n.token })).json.user;
      assert.match(me.handle, HANDLE_RE);
      assert.equal((await t.call('GET', `/api/members/${me.handle}`, { token: n.token })).status, 200);
      assert.equal((await t.call('GET', `/api/members/${me.handle}/identity-labels`, { token: n.token })).status, 200);
    });
    test('accounts created earlier with the legacy hyphenated handle can still open their profile', async () => {
      const o = await t.member('old@example.com'); await t.db.run("UPDATE users SET handle = 'member-0a1b2c3d' WHERE id = $1", [o.userId]);
      assert.equal((await t.call('GET', '/api/members/member-0a1b2c3d', { token: o.token })).status, 200);
      assert.equal((await t.call('GET', '/api/members/member-zzzz', { token: o.token })).status, 404, 'other hyphenated strings are still not handles');
    });
  });
}
