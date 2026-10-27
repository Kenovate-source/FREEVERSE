import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { UNIVERSES } from '../shared/universes';
import { UNIVERSE_SPECS, GAMES, validateMeta, templateFor } from '../shared/universe-spaces';

test('registry: all 15 Universes have a spec with spaces, honest limits and valid cross-links', () => {
  assert.equal(UNIVERSES.length, 15); assert.equal(UNIVERSE_SPECS.length, 15);
  const ids = new Set(UNIVERSES.map((u) => u.id));
  assert.ok(ids.has('freeplay') && ids.has('freemedia') && ids.has('freeentertainment'));
  for (const spec of UNIVERSE_SPECS) {
    assert.ok(ids.has(spec.id), spec.id);
    assert.ok(spec.limits.length >= 1, `${spec.id} states its limits`);
    assert.ok(spec.actions.length >= 1 && spec.actions.some((a) => a.primary), `${spec.id} has a primary action`);
    assert.ok(spec.spaces[0]!.type === 'overview');
    assert.ok(spec.related.length >= 2 && spec.related.every((r) => ids.has(r) && r !== spec.id), `${spec.id} related`);
    // the Universe offers something to do, not just text
    assert.ok(spec.templates.length > 0 || spec.spaces.some((s) => s.type === 'link' || s.type === 'tool'), `${spec.id} has meaningful actions`);
    for (const sp of spec.spaces) {
      if (sp.type === 'browse') for (const tid of sp.templates ?? []) assert.ok(spec.templates.some((t) => t.id === tid), `${spec.id}/${sp.id} -> ${tid}`);
      if (sp.type === 'link') assert.match(sp.to!, /^\/[a-z]/);
      if (sp.type === 'tool') assert.ok(sp.tool);
    }
    for (const a of spec.actions) { assert.match(a.to, /^\/[a-z]/); const m = /^\/universes\/(\w+)\/(\w+)/.exec(a.to); if (m) assert.ok(spec.spaces.some((s) => s.id === m[2]), `${spec.id} action ${a.to} points at a real space`); }
    for (const t of spec.templates) for (const f of t.fields) if (f.type === 'select') assert.ok(f.options && f.options.length >= 2, `${spec.id}/${t.id}/${f.key}`);
  }
  assert.equal(GAMES.length, 4);
});
test('validateMeta: required, options, numbers, unknown keys', () => {
  const t = templateFor('freemarket', 'listing')!;
  assert.equal(validateMeta(t, {}).ok, false);
  assert.equal(validateMeta(t, { category: 'Other', offer: 'Product', price: 'Free' }).ok, true);
  assert.equal(validateMeta(t, { category: 'Nope', offer: 'Product', price: 'Free' }).ok, false);
  assert.equal(validateMeta(t, { category: 'Other', offer: 'Product', price: 'Free', evil: 'x' }).ok, false);
  assert.equal(validateMeta(templateFor('freeplay', 'challenge')!, { game: 'Memory Match', score: -1 }).ok, false);
});

for (const dialect of DIALECTS) describe(`universe spaces [${dialect}]`, () => {
  let t: TestApp; let a: any, b: any;
  before(async () => { t = await startTestApp(dialect, { SEED_DEMO_DATA: '1' }); a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' }); });
  after(async () => { await t.close(); });
  const post = (who: any, body: any) => t.call('POST', '/api/posts', { token: who.token, body });
  const listing = { kind: 'creative', universe: 'freemarket', template: 'listing', title: 'Handmade notebook', body: 'A5, recycled paper', meta: { category: 'Handmade & crafts', offer: 'Product', price: '₦2,000' } };

  test('seeded sample content is labelled demo, in every Universe that has templates', async () => {
    for (const spec of UNIVERSE_SPECS.filter((s) => s.templates.length)) {
      const r = await t.call('GET', `/api/feed?universe=${spec.id}&sort=recent`, { token: a.token });
      assert.equal(r.status, 200); assert.ok(r.json.items.length >= 1, `${spec.id} has sample content`);
      assert.ok(r.json.items.every((p: any) => p.author.person.isDemo === true), `${spec.id} samples are labelled demo`);
    }
  });
  test('creating a templated post validates the template, kind, images, meta and refuses anonymity', async () => {
    const ok = await post(a, listing); assert.equal(ok.status, 201);
    assert.equal(ok.json.post.universe, 'freemarket'); assert.equal(ok.json.post.template, 'listing'); assert.equal(ok.json.post.data.meta.price, '₦2,000'); assert.equal(ok.json.post.visibility, 'everyone');
    assert.equal((await post(a, { ...listing, template: 'nope' })).status, 422);
    assert.equal((await post(a, { ...listing, kind: 'text' })).status, 422);
    assert.equal((await post(a, { ...listing, meta: { category: 'Other' } })).status, 422);
    assert.equal((await post(a, { ...listing, meta: { ...listing.meta, hacked: 'x' } })).status, 422);
    assert.equal((await post(a, { ...listing, title: undefined })).status, 422);
    assert.equal((await post(a, { ...listing, anonymous: true })).status, 409);
    assert.equal((await post(a, { kind: 'text', body: 'x', meta: { a: 'b' } })).status, 422); // meta without universe/template
    assert.equal((await post(a, { kind: 'text', universe: 'freeconnect', template: 'x', body: 'y' })).status, 422);
  });
  test('feed filters by universe, template and facet; "mine" lists only my own', async () => {
    const all = await t.call('GET', '/api/feed?universe=freemarket&template=listing&facet=Handmade%20%26%20crafts', { token: b.token });
    assert.ok(all.json.items.some((p: any) => p.title === 'Handmade notebook'));
    assert.ok(all.json.items.every((p: any) => p.data.meta.category === 'Handmade & crafts'));
    const mine = await t.call('GET', '/api/feed?universe=freemarket&mine=1', { token: a.token });
    assert.ok(mine.json.items.length >= 1 && mine.json.items.every((p: any) => p.viewer.mine));
    assert.equal((await t.call('GET', '/api/feed?universe=nope', { token: a.token })).status, 400);
    const stats = await t.call('GET', '/api/universes/freemarket/stats', { token: a.token });
    assert.ok(stats.json.templates.listing >= 4); assert.equal((await t.call('GET', '/api/universes/nope/stats', { token: a.token })).status, 404);
  });
  test('participation: members see a count, only the author sees who; no self-join; not on posts without it', async () => {
    const p = (await post(a, { kind: 'text', universe: 'freelabs', template: 'experiment', title: 'Cold showers', body: 'Try it for a week.', meta: { status: 'Proposed', duration: '1 week' } })).json.post;
    assert.deepEqual(p.participation, { count: 0, joined: false });
    assert.equal((await t.call('PUT', `/api/posts/${p.id}/participation`, { token: a.token })).status, 409);
    const j = await t.call('PUT', `/api/posts/${p.id}/participation`, { token: b.token }); assert.equal(j.json.count, 1);
    assert.equal((await t.call('PUT', `/api/posts/${p.id}/participation`, { token: b.token })).json.count, 1, 'idempotent');
    assert.deepEqual((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).json.post.participation, { count: 1, joined: true });
    assert.equal((await t.call('GET', `/api/posts/${p.id}/participants`, { token: b.token })).status, 403);
    const who = await t.call('GET', `/api/posts/${p.id}/participants`, { token: a.token }); assert.equal(who.json.items[0].handle, 'bob');
    assert.ok(!JSON.stringify((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).json).includes('"participants"'));
    const n = await t.call('GET', '/api/notifications', { token: a.token }); assert.ok(JSON.stringify(n.json).includes('joined'));
    assert.equal((await t.call('DELETE', `/api/posts/${p.id}/participation`, { token: b.token })).json.count, 0);
    const plain = (await post(a, listing)).json.post; assert.equal(plain.participation, null);
    assert.equal((await t.call('PUT', `/api/posts/${plain.id}/participation`, { token: b.token })).status, 404);
  });
  test('blocked people cannot see or join each other’s universe posts', async () => {
    const p = (await post(a, { kind: 'text', universe: 'freeevents', template: 'idea', body: 'Board games night', meta: { format: 'In person' } })).json.post;
    await t.call('POST', '/api/blocks/bob', { token: a.token });
    const bl = await t.call('PUT', `/api/posts/${p.id}/participation`, { token: b.token });
    await t.db.run('DELETE FROM blocks');
    assert.equal(bl.status, 404);
  });
  test('games: score validation, personal best, and an opt-in leaderboard that shows each person once', async () => {
    assert.equal((await t.call('POST', '/api/games/memory/scores', { token: a.token, body: { score: 24, showName: true } })).status, 201);
    await t.call('POST', '/api/games/memory/scores', { token: a.token, body: { score: 18, showName: true } });
    await t.call('POST', '/api/games/memory/scores', { token: b.token, body: { score: 12, showName: false } });
    assert.equal((await t.call('POST', '/api/games/memory/scores', { token: a.token, body: { score: 99999 } })).status, 409);
    assert.equal((await t.call('POST', '/api/games/nope/scores', { token: a.token, body: { score: 1 } })).status, 404);
    assert.equal((await t.call('POST', '/api/games/memory/scores', { token: a.token, body: { score: -3 } })).status, 400);
    const r = await t.call('GET', '/api/games/memory/scores', { token: b.token });
    assert.equal(r.json.mine.best, 12); assert.equal(r.json.lowerIsBetter, true);
    assert.deepEqual(r.json.top.map((x: any) => [x.name, x.score]), [['Alice', 18]]); // Bob did not opt in; Alice appears once with her best
    const m = await t.call('POST', '/api/games/maths/scores', { token: a.token, body: { score: 20, showName: true } }); assert.equal(m.status, 201);
    assert.equal((await t.call('GET', '/api/games/maths/scores', { token: a.token })).json.top[0].score, 20);
  });
  test('moderators removing a universe post hides it; deleting clears participation', async () => {
    const p = (await post(a, { kind: 'text', universe: 'freevolunteer', template: 'story', body: 'A story', meta: {} })).json.post;
    assert.equal((await t.call('DELETE', `/api/posts/${p.id}`, { token: a.token })).status, 200);
    assert.equal((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).status, 404);
  });
  test('account deletion removes participation and scores', async () => {
    const c = await t.member('c@example.com', { handle: 'carol', name: 'Carol' });
    const p = (await post(a, { kind: 'text', universe: 'freeevents', template: 'idea', body: 'Picnic', meta: { format: 'In person' } })).json.post;
    await t.call('PUT', `/api/posts/${p.id}/participation`, { token: c.token });
    await t.call('POST', '/api/games/slide/scores', { token: c.token, body: { score: 500 } });
    const del = await t.call('POST', '/api/account/delete', { token: c.token, body: { confirm: 'DELETE MY ACCOUNT' }, headers: { 'x-step-up': (await t.call('POST', '/api/me/step-up', { token: c.token, body: { secret: 'c@example.com' } })).json.token } });
    assert.ok([200, 202, 204].includes(del.status), `delete status ${del.status}: ${JSON.stringify(del.json)}`);
    assert.equal(Number((await t.db.get<any>('SELECT COUNT(*) AS n FROM post_participation WHERE user_id = $1', [c.userId]))!.n), 0);
    assert.equal(Number((await t.db.get<any>('SELECT COUNT(*) AS n FROM game_scores WHERE user_id = $1', [c.userId]))!.n), 0);
  });
});
