import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';

for (const dialect of DIALECTS) {
  describe(`restricted access, community oversight, advisory polls [${dialect}]`, () => {
    let t: TestApp; let founder: { token: string; userId: string }, mod: typeof founder, dir: typeof founder, a: typeof founder, b: typeof founder, c3: typeof founder;
    before(async () => {
      t = await startTestApp(dialect, {});
      founder = await t.member('f@example.com', { handle: 'fnd', name: 'Fnd' }); await t.grantRole(founder.userId, 'founder');
      dir = await t.member('d@example.com', { handle: 'dirk', name: 'Dirk' }); await t.grantRole(dir.userId, 'director');
      mod = await t.member('m@example.com', { handle: 'moddy', name: 'Mod' }); await t.grantRole(mod.userId, 'moderator');
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' }); c3 = await t.member('c@example.com', { handle: 'cara', name: 'Cara' });
    });
    after(async () => { await t.close(); });
    const call = (m: string, p: string, tok: string, body?: unknown) => t.call(m, p, { token: tok, body });
    const REASON = 'Pending a review of recent activity.';

    test('restricting pauses access but keeps the appointment; restoring brings it back; both recorded', async () => {
      assert.equal((await call('GET', '/api/founder/suggestions', dir.token)).status, 200, 'director has access to start with');
      assert.equal((await call('GET', '/api/founder/appointments', dir.token)).status, 403, 'only the Founder manages appointments');
      const list = (await call('GET', '/api/founder/appointments', founder.token)).json; const g = list.items.find((x: any) => x.holder.handle === 'dirk'); assert.equal(g.state, 'active');
      assert.equal((await call('POST', `/api/founder/appointments/${g.id}/restrict`, founder.token, { reason: 'short' })).status, 400, 'a reason is required');
      assert.equal((await call('POST', `/api/founder/appointments/${g.id}/restrict`, dir.token, { reason: REASON })).status, 403);
      assert.equal((await call('POST', `/api/founder/appointments/${g.id}/restrict`, founder.token, { reason: REASON })).status, 200);
      assert.equal((await call('GET', '/api/founder/suggestions', dir.token)).status, 403, 'access is paused at once');
      assert.equal((await call('GET', '/api/founder/appointments', founder.token)).json.items.find((x: any) => x.id === g.id).state, 'restricted');
      assert.equal((await call('POST', `/api/founder/appointments/${g.id}/restrict`, founder.token, { reason: REASON })).status, 409);
      assert.equal((await call('POST', `/api/founder/appointments/${g.id}/restore`, founder.token, { reason: 'Review finished, all clear.' })).status, 200);
      assert.equal((await call('GET', '/api/founder/suggestions', dir.token)).status, 200, 'restored');
      const h = (await call('GET', '/api/founder/appointments', founder.token)).json.history; assert.equal(h.length, 2); assert.equal(h[0].action, 'Access restored');
      const fg = list.items.find((x: any) => x.role === 'founder'); assert.equal((await call('POST', `/api/founder/appointments/${fg.id}/restrict`, founder.token, { reason: REASON })).status, 409, 'the Founder grant is protected');
    });

    test('community oversight: restrict (reversible, restores previous settings), close and reopen, with reasons and audit', async () => {
      const com = (await call('POST', '/api/communities', a.token, { name: 'Review Club', description: 'A community used for the oversight test.', category: 'Lifestyle' })).json.community;
      await call('POST', '/api/communities/review-club/join', b.token);
      assert.equal((await call('POST', '/api/founder/communities/review-club/oversight', a.token, { action: 'restrict', reason: REASON })).status, 403, 'the community’s own moderator cannot use Founder oversight');
      assert.equal((await call('POST', '/api/founder/communities/review-club/oversight', founder.token, { action: 'restrict', reason: 'x' })).status, 400);
      assert.equal((await call('POST', '/api/founder/communities/review-club/oversight', founder.token, { action: 'restrict', reason: REASON })).status, 200);
      assert.equal((await call('POST', '/api/posts', b.token, { kind: 'text', body: 'hello', communityId: com.id })).status, 403, 'members can no longer post');
      assert.ok(!(await call('GET', '/api/communities', c3.token)).json.items.some((x: any) => x.slug === 'review-club'), 'hidden from discovery');
      assert.equal((await call('POST', '/api/founder/communities/review-club/oversight', founder.token, { action: 'unrestrict', reason: 'Concern resolved with the moderators.' })).status, 200);
      assert.equal((await call('POST', '/api/posts', b.token, { kind: 'text', body: 'hello again', communityId: com.id })).status, 201, 'settings restored');
      assert.equal((await call('POST', '/api/founder/communities/review-club/oversight', founder.token, { action: 'close', reason: 'Closed after a safety review.' })).status, 200);
      assert.equal((await call('GET', '/api/communities/review-club', b.token)).status, 404, 'closed communities are not reachable');
      assert.equal((await call('POST', '/api/founder/communities/review-club/oversight', founder.token, { action: 'reopen', reason: 'Reopened after the review.' })).status, 200);
      assert.equal((await call('GET', '/api/communities/review-club', b.token)).status, 200);
      assert.ok((await call('GET', '/api/founder/audit?action=community.oversight', founder.token)).json.items.length >= 4);
    });

    test('polls: only the Founder drafts/publishes; eligibility, deadline, one final vote, hidden running totals, decision after close', async () => {
      const body = { title: 'Should we add a weekly digest?', description: 'We are considering an optional weekly summary email for members.', eligibility: 'citizens', options: ['Yes', 'No', 'Not sure'] };
      assert.equal((await call('POST', '/api/founder/polls', a.token, body)).status, 403);
      assert.equal((await call('POST', '/api/founder/polls', founder.token, { ...body, options: ['Yes'] })).status, 400);
      assert.equal((await call('POST', '/api/founder/polls', founder.token, { ...body, options: ['Yes', 'yes'] })).status, 409);
      const p = (await call('POST', '/api/founder/polls', founder.token, body)).json.poll; assert.equal(p.state, 'draft');
      assert.equal((await call('GET', `/api/polls/${p.id}`, a.token)).status, 404, 'a draft is invisible to citizens');
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/publish`, founder.token, { closesAt: new Date(t.clock.now().getTime() + 60_000).toISOString() })).status, 409, 'deadline too soon');
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/publish`, founder.token, { closesAt: new Date(t.clock.now().getTime() + 90 * 86400_000).toISOString() })).status, 409, 'deadline too far');
      const closes = new Date(t.clock.now().getTime() + 2 * 3600_000).toISOString();
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/publish`, founder.token, { closesAt: closes })).json.poll.state, 'open');
      assert.equal((await call('GET', '/api/polls', a.token)).json.items.length, 1);
      const yes = (await call('GET', `/api/polls/${p.id}`, a.token)).json.poll.options[0].id;
      assert.equal((await call('POST', `/api/polls/${p.id}/vote`, a.token, { optionId: yes })).status, 200);
      assert.equal((await call('POST', `/api/polls/${p.id}/vote`, a.token, { optionId: yes })).status, 409, 'votes are final');
      const no = (await call('GET', `/api/polls/${p.id}`, b.token)).json.poll.options[1].id; await call('POST', `/api/polls/${p.id}/vote`, b.token, { optionId: no });
      const running = (await call('GET', `/api/polls/${p.id}`, c3.token)).json.poll;
      assert.ok(running.options.every((o: any) => o.votes === null), 'no running tallies while open'); assert.equal(running.turnout.votes, 2);
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/decision`, founder.token, { decision: 'Too early to decide.' })).status, 409);
      t.clock.advance(3 * 3600_000);
      const done = (await call('GET', `/api/polls/${p.id}`, c3.token)).json.poll; assert.equal(done.state, 'closed'); assert.deepEqual(done.options.map((o: any) => o.votes), [1, 1, 0]);
      assert.equal((await call('POST', `/api/polls/${p.id}/vote`, c3.token, { optionId: yes })).status, 409, 'voting closed');
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/decision`, founder.token, { decision: 'We will trial it for a month.' })).json.poll.decision, 'We will trial it for a month.');
      assert.ok(!JSON.stringify((await call('GET', `/api/polls/${p.id}`, a.token)).json).includes(a.userId), 'no voter identity is ever returned');
    });

    test('governance-only and community-only polls are limited to their eligible group', async () => {
      const g = (await call('POST', '/api/founder/polls', founder.token, { title: 'Council-only question', description: 'Only governance members should answer this question.', eligibility: 'governance', options: ['A', 'B'] })).json.poll;
      await call('POST', `/api/founder/polls/${g.id}/publish`, founder.token, { closesAt: new Date(t.clock.now().getTime() + 5 * 3600_000).toISOString() });
      assert.equal((await call('GET', `/api/polls/${g.id}`, a.token)).status, 404, 'citizens cannot even see it');
      const opt = (await call('GET', `/api/polls/${g.id}`, dir.token)).json.poll.options[0].id;
      assert.equal((await call('POST', `/api/polls/${g.id}/vote`, a.token, { optionId: opt })).status, 404);
      assert.equal((await call('POST', `/api/polls/${g.id}/vote`, dir.token, { optionId: opt })).status, 200);
      assert.equal((await call('POST', `/api/polls/${g.id}/vote`, mod.token, { optionId: opt })).status, 404, 'a moderator is not a governance member');
      const cp = (await call('POST', '/api/founder/polls', founder.token, { title: 'Review Club question', description: 'Only members of this community can answer.', eligibility: 'community', communitySlug: 'review-club', options: ['Yes', 'No'] })).json.poll;
      await call('POST', `/api/founder/polls/${cp.id}/publish`, founder.token, { closesAt: new Date(t.clock.now().getTime() + 5 * 3600_000).toISOString() });
      assert.equal((await call('GET', `/api/polls/${cp.id}`, c3.token)).status, 404); assert.equal((await call('GET', `/api/polls/${cp.id}`, b.token)).status, 200);
      assert.equal((await call('POST', `/api/founder/polls/${cp.id}/cancel`, founder.token, { reason: 'Asked in the wrong place.' })).status, 200);
      assert.equal((await call('GET', `/api/polls/${cp.id}`, b.token)).json.poll.state, 'cancelled');
    });
  });
}
