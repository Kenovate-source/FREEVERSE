import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { LEARN_FORMATS } from '../shared/api/catalog';

type U = { token: string; userId: string };
for (const dialect of DIALECTS) {
  describe(`catalog: Learn, opportunities, mentors, events, universes, search, explore [${dialect}]`, () => {
    let t: TestApp; let a: U, b: U, c: U;
    before(async () => {
      t = await startTestApp(dialect, { SEED_DEMO_DATA: '1', ANONYMOUS_POSTING_ENABLED: 'true' });
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' });
      b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' });
      c = await t.member('c@example.com', { handle: 'carol', name: 'Carol' });
      await t.call('POST', '/api/communities/honest-questions/join', { token: a.token });
      await t.call('POST', '/api/communities/honest-questions/join', { token: b.token });
    });
    after(async () => { await t.close(); });
    beforeEach(() => { t.clock.advance(2 * 3600_000); });

    test('demo seed: every format is present, everything is labelled demo, seeding is idempotent', async () => {
      const r = await t.call('GET', '/api/learn?limit=100', { token: a.token });
      assert.equal(r.status, 200); assert.ok(r.json.total >= 40);
      for (const f of LEARN_FORMATS) assert.ok(r.json.formats.some((x: any) => x.key === f), `no ${f}`);
      assert.ok(r.json.items.every((i: any) => i.isDemo)); assert.match(r.json.notice, /Demo content/);
      const { seedCatalog } = await import('../server/seed/catalog');
      await seedCatalog(t.s);
      assert.equal((await t.call('GET', '/api/learn?limit=100', { token: a.token })).json.total, r.json.total);
    });

    test('learn: search, filters, escaping, detail and unauthenticated access', async () => {
      assert.equal((await t.call('GET', '/api/learn')).status, 401);
      const q = await t.call('GET', '/api/learn?q=interview', { token: a.token });
      assert.ok(q.json.items.length >= 2 && q.json.items.every((i: any) => /interview/i.test(`${i.title} ${i.summary} ${i.category} ${i.tags.join(' ')}`)));
      assert.equal((await t.call('GET', '/api/learn?format=quiz', { token: a.token })).json.items.every((i: any) => i.format === 'quiz'), true);
      assert.equal((await t.call('GET', '/api/learn?q=100%25', { token: a.token })).json.total, 0); // % is literal
      assert.equal((await t.call('GET', '/api/learn?format=bogus', { token: a.token })).status, 400);
      const slug = q.json.items[0].slug;
      const d = await t.call('GET', `/api/learn/${slug}`, { token: a.token });
      assert.equal(d.status, 200); assert.ok(Array.isArray(d.json.item.body)); assert.match(d.json.item.demoNotice, /Demo content/);
      assert.equal((await t.call('GET', '/api/learn/does-not-exist', { token: a.token })).status, 404);
    });

    test('learn: progress, server-graded quizzes, path progress, saves — all per person', async () => {
      const quiz = (await t.call('GET', '/api/learn?format=quiz', { token: a.token })).json.items.find((i: any) => i.title.includes('reliable sources'));
      const full = (await t.call('GET', `/api/learn/${quiz.slug}`, { token: a.token })).json.item;
      // the answer key travels with the body for the practice quiz UI, but grading and storing happen on the server
      const g = await t.call('PUT', `/api/learn/${quiz.slug}/progress`, { token: a.token, body: { answers: { q1: 1, q2: 0, q3: 1 } } });
      assert.equal(g.json.status, 'completed'); assert.equal(g.json.result.score, 2); assert.equal(g.json.result.total, 3);
      assert.equal(g.json.result.results.find((x: any) => x.id === 'q2').correct, false);
      assert.equal((await t.call('PUT', `/api/learn/${quiz.slug}/progress`, { token: a.token, body: { percent: 120 } })).status, 400);
      assert.equal((await t.call('PUT', `/api/learn/${quiz.slug}/progress`, { token: a.token, body: { answers: { q1: 1 }, extra: 1 } })).status, 400);
      assert.equal((await t.call('GET', `/api/learn/${quiz.slug}`, { token: a.token })).json.item.progress.status, 'completed');
      assert.equal((await t.call('GET', `/api/learn/${quiz.slug}`, { token: b.token })).json.item.progress, null); // not shared
      assert.ok(full.body.length);
      // paths aggregate their items
      const path = (await t.call('GET', '/api/learn?format=path', { token: a.token })).json.items.find((i: any) => i.title.startsWith('Research foundations'));
      const p0 = (await t.call('GET', `/api/learn/${path.slug}`, { token: a.token })).json.item;
      assert.equal(p0.pathItems.length, 4); assert.equal(p0.progress, null);
      await t.call('PUT', `/api/learn/${p0.pathItems[0].slug}/progress`, { token: a.token, body: { completed: true } });
      assert.equal((await t.call('GET', `/api/learn/${path.slug}`, { token: a.token })).json.item.progress.percent, 25);
      // save + filter
      assert.equal((await t.call('PUT', '/api/saved', { token: a.token, body: { kind: 'learn', refId: quiz.id } })).status >= 200, true);
      assert.deepEqual((await t.call('GET', '/api/learn?saved=1', { token: a.token })).json.items.map((i: any) => i.id), [quiz.id]);
      assert.equal((await t.call('GET', '/api/learn?saved=1', { token: b.token })).json.total, 0);
      assert.ok((await t.call('GET', '/api/learn?progress=completed', { token: a.token })).json.total >= 2);
    });

    test('opportunities: filters, tracking is private, demo is disclosed', async () => {
      const all = await t.call('GET', '/api/opportunities', { token: a.token });
      assert.ok(all.json.items.length >= 15); assert.match(all.json.notice, /No organisation here is real/);
      assert.ok(all.json.items.every((i: any) => i.isDemo && i.applyUrl === null));
      assert.ok((await t.call('GET', '/api/opportunities?type=scholarship', { token: a.token })).json.items.every((i: any) => i.type === 'scholarship'));
      const id = all.json.items[0].id;
      assert.equal((await t.call('PUT', `/api/opportunities/${id}/tracking`, { token: a.token, body: { status: 'applied' } })).status, 200);
      await t.call('PUT', `/api/opportunities/${id}/tracking`, { token: a.token, body: { status: 'interviewing' } });
      assert.equal((await t.call('GET', `/api/opportunities/${id}`, { token: a.token })).json.item.tracking, 'interviewing');
      assert.equal((await t.call('GET', `/api/opportunities/${id}`, { token: b.token })).json.item.tracking, null);
      assert.equal((await t.call('GET', '/api/opportunities?tracked=1', { token: a.token })).json.items.length, 1);
      assert.equal((await t.call('PUT', `/api/opportunities/${id}/tracking`, { token: a.token, body: { status: 'hired' } })).status, 400);
      assert.equal((await t.call('PUT', `/api/opportunities/${crypto.randomUUID()}/tracking`, { token: a.token, body: { status: 'applied' } })).status, 404);
    });

    test('mentors: fictional, request once, honest about who receives it', async () => {
      const m = await t.call('GET', '/api/mentors', { token: a.token });
      assert.ok(m.json.items.length >= 5 && m.json.items.every((x: any) => x.isDemo && /Demo mentor/.test(x.name)));
      assert.match(m.json.notice, /fictional/);
      const id = m.json.items[0].id;
      const r = await t.call('POST', `/api/mentors/${id}/requests`, { token: a.token, body: { message: 'Could you review my portfolio?' } });
      assert.equal(r.status, 201); assert.equal(r.json.demo, true); assert.match(r.json.note, /no real person/);
      assert.equal((await t.call('POST', `/api/mentors/${id}/requests`, { token: a.token, body: {} })).status, 409);
      assert.equal((await t.call('GET', '/api/mentors', { token: a.token })).json.items.find((x: any) => x.id === id).requested, true);
      assert.equal((await t.call('GET', '/api/mentors', { token: b.token })).json.items.find((x: any) => x.id === id).requested, false);
      assert.equal((await t.call('GET', '/api/mentor-requests', { token: a.token })).json.items.length, 1);
    });

    test('events: upcoming, RSVP, counts, my events', async () => {
      const up = await t.call('GET', '/api/events', { token: a.token });
      assert.ok(up.json.items.length >= 8 && up.json.items.every((e: any) => new Date(e.startsAt) >= t.clock.now()));
      const e = up.json.items[0];
      await t.call('PUT', `/api/events/${e.id}/rsvp`, { token: a.token, body: { response: 'yes' } });
      await t.call('PUT', `/api/events/${e.id}/rsvp`, { token: b.token, body: { response: 'maybe' } });
      await t.call('PUT', `/api/events/${e.id}/rsvp`, { token: a.token, body: { response: 'yes' } }); // idempotent
      const d = (await t.call('GET', `/api/events/${e.id}`, { token: a.token })).json.item;
      assert.deepEqual(d.counts, { yes: 1, maybe: 1 }); assert.equal(d.myResponse, 'yes');
      assert.equal((await t.call('GET', `/api/events/${e.id}`, { token: c.token })).json.item.myResponse, null);
      assert.equal((await t.call('GET', '/api/events?when=mine', { token: a.token })).json.items.length, 1);
      assert.equal((await t.call('PUT', `/api/events/${e.id}/rsvp`, { token: a.token, body: { response: 'definitely' } })).status, 400);
      await t.db.run("INSERT INTO events (id, title, description, category, format, starts_at, is_demo, status) VALUES ($1,'Past demo','Old','Study skills','virtual',$2,$3,'published')", [crypto.randomUUID(), '2026-01-01T10:00:00.000Z', true]);
      assert.ok((await t.call('GET', '/api/events?when=past', { token: a.token })).json.items.length >= 1);
    });

    test('universes: all fifteen are reachable with honest status; FreePlay stays visible; interest is private and removable', async () => {
      const u = await t.call('GET', '/api/universes', { token: a.token });
      assert.equal(u.json.items.length, 15);
      const by = Object.fromEntries(u.json.items.map((x: any) => [x.id, x]));
      assert.ok(u.json.items.every((x: any) => x.route === `/universes/${x.id}`), 'every Universe has its own page');
      assert.equal(by.freemarket.status, 'partial'); assert.match(by.freemarket.basis, /No payments/);
      assert.equal(by.freeplay.status, 'partial'); assert.match(by.freeplay.basis, /Founder decision/); assert.notEqual(by.freeplay.status, 'under_review');
      assert.ok(by.freelearn.route); assert.ok(u.json.items.every((x: any) => x.basis && x.statusLabel));
      assert.equal((await t.call('PUT', '/api/interest/universe:freemarket', { token: a.token })).json.interested, true);
      assert.equal((await t.call('PUT', '/api/interest/universe:freemarket', { token: a.token })).status, 200);
      assert.equal((await t.call('GET', '/api/universes', { token: a.token })).json.items.find((x: any) => x.id === 'freemarket').interested, true);
      assert.equal((await t.call('GET', '/api/universes', { token: b.token })).json.items.find((x: any) => x.id === 'freemarket').interested, false);
      assert.equal((await t.call('GET', '/api/universes', { token: b.token })).json.items.find((x: any) => x.id === 'freemarket').interestedCount, 1); // a count, never a list of names
      assert.equal((await t.call('PUT', '/api/interest/universe:nope', { token: a.token })).status, 404);
      assert.equal((await t.call('PUT', '/api/interest/..%2Fx', { token: a.token })).status, 404);
      await t.call('DELETE', '/api/interest/universe:freemarket', { token: a.token });
      assert.equal((await t.call('GET', '/api/interest', { token: a.token })).json.keys.length, 0);
    });

    test('Founder status override changes what members see', async () => {
      await t.db.run("INSERT INTO platform_config (key, value, updated_at) VALUES ('universes.status', $1, $2)", [JSON.stringify({ freelearn: { status: 'concept', note: 'Re-scoped' } }), t.clock.now().toISOString()]);
      const x = (await t.call('GET', '/api/universes', { token: a.token })).json.items.find((u: any) => u.id === 'freelearn');
      assert.equal(x.status, 'concept'); assert.equal(x.route, null); assert.equal(x.note, 'Re-scoped');
      await t.db.run("DELETE FROM platform_config WHERE key = 'universes.status'");
    });

    test('demo members: labelled, cannot sign in, anonymous demo post leaks no author', async () => {
      const feed = (await t.call('GET', '/api/feed?sort=recent&limit=30', { token: a.token })).json;
      assert.ok(feed.items.length >= 8);
      const people = await t.call('GET', '/api/members?q=demo', { token: a.token });
      assert.ok(people.json.items.length >= 5 && people.json.items.every((m: any) => m.person.isDemo));
      assert.equal((await t.call('POST', '/api/auth/signin', { body: { email: 'demo_amara@example.com', password: 'x' } })).status >= 400, true);
      const anon = feed.items.filter((p: any) => p.author?.anonymous === true);
      assert.ok(anon.length >= 1);
      const demoIds = (await t.db.query<any>('SELECT id FROM users WHERE is_demo = $1', [true])).map((r) => r.id);
      for (const p of anon) { const s = JSON.stringify(p); for (const id of demoIds) assert.ok(!s.includes(id)); assert.ok(!/demo_lena/.test(s)); }
    });

    test('search: grouped, honours visibility, never reveals anonymous authors, treats wildcards literally', async () => {
      assert.equal((await t.call('GET', '/api/search?q=ab', {})).status, 401);
      assert.equal((await t.call('GET', '/api/search?q=a', { token: a.token })).status, 400);
      const s1 = await t.call('GET', '/api/search?q=study', { token: a.token });
      const kinds = s1.json.groups.map((g: any) => g.kind);
      for (const k of ['community', 'learn']) assert.ok(kinds.includes(k), k);
      assert.ok(s1.json.total > 3);
      assert.ok((await t.call('GET', '/api/search?q=universes', { token: a.token })).json.groups.some((g: any) => g.kind === 'page'));
      // posts: private ones are invisible to others, public ones are found
      await t.call('POST', '/api/posts', { token: b.token, body: { kind: 'text', body: 'zebra-secret only for me', visibility: 'only_me' } });
      await t.call('POST', '/api/posts', { token: b.token, body: { kind: 'text', body: 'zebra-public hello everyone', visibility: 'members' } });
      const z = await t.call('GET', '/api/search?q=zebra', { token: a.token });
      const posts = z.json.groups.find((g: any) => g.kind === 'post')?.items ?? [];
      assert.equal(posts.length, 1); assert.match(posts[0].title, /zebra-public/);
      assert.equal(((await t.call('GET', '/api/search?q=zebra', { token: b.token })).json.groups.find((g: any) => g.kind === 'post')?.items ?? []).length, 2);
      // anonymous post: found by body, but the result carries no author at all
      const ap = await t.call('POST', '/api/posts', { token: b.token, body: { kind: 'text', body: 'quokka confession text', anonymous: true, communityId: (await t.call('GET', '/api/communities/honest-questions', { token: b.token })).json.community.id } });
      assert.equal(ap.status, 201);
      const q = await t.call('GET', '/api/search?q=quokka', { token: a.token });
      const s = JSON.stringify(q.json);
      assert.ok(!s.includes(b.userId) && !/bob/i.test(s)); assert.equal(q.json.groups.find((g: any) => g.kind === 'post').items.length, 1);
      // blocked users disappear from each other's results
      await t.call('POST', '/api/blocks/bob', { token: a.token });
      assert.equal(((await t.call('GET', '/api/search?q=zebra', { token: a.token })).json.groups.find((g: any) => g.kind === 'post')?.items ?? []).length, 0);
      assert.ok(!((await t.call('GET', '/api/search?q=bob', { token: a.token })).json.groups.find((g: any) => g.kind === 'member')?.items ?? []).some((i: any) => i.title === 'Bob'));
      await t.call('DELETE', '/api/blocks/bob', { token: a.token });
      assert.equal((await t.call('GET', '/api/search?q=%25%25', { token: a.token })).json.total, 0);
    });

    test('explore: sections explain why; adding interests changes the match reason', async () => {
      const e0 = await t.call('GET', '/api/explore', { token: c.token });
      assert.equal(e0.json.hasInterests, false);
      for (const k of ['communities', 'people', 'learn', 'opportunities', 'events', 'universes']) assert.ok(Array.isArray(e0.json[k]) && e0.json[k].length > 0, k);
      assert.ok(e0.json.communities.every((x: any) => x.why) && e0.json.learn.every((x: any) => x.why));
      assert.ok(e0.json.universes.every((u: any) => u.route));
      await t.call('PUT', '/api/personalization', { token: c.token, body: { kind: 'interest', items: [{ key: 'writing', label: 'Writing', category: 'Creative' }] } });
      const e1 = await t.call('GET', '/api/explore', { token: c.token });
      assert.equal(e1.json.hasInterests, true);
      assert.ok(e1.json.learn.some((x: any) => /writing/i.test(x.why)));
      assert.ok(!e1.json.people.some((x: any) => x.person.person.isSelf));
    });

    test('account deletion erases personal catalog data', async () => {
      const d = await t.member('d@example.com', { handle: 'dana', name: 'Dana' });
      const opp = (await t.call('GET', '/api/opportunities', { token: d.token })).json.items[0].id;
      const ev = (await t.call('GET', '/api/events', { token: d.token })).json.items[0].id;
      const lr = (await t.call('GET', '/api/learn', { token: d.token })).json.items[0];
      const mentor = (await t.call('GET', '/api/mentors', { token: d.token })).json.items[0].id;
      await t.call('PUT', `/api/opportunities/${opp}/tracking`, { token: d.token, body: { status: 'applied' } });
      await t.call('PUT', `/api/events/${ev}/rsvp`, { token: d.token, body: { response: 'yes' } });
      await t.call('PUT', `/api/learn/${lr.slug}/progress`, { token: d.token, body: { completed: true } });
      await t.call('POST', `/api/mentors/${mentor}/requests`, { token: d.token, body: {} });
      await t.call('PUT', '/api/interest/universe:freehealth', { token: d.token });
      const exp = await t.call('GET', '/api/account/export', { token: d.token });
      assert.equal(exp.status, 200); assert.ok(JSON.stringify(exp.json).includes('freehealth'));
      const su = await t.call('POST', '/api/me/step-up', { token: d.token, body: { secret: 'd@example.com' } });
      assert.equal((await t.call('POST', '/api/account/delete', { token: d.token, headers: { 'x-step-up': su.json.token }, body: { confirm: 'DELETE MY ACCOUNT' } })).status, 200);
      for (const [table, col] of [['opportunity_tracking', 'user_id'], ['event_rsvps', 'user_id'], ['learn_progress', 'user_id'], ['mentor_requests', 'user_id'], ['feature_interest', 'user_id']])
        assert.equal(Number((await t.db.get<any>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = $1`, [d.userId]))?.n), 0, table);
    });
  });
}
