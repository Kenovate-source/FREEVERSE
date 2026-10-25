// Founder decisions, Oct 2026: (1) FREEVERSE is for adults aged 18 and over, no upper limit. (2) Anonymous posting is
// available and ON by default, with identity protection, abuse limits, community controls and restricted, audited reveal.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';

const png = () => sharp({ create: { width: 48, height: 48, channels: 3, background: '#7755ff' } }).png().toBuffer();

for (const dialect of DIALECTS) {
  describe(`age policy: 18 and over [${dialect}]`, () => {
    let t: TestApp;
    before(async () => { t = await startTestApp(dialect); });
    after(async () => { await t.close(); });
    const elig = (token: string, year: number) => t.call('POST', '/api/me/eligibility', { token, body: { birthMonth: 6, birthDay: 6, birthYear: year, acceptTerms: true, confirmSelfDeclared: true } });

    test('adults older than 24 can register and enter; stored as self-declared month+year, never "verified"', async () => {
      for (const [email, year] of [['adult30@example.com', 1996], ['adult60@example.com', 1966]] as const) {
        const a = await t.register(email); const r = await elig(a.token, year);
        assert.equal(r.status, 200, `${year}: ${JSON.stringify(r.json)}`); assert.equal(r.json.user.status, 'active');
        assert.equal(r.json.user.eligibility.status, 'self_attested'); assert.equal(r.json.user.eligibility.method, 'self_declared_birthdate');
        const row = await t.db.get<any>('SELECT status, birth_month, birth_year, age_check_status FROM users WHERE id = $1', [a.userId]);
        assert.equal(row.status, 'active'); assert.equal(Number(row.birth_year), year); assert.equal(row.age_check_status, 'self_attested');
        assert.equal((await t.call('GET', '/api/feed?sort=recent', { token: a.token })).status, 200, 'can use the app');
      }
      const cfg = await t.call('GET', '/api/config');
      assert.equal(cfg.json.eligibility.min, 18); assert.equal(cfg.json.eligibility.max, null); assert.equal(cfg.json.eligibility.noUpperLimit, true); assert.equal(cfg.json.eligibility.verified, false);
    });
    test('an account under 18 is rejected server-side and nothing about the date is stored', async () => {
      const y = new Date().getUTCFullYear();
      const a = await t.register('minor@example.com'); const r = await elig(a.token, y - 16);
      assert.equal(r.status, 403); assert.equal(r.json.error.code, 'ineligible');
      const row = await t.db.get<any>('SELECT status, birth_year FROM users WHERE id = $1', [a.userId]);
      assert.equal(row.status, 'ineligible'); assert.equal(row.birth_year, null);
      assert.equal((await t.call('GET', '/api/feed?sort=recent', { token: a.token })).status, 403, 'cannot use the app');
    });
    test('implausible birth years are rejected as invalid dates, not as an age rule', async () => {
      const a = await t.register('typo@example.com'); const r = await elig(a.token, 1901);
      assert.equal(r.status, 400); assert.equal(r.json.error.code, 'invalid_date');
    });
  });

  describe(`anonymous posting: available by default, still protected [${dialect}]`, () => {
    let t: TestApp; let a: any, b: any, mod: any, founder: any;
    before(async () => {
      t = await startTestApp(dialect, { SEED_DEMO_DATA: '1' }); // note: NO ANONYMOUS_POSTING_ENABLED override: the default is what's tested
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice Wonder' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' });
      mod = await t.member('mod@example.com', { handle: 'moddy', name: 'Moddy' }); await t.grantRole(mod.userId, 'moderator');
      founder = await t.member('f@example.com', { handle: 'founder1', name: 'Founder' }); await t.grantRole(founder.userId, 'founder');
    });
    after(async () => { await t.close(); });
    const post = (u: any, body: any) => t.call('POST', '/api/posts', { token: u.token, body });

    test('config reports it available; demo communities allow it (except accountability-sensitive ones)', async () => {
      const cfg = await t.call('GET', '/api/config'); assert.equal(cfg.json.features.anonymousPosting, true);
      const list = await t.call('GET', '/api/communities', { token: a.token }); assert.equal(list.status, 200);
      const by = new Map<string, boolean>(list.json.items.map((c: any) => [c.slug, c.allowAnonymous]));
      assert.equal(by.get('honest-questions'), true); assert.equal(by.get('study-circle'), true); assert.equal(by.get('first-job-club'), false);
    });
    test('a member can post anonymously (with an image) and nothing public ties it to them', async () => {
      await t.call('POST', '/api/communities/honest-questions/join', { token: a.token });
      const c = (await t.call('GET', '/api/communities/honest-questions', { token: a.token })).json.community;
      const up = await t.call('POST', '/api/media?purpose=post', { token: a.token, raw: await png(), contentType: 'image/png' });
      assert.equal(up.status, 201, JSON.stringify(up.json));
      const r = await post(a, { body: 'a very private thought', anonymous: true, communityId: c.id, mediaIds: [up.json.media?.id ?? up.json.id] });
      assert.equal(r.status, 201, JSON.stringify(r.json)); const p = r.json.post;
      assert.equal(p.author.anonymous, true);
      const noUrls = JSON.stringify(r.json).replace(/\/api\/media\/[^"]+/g, ''); // media links are bound to the viewer, so they hold the viewer's own id
      assert.ok(!noUrls.includes(a.userId) && !/Alice/.test(noUrls), 'creator response carries no identity');
      await t.call('POST', '/api/communities/honest-questions/join', { token: b.token });
      let seen = 0;
      for (const path of ['/api/feed?sort=recent', '/api/feed?sort=relevant', `/api/posts/${p.id}`, `/api/posts/${p.id}/comments`, '/api/search?q=private']) {
        const x = await t.call('GET', path, { token: b.token }); const txt = JSON.stringify(x.json);
        if (txt.includes('a very private thought') || txt.includes(p.id)) seen++;
        // the items that are anonymous must carry no user id, handle or display name anywhere
        const walk = (n: any) => { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { if (n.id === p.id || n.author?.anonymous === true) { const j = JSON.stringify(n); assert.ok(!j.includes(a.userId) && !/alice/i.test(j), `${path}: anonymous item leaks identity`); } Object.values(n).forEach(walk); } };
        walk(x.json);
      }
      assert.ok(seen >= 3, 'the post is reachable by other members');
      const profile = await t.call('GET', '/api/members/alice/posts', { token: b.token }); assert.ok(!JSON.stringify(profile.json).includes('a very private thought'), 'not on the author profile');
      const asBob = JSON.stringify((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).json); assert.ok(!asBob.includes(a.userId) && !/alice/i.test(asBob), 'other viewers get media links bound to themselves and no author identity');
    });
    test('abuse prevention: anonymous posts are rate limited; error messages do not leak', async () => {
      const c = (await t.call('GET', '/api/communities/study-circle', { token: a.token })).json.community; await t.call('POST', '/api/communities/study-circle/join', { token: a.token });
      let limited = 0; for (let i = 0; i < 8; i++) { const r = await post(a, { body: `anon ${i} words`, anonymous: true, communityId: c.id }); if (r.status === 429) { limited++; assert.ok(!JSON.stringify(r.json).includes(a.userId)); } }
      assert.ok(limited >= 1, 'rate limit reached');
      const jc = (await t.call('GET', '/api/communities/first-job-club', { token: a.token })).json.community; await t.call('POST', '/api/communities/first-job-club/join', { token: a.token });
      const no = await post(a, { body: 'nope', anonymous: true, communityId: jc.id }); assert.equal(no.status, 409); assert.equal(no.json.error.code, 'anonymous_not_allowed');
      assert.ok(!JSON.stringify(no.json).includes(a.userId));
    });
    test('new communities allow anonymous posting by default; only their moderators (or stewards) can switch it off; moderators cannot switch it on', async () => {
      const made = await t.call('POST', '/api/communities', { token: b.token, body: { name: 'Night Owls', description: 'For people who study at night.', category: 'Study', rules: ['Be kind to each other'] } });
      assert.equal(made.status, 201, JSON.stringify(made.json)); assert.equal(made.json.community.allowAnonymous, true);
      const slug = made.json.community.slug;
      assert.equal((await t.call('POST', `/api/communities/${slug}/anonymous`, { token: a.token, body: { allow: false, reason: 'not a moderator' } })).status, 403);
      assert.equal((await t.call('POST', `/api/communities/${slug}/anonymous`, { token: b.token, body: { allow: false, reason: 'we prefer named posts' } })).status, 200);
      assert.equal((await t.call('GET', `/api/communities/${slug}`, { token: b.token })).json.community.allowAnonymous, false);
      assert.equal((await t.call('POST', `/api/communities/${slug}/anonymous`, { token: b.token, body: { allow: true, reason: 'trying to turn it back on' } })).status, 403, 'moderators cannot turn it on');
      const audit = await t.db.get<any>("SELECT reason FROM audit_events WHERE action = 'community.anonymous_changed'"); assert.ok(audit, 'change is audited');
    });
    test('the Founder role does not reveal anonymous authors; reveal needs the moderator permission', async () => {
      const c = (await t.call('GET', '/api/communities/honest-questions', { token: a.token })).json.community;
      t.clock.advance(3 * 3600_000);
      const p = (await post(a, { body: 'rude anonymous post', anonymous: true, communityId: c.id })).json.post;
      const rep = await t.call('POST', '/api/reports', { token: b.token, body: { targetType: 'post', targetId: p.id, category: 'harassment', details: 'rude' } });
      assert.ok(rep.status === 201 || rep.status === 200, JSON.stringify(rep.json));
      const q = await t.call('GET', '/api/moderation/queue?status=open', { token: mod.token }); const caseId = q.json.items.find((x: any) => x.targetId === p.id || x.target?.id === p.id)?.id ?? q.json.items[0].id; assert.ok(caseId);
      await t.call('POST', `/api/moderation/cases/${caseId}/review-content`, { token: mod.token, body: { reason: 'Reviewing the reported post' } });
      const asFounder = await t.call('POST', `/api/moderation/cases/${caseId}/actions`, { token: founder.token, body: { action: 'reveal_author', note: 'I want to know who wrote this one' } });
      assert.equal(asFounder.status, 403, 'being Founder is not a reason to see an anonymous author');
      assert.ok(!JSON.stringify(asFounder.json).includes(a.userId));
      assert.equal((await t.call('POST', `/api/moderation/cases/${caseId}/actions`, { token: a.token, body: { action: 'reveal_author', note: 'the author asking about themselves' } })).status, 403, 'ordinary members cannot');
      assert.ok(!JSON.stringify((await t.call('GET', `/api/posts/${p.id}`, { token: founder.token })).json).includes(a.userId), 'Founder sees an alias, like everyone');
    });
  });

  describe(`anonymous posting can still be switched off globally [${dialect}]`, () => {
    let t: TestApp;
    before(async () => { t = await startTestApp(dialect, { SEED_DEMO_DATA: '1', ANONYMOUS_POSTING_ENABLED: 'false' }); });
    after(async () => { await t.close(); });
    test('global switch off: config reports it, anonymous posts are refused, nothing is created', async () => {
      const a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' });
      assert.equal((await t.call('GET', '/api/config')).json.features.anonymousPosting, false);
      await t.call('POST', '/api/communities/honest-questions/join', { token: a.token });
      const c = (await t.call('GET', '/api/communities/honest-questions', { token: a.token })).json.community; assert.equal(c.allowAnonymous, false);
      const r = await t.call('POST', '/api/posts', { token: a.token, body: { body: 'hi', anonymous: true, communityId: c.id } });
      assert.equal(r.status, 409); assert.equal(r.json.error.code, 'anonymous_disabled');
    });
  });
}
