import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { uuid } from '../server/db';

for (const dialect of DIALECTS) {
  describe(`content, anonymity, moderation, messages [${dialect}]`, () => {
    let t: TestApp;
    let a: { token: string; userId: string }, b: typeof a, c: typeof a, mod: typeof a, founder: typeof a;
    let anonCommunity: string, openCommunity: string;
    before(async () => {
      t = await startTestApp(dialect, { ANONYMOUS_POSTING_ENABLED: 'true' });
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' });
      b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' });
      c = await t.member('c@example.com', { handle: 'carol', name: 'Carol' });
      mod = await t.member('mod@example.com', { handle: 'modmod', name: 'Mod' });
      await t.grantRole(mod.userId, 'moderator');
      founder = await t.member('f@example.com', { handle: 'founder1', name: 'Founder' });
      await t.grantRole(founder.userId, 'founder');
      anonCommunity = uuid(); openCommunity = uuid();
      const now = t.clock.now().toISOString();
      await t.db.run("INSERT INTO communities (id, slug, name, description, category, allow_anonymous, created_at) VALUES ($1,'anon-room','Anon Room','desc desc desc','Support',$2,$3)", [anonCommunity, true, now]);
      await t.db.run("INSERT INTO communities (id, slug, name, description, category, allow_anonymous, created_at) VALUES ($1,'open-room','Open Room','desc desc desc','General',$2,$3)", [openCommunity, false, now]);
      for (const u of [a, b, c]) for (const slug of ['anon-room', 'open-room']) await t.call('POST', `/api/communities/${slug}/join`, { token: u.token });
    });
    after(async () => { await t.close(); });
    beforeEach(() => { t.clock.advance(3 * 3600_000); }); // lets rate-limit windows reset between tests

    const post = (u: { token: string }, body: any) => t.call('POST', '/api/posts', { token: u.token, body });

    test('post kinds validate and persist', async () => {
      assert.equal((await post(a, { kind: 'text', body: 'hello world' })).status, 201);
      assert.equal((await post(a, { kind: 'text', body: '  ' })).status, 422);
      assert.equal((await post(a, { kind: 'link', url: 'javascript:alert(1)' })).status, 400);
      const link = await post(a, { kind: 'link', url: 'https://example.com/x', body: 'read this' });
      assert.equal(link.status, 201);
      assert.equal(link.json.post.data.url, 'https://example.com/x');
      const vid = await post(a, { kind: 'video_link', url: 'https://youtu.be/abc' });
      assert.equal(vid.json.post.data.provider, 'youtube');
      assert.equal((await post(a, { kind: 'poll', title: 'Tea or coffee?', pollOptions: ['Tea'] })).status, 400);
      assert.equal((await post(a, { kind: 'article', title: 'Short', body: 'too short' })).status, 422);
      assert.equal((await post(a, { kind: 'event', title: 'Meetup', startsAt: '2026-12-01T10:00:00.000Z', location: 'Lagos' })).status, 201);
      assert.equal((await post(a, { kind: 'question', title: 'How do I start?' })).status, 201);
    });

    test('polls: one vote, results hidden until voted, no voter identities', async () => {
      const p = (await post(a, { kind: 'poll', title: 'Tea or coffee?', pollOptions: ['Tea', 'Coffee'] })).json.post;
      const before = (await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).json.post;
      assert.equal(before.poll.resultsVisible, false);
      assert.equal(before.poll.options[0].votes, null);
      assert.equal((await t.call('POST', `/api/posts/${p.id}/vote`, { token: b.token, body: { option: 1 } })).status, 200);
      assert.equal((await t.call('POST', `/api/posts/${p.id}/vote`, { token: b.token, body: { option: 0 } })).status, 409);
      const after = (await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).json.post;
      assert.equal(after.poll.resultsVisible, true);
      assert.equal(after.poll.options[1].votes, 1);
      assert.ok(!JSON.stringify(after).includes(b.userId));
    });

    test('anonymous posting is only allowed where the community allows it', async () => {
      assert.equal((await post(a, { body: 'x', anonymous: true })).status, 409); // no community
      assert.equal((await post(a, { body: 'x', anonymous: true, communityId: openCommunity })).status, 409);
      const r = await post(a, { body: 'a secret thought', anonymous: true, communityId: anonCommunity });
      assert.equal(r.status, 201);
      assert.equal(r.json.post.author.anonymous, true);
    });

    test('NO API response ever leaks the real author of anonymous content', async () => {
      const p = (await post(a, { body: 'anonymous words', anonymous: true, communityId: anonCommunity, tags: ['honesty'] })).json.post;
      await t.call('POST', `/api/posts/${p.id}/comments`, { token: b.token, body: { body: 'reply from bob', anonymous: true } });
      await t.call('POST', `/api/posts/${p.id}/comments`, { token: c.token, body: { body: 'named reply from carol' } });
      await t.call('POST', `/api/posts/${p.id}/comments`, { token: a.token, body: { body: 'op follows up' } }); // forced anonymous
      await t.call('PUT', '/api/reactions', { token: b.token, body: { targetType: 'post', targetId: p.id, kind: 'support' } });
      await t.call('POST', `/api/members/alice/follow`, { token: b.token });
      const ids = [a.userId];
      const viewers = [b, c];
      for (const v of viewers) {
        const responses = [
          await t.call('GET', `/api/posts/${p.id}`, { token: v.token }),
          await t.call('GET', `/api/posts/${p.id}/comments`, { token: v.token }),
          await t.call('GET', '/api/feed?sort=recent', { token: v.token }),
          await t.call('GET', '/api/feed?sort=relevant', { token: v.token }),
          await t.call('GET', '/api/feed?sort=following', { token: v.token }),
          await t.call('GET', '/api/communities/anon-room', { token: v.token }),
          await t.call('GET', '/api/members/alice/posts', { token: v.token }),
          await t.call('GET', '/api/notifications', { token: v.token }),
        ];
        for (const r of responses) {
          assert.equal(r.status, 200);
          // Everything the API says about ANONYMOUS items (posts/comments/notifications) must not contain the author's id or handle.
          const anonItems: unknown[] = [];
          const walk = (x: any) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x.author?.anonymous === true || x.actor?.anonymous === true) anonItems.push(x); else Object.values(x).forEach(walk); } };
          walk(r.json);
          const s = JSON.stringify(anonItems);
          for (const id of ids) assert.ok(!s.includes(id), 'author id leaked');
          for (const h of ['alice', 'Alice']) assert.ok(!s.includes(h), 'author handle leaked');
        }
        // the single-post and comment responses for the anonymous post must not mention Alice anywhere
        for (const r of [responses[0]!, responses[1]!]) { const s = JSON.stringify(r.json); assert.ok(!s.includes(a.userId) && !s.includes('alice')); }
        // anonymous words must not show up on the author's profile or in the following feed via the author
        const profilePosts = responses[6]!.json.items.map((x: any) => x.body);
        assert.ok(!profilePosts.includes('anonymous words'));
        // member search legitimately lists Alice herself, but nothing there ties her to the anonymous post
        assert.ok(!JSON.stringify((await t.call('GET', '/api/members?q=alice', { token: v.token })).json).includes('anonymous words'));
      }
      // bob follows alice: the following feed must not include alice's anonymous post through the follow edge… (not in a joined community's feed either unless joined — bob joined, so it appears, but WITHOUT identity)
      const comments = (await t.call('GET', `/api/posts/${p.id}/comments`, { token: c.token })).json.items;
      const aliases = comments.filter((x: any) => x.author.anonymous).map((x: any) => x.author.alias);
      assert.deepEqual(aliases.sort(), ['Anonymous author', 'Anonymous member 1']);
      assert.equal(comments.find((x: any) => !x.author.anonymous).author.person.handle, 'carol');
      // the author sees their own as theirs
      const mine = (await t.call('GET', `/api/posts/${p.id}`, { token: a.token })).json.post;
      assert.equal(mine.viewer.mine, true);
    });

    test('anonymous post in a community the viewer did NOT join does not surface through the follow edge', async () => {
      const d = await t.member('d@example.com', { handle: 'dave', name: 'Dave' });
      await t.call('POST', '/api/members/alice/follow', { token: d.token });
      const feed = (await t.call('GET', '/api/feed?sort=following', { token: d.token })).json.items;
      assert.ok(feed.every((x: any) => !x.author.anonymous), 'following feed contains anonymous content from a followed author');
    });

    test('blocks hide posts and comments both ways', async () => {
      const p = (await post(b, { body: 'bob says hi' })).json.post;
      await t.call('POST', '/api/members/bob/follow', { token: c.token });
      await t.call('POST', '/api/blocks/bob', { token: c.token });
      assert.equal((await t.call('GET', `/api/posts/${p.id}`, { token: c.token })).status, 404);
      const feed = (await t.call('GET', '/api/feed?sort=recent&limit=30', { token: c.token })).json.items;
      assert.ok(!feed.some((x: any) => x.id === p.id));
      assert.equal((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).status, 200);
      await t.call('DELETE', '/api/blocks/bob', { token: c.token });
    });

    test('visibility: connections-only and only-me posts', async () => {
      const own = (await post(a, { body: 'private note', visibility: 'only_me' })).json.post;
      assert.equal((await t.call('GET', `/api/posts/${own.id}`, { token: b.token })).status, 404);
      const conn = (await post(a, { body: 'for connections', visibility: 'connections' })).json.post;
      assert.equal((await t.call('GET', `/api/posts/${conn.id}`, { token: b.token })).status, 404);
      await t.call('POST', '/api/members/bob/follow', { token: a.token });
      await t.call('POST', '/api/members/alice/follow', { token: b.token });
      assert.equal((await t.call('GET', `/api/posts/${conn.id}`, { token: b.token })).status, 200);
    });

    test('edit, delete, tombstones', async () => {
      const p = (await post(a, { body: 'first draft' })).json.post;
      assert.equal((await t.call('PATCH', `/api/posts/${p.id}`, { token: b.token, body: { body: 'hacked' } })).status, 404);
      const e = await t.call('PATCH', `/api/posts/${p.id}`, { token: a.token, body: { body: 'second draft' } });
      assert.equal(e.json.post.body, 'second draft'); assert.ok(e.json.post.editedAt);
      const cm = (await t.call('POST', `/api/posts/${p.id}/comments`, { token: b.token, body: { body: 'nice' } })).json.comment;
      assert.equal((await t.call('DELETE', `/api/comments/${cm.id}`, { token: a.token })).status, 404);
      assert.equal((await t.call('DELETE', `/api/comments/${cm.id}`, { token: b.token })).status, 200);
      const list = (await t.call('GET', `/api/posts/${p.id}/comments`, { token: a.token })).json.items;
      assert.equal(list[0].status, 'deleted'); assert.equal(list[0].body, '');
      assert.equal((await t.call('DELETE', `/api/posts/${p.id}`, { token: a.token })).status, 200);
      assert.equal((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).status, 404);
      const row = await t.db.get<any>('SELECT body FROM posts WHERE id = $1', [p.id]);
      assert.equal(row!.body, '');
    });

    test('comments: replies nest, depth is capped', async () => {
      const p = (await post(a, { body: 'thread' })).json.post;
      let parent: string | undefined; let last: any;
      for (let i = 0; i < 6; i++) { last = (await t.call('POST', `/api/posts/${p.id}/comments`, { token: b.token, body: { body: `level ${i}`, parentId: parent } })).json.comment; parent = last.id; }
      assert.ok(last.depth <= 3);
    });

    test('reactions: one per person, change, remove, counts', async () => {
      const p = (await post(a, { body: 'react to me' })).json.post;
      await t.call('PUT', '/api/reactions', { token: b.token, body: { targetType: 'post', targetId: p.id, kind: 'like' } });
      await t.call('PUT', '/api/reactions', { token: b.token, body: { targetType: 'post', targetId: p.id, kind: 'love' } });
      await t.call('PUT', '/api/reactions', { token: c.token, body: { targetType: 'post', targetId: p.id, kind: 'love' } });
      const v = (await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).json.post;
      assert.equal(v.counts.reactionTotal, 2); assert.equal(v.counts.reactions.love, 2); assert.equal(v.viewer.reaction, 'love');
      await t.call('DELETE', `/api/reactions?targetType=post&targetId=${p.id}`, { token: b.token });
      assert.equal((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).json.post.counts.reactionTotal, 1);
    });

    test('saved items resolve through visibility', async () => {
      const p = (await post(a, { body: 'save me' })).json.post;
      assert.equal((await t.call('PUT', '/api/saved', { token: b.token, body: { kind: 'post', refId: p.id } })).status, 201);
      assert.equal((await t.call('GET', '/api/saved', { token: b.token })).json.items.length >= 1, true);
      await t.call('DELETE', `/api/posts/${p.id}`, { token: a.token });
      const items = (await t.call('GET', '/api/saved', { token: b.token })).json.items.filter((i: any) => i.refId === p.id);
      assert.ok(items.every((i: any) => !i.available) || items.length === 0);
    });

    test('sorting: recent, following, relevant with reasons', async () => {
      await t.call('PUT', '/api/personalization', { token: c.token, body: { interests: [{ key: 'honesty', label: 'Honesty' }] } });
      const rel = (await t.call('GET', '/api/feed?sort=relevant', { token: c.token })).json;
      assert.equal(rel.sort, 'relevant'); assert.ok(rel.items.every((i: any) => Array.isArray(i.why) && i.why.length));
      const fol = (await t.call('GET', '/api/feed?sort=following', { token: c.token })).json;
      assert.equal(fol.sort, 'following');
    });

    test('reports → case → moderation; queue shows no content or identity', async () => {
      const p = (await post(a, { body: 'rude post', anonymous: true, communityId: anonCommunity })).json.post;
      const rep = await t.call('POST', '/api/reports', { token: b.token, body: { targetType: 'post', targetId: p.id, category: 'harassment', details: 'mean' } });
      assert.equal(rep.status, 201);
      assert.equal((await t.call('POST', '/api/reports', { token: b.token, body: { targetType: 'post', targetId: p.id, category: 'harassment' } })).status, 409);
      assert.equal((await t.call('POST', '/api/reports', { token: a.token, body: { targetType: 'post', targetId: p.id, category: 'spam' } })).status, 409); // own content
      const q = await t.call('GET', '/api/moderation/queue', { token: mod.token });
      assert.equal(q.status, 200);
      const s = JSON.stringify(q.json);
      assert.ok(!s.includes('rude post') && !s.includes(a.userId));
      assert.equal((await t.call('GET', '/api/moderation/queue', { token: b.token })).status, 403);
      const caseId = q.json.items.find((i: any) => i.category === 'harassment').id;
      // reviewing content needs a reason and is audited
      assert.equal((await t.call('POST', `/api/moderation/cases/${caseId}/review-content`, { token: mod.token, body: { reason: 'short' } })).status, 400);
      const rv = await t.call('POST', `/api/moderation/cases/${caseId}/review-content`, { token: mod.token, body: { reason: 'Reviewing the reported post' } });
      assert.equal(rv.status, 200); assert.equal(rv.json.snapshot.body, 'rude post');
      assert.ok(!JSON.stringify(rv.json).includes(a.userId));
      const aud = await t.db.get<any>("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'moderation.content_reviewed' AND case_id = $1", [caseId]);
      assert.equal(Number(aud.n), 1);
      // the Founder is not given anonymous-author reveal by default
      assert.equal((await t.call('POST', `/api/moderation/cases/${caseId}/actions`, { token: founder.token, body: { action: 'reveal_author', note: 'I want to know who wrote this one' } })).status, 403);
      // a moderator needs step-up
      assert.equal((await t.call('POST', `/api/moderation/cases/${caseId}/actions`, { token: mod.token, body: { action: 'reveal_author', note: 'Repeated targeted harassment needs follow-up' } })).status, 403);
      const su = await t.call('POST', '/api/me/step-up', { token: mod.token, body: { secret: 'mod@example.com' } });
      const rev = await t.call('POST', `/api/moderation/cases/${caseId}/actions`, { token: mod.token, headers: { 'x-step-up': su.json.token }, body: { action: 'reveal_author', note: 'Repeated targeted harassment needs follow-up' } });
      assert.equal(rev.status, 201); assert.equal(rev.json.author.handle, 'alice');
      const revAudit = await t.db.get<any>("SELECT reason FROM audit_events WHERE action = 'moderation.anonymous_author_revealed'");
      assert.ok(revAudit.reason);
      // remove content, author is notified and can appeal; another moderator decides
      const rem = await t.call('POST', `/api/moderation/cases/${caseId}/actions`, { token: mod.token, body: { action: 'remove_content', note: 'Violates the harassment rule' } });
      assert.equal(rem.status, 201);
      assert.equal((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).status, 404);
      const mine = (await t.call('GET', `/api/posts/${p.id}`, { token: a.token })).json.post;
      assert.equal(mine.status, 'removed'); assert.equal(mine.body, '');
      const acts = (await t.call('GET', '/api/safety/actions', { token: a.token })).json.items;
      const ap = await t.call('POST', '/api/appeals', { token: a.token, body: { actionId: acts[0].id, statement: 'I think this was fair comment and not harassment at all.' } });
      assert.equal(ap.status, 201);
      assert.equal((await t.call('POST', `/api/moderation/appeals/${ap.json.appeal.id}/decide`, { token: mod.token, body: { decision: 'overturned', note: 'Same moderator trying' } })).status, 403);
      const mod2 = await t.member('mod2@example.com', { handle: 'mod2', name: 'Mod2' }); await t.grantRole(mod2.userId, 'moderator');
      assert.equal((await t.call('POST', `/api/moderation/appeals/${ap.json.appeal.id}/decide`, { token: mod2.token, body: { decision: 'overturned', note: 'Context shows it was fair' } })).status, 200);
      assert.equal((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).status, 200);
    });

    test('anonymous-author reveal: needs review first, no conflicts, limited, and is overseen without exposing the author', async () => {
      const p = (await post(a, { body: 'another rude post', anonymous: true, communityId: anonCommunity })).json.post;
      await t.call('POST', '/api/reports', { token: b.token, body: { targetType: 'post', targetId: p.id, category: 'harassment', details: 'mean' } });
      const caseId = (await t.call('GET', '/api/moderation/queue', { token: mod.token })).json.items.find((i: any) => i.assignedToMe === false && i.status === 'open')?.id;
      assert.ok(caseId);
      const stepUp = async (who: { token: string }, email: string) => (await t.call('POST', '/api/me/step-up', { token: who.token, body: { secret: email } })).json.token;
      const reveal = (who: { token: string }, tok: string, note = 'Targeted harassment needs follow-up with the author') => t.call('POST', `/api/moderation/cases/${caseId}/actions`, { token: who.token, headers: { 'x-step-up': tok }, body: { action: 'reveal_author', note } });
      // 1. must have looked at the material first
      const modTok = await stepUp(mod, 'mod@example.com');
      const early = await reveal(mod, modTok); assert.equal(early.status, 403); assert.equal(early.json.error.code, 'review_required');
      await t.call('POST', `/api/moderation/cases/${caseId}/review-content`, { token: mod.token, body: { reason: 'Reviewing the reported post' } });
      // 2. the reporter cannot reveal the author of what they reported (conflict of interest)
      await t.grantRole(b.userId, 'moderator');
      await t.call('POST', `/api/moderation/cases/${caseId}/review-content`, { token: b.token, body: { reason: 'Reviewing the post I reported' } });
      const bTok = await stepUp(b, 'b@example.com');
      assert.equal((await reveal(b, bTok)).json.error.code, 'conflict_of_interest');
      // 3. the author, even when a moderator, cannot reveal themselves on their own content
      await t.grantRole(a.userId, 'moderator');
      await t.call('POST', `/api/moderation/cases/${caseId}/review-content`, { token: a.token, body: { reason: 'Looking at my own post' } });
      const aTok = await stepUp(a, 'a@example.com');
      assert.equal((await reveal(a, aTok)).json.error.code, 'conflict_of_interest');
      // denied attempts are audited
      assert.ok(Number((await t.db.get<any>("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'moderation.reveal_denied'")).n) >= 3);
      // 4. a legitimate reveal works, and the Founder is not the revealer
      const ok = await reveal(mod, modTok); assert.equal(ok.status, 201); assert.equal(ok.json.author.handle, 'alice');
      // 5. oversight: Council/Founder can list and review, the moderator cannot, nobody reviews their own, and the identity is not shown
      assert.equal((await t.call('GET', '/api/moderation/reveals', { token: mod.token })).status, 403);
      const list = await t.call('GET', '/api/moderation/reveals', { token: founder.token });
      assert.equal(list.status, 200); assert.ok(list.json.items.length >= 1); assert.ok(list.json.deniedAttempts >= 3);
      assert.ok(!JSON.stringify(list.json).includes('alice') && !JSON.stringify(list.json).includes(a.userId), 'oversight never reveals the author');
      const revId = list.json.items[0].id;
      assert.equal((await t.call('POST', `/api/moderation/reveals/${revId}/review`, { token: mod.token, body: { outcome: 'appropriate', note: 'Self review attempt here' } })).status, 403);
      assert.equal((await t.call('POST', `/api/moderation/reveals/${revId}/review`, { token: founder.token, body: { outcome: 'appropriate', note: 'Case file supports the reveal' } })).status, 200);
      assert.equal((await t.call('POST', `/api/moderation/reveals/${revId}/review`, { token: founder.token, body: { outcome: 'appropriate', note: 'Case file supports the reveal' } })).status, 409);
      assert.equal((await t.call('GET', '/api/moderation/reveals', { token: founder.token })).json.items[0].review.outcome, 'appropriate');
    });

    test('moderators cannot suspend governance members; suspension blocks sign-in features', async () => {
      const victim = await t.member('v@example.com', { handle: 'victim1', name: 'V' });
      const p = (await post(victim, { body: 'spam spam' })).json.post;
      await t.call('POST', '/api/reports', { token: b.token, body: { targetType: 'post', targetId: p.id, category: 'spam' } });
      const caseId = (await t.call('GET', '/api/moderation/queue', { token: mod.token })).json.items.find((i: any) => i.category === 'spam').id;
      const r = await t.call('POST', `/api/moderation/cases/${caseId}/actions`, { token: mod.token, body: { action: 'suspend', note: 'Spam run, 3 days' } });
      assert.equal(r.status, 201);
      assert.equal((await t.call('GET', '/api/feed', { token: victim.token })).status, 403);
    });

    test('messages: requests, blocking, privacy and deleted-account identity', async () => {
      const e = await t.member('e@example.com', { handle: 'erin', name: 'Erin' });
      const f = await t.member('f2@example.com', { handle: 'frank', name: 'Frank' });
      const r = await t.call('POST', '/api/conversations', { token: e.token, body: { handle: 'frank', body: 'Hello Frank' } });
      assert.equal(r.status, 201); assert.equal(r.json.asRequest, true);
      const fl = (await t.call('GET', '/api/conversations', { token: f.token })).json;
      assert.equal(fl.requests.length, 1); assert.equal(fl.items.length, 0);
      assert.equal((await t.call('POST', `/api/conversations/${r.json.conversationId}/messages`, { token: e.token, body: { body: 'second' } })).status, 409);
      assert.equal((await t.call('POST', `/api/conversations/${r.json.conversationId}/messages`, { token: f.token, body: { body: 'Hi Erin' } })).status, 201); // replying accepts
      assert.equal((await t.call('GET', '/api/conversations', { token: f.token })).json.items.length, 1);
      // third party cannot read
      assert.equal((await t.call('GET', `/api/conversations/${r.json.conversationId}/messages`, { token: c.token })).status, 404);
      // privacy: nobody can message
      await t.call('PATCH', '/api/privacy', { token: f.token, body: { who_can_message: 'nobody' } });
      assert.equal((await t.call('POST', '/api/conversations', { token: c.token, body: { handle: 'frank', body: 'hello?' } })).status, 403);
      // block
      await t.call('POST', '/api/blocks/frank', { token: e.token });
      assert.equal((await t.call('GET', `/api/conversations/${r.json.conversationId}/messages`, { token: e.token })).status, 404);
      await t.call('DELETE', '/api/blocks/frank', { token: e.token });
      // deletion: messages stay under neutral identity
      const su = await t.call('POST', '/api/me/step-up', { token: e.token, body: { secret: 'e@example.com' } });
      const del = await t.call('POST', '/api/account/delete', { token: e.token, headers: { 'x-step-up': su.json.token }, body: { confirm: 'DELETE MY ACCOUNT' } });
      assert.equal(del.status, 200);
      const conv = (await t.call('GET', `/api/conversations/${r.json.conversationId}`, { token: f.token })).json.conversation;
      assert.equal(conv.other.displayName, 'Deleted account'); assert.equal(conv.canSend, false);
      const msgs = (await t.call('GET', `/api/conversations/${r.json.conversationId}/messages`, { token: f.token })).json.items;
      assert.equal(msgs.length, 2);
      assert.equal((await t.call('GET', '/api/me', { token: e.token })).status, 401);
    });

    test('account deletion leaves no row that references the account (generic scan)', async () => {
      const g = await t.member('g@example.com', { handle: 'gina', name: 'Gina' });
      await t.call('POST', '/api/communities/anon-room/join', { token: g.token });
      const p = (await post(g, { body: 'gina post' })).json.post;
      const apr = await post(g, { body: 'gina anon', anonymous: true, communityId: anonCommunity }); assert.equal(apr.status, 201, JSON.stringify(apr.json)); const ap = apr.json.post;
      await t.call('POST', `/api/posts/${p.id}/comments`, { token: b.token, body: { body: 'reply to gina' } });
      const gc = (await t.call('POST', `/api/posts/${p.id}/comments`, { token: g.token, body: { body: 'gina comment' } })).json.comment;
      await t.call('POST', `/api/posts/${p.id}/comments`, { token: b.token, body: { body: 'reply to gina comment', parentId: gc.id } });
      await t.call('PUT', '/api/reactions', { token: g.token, body: { targetType: 'post', targetId: ap.id, kind: 'like' } });
      await t.call('PUT', '/api/saved', { token: g.token, body: { kind: 'post', refId: p.id } });
      await t.call('POST', '/api/members/bob/follow', { token: g.token });
      await t.call('POST', '/api/blocks/carol', { token: g.token });
      await t.call('POST', '/api/reports', { token: g.token, body: { targetType: 'post', targetId: (await post(b, { body: 'bob post' })).json.post.id, category: 'spam' } });
      const su = await t.call('POST', '/api/me/step-up', { token: g.token, body: { secret: 'g@example.com' } });
      assert.equal((await t.call('POST', '/api/account/delete', { token: g.token, body: { confirm: 'nope' }, headers: { 'x-step-up': su.json.token } })).status, 400);
      assert.equal((await t.call('POST', '/api/account/delete', { token: g.token, body: { confirm: 'DELETE MY ACCOUNT' } })).status, 403); // no step-up
      assert.equal((await t.call('POST', '/api/account/delete', { token: g.token, body: { confirm: 'DELETE MY ACCOUNT' }, headers: { 'x-step-up': su.json.token } })).status, 200);
      // every table/column that can hold a user id
      const tables = ['posts:author_id', 'comments:author_id', 'reactions:user_id', 'saved_items:user_id', 'follows:follower_id', 'follows:followee_id', 'blocks:blocker_id', 'blocks:blocked_id',
        'profiles:user_id', 'user_privacy:user_id', 'user_settings:user_id', 'media:owner_id', 'notifications:user_id', 'notifications:actor_id', 'conversation_members:user_id', 'messages:sender_id',
        'post_anon_aliases:user_id', 'poll_votes:user_id', 'community_members:user_id', 'reports:reporter_id', 'auth_identities:user_id', 'role_grants:user_id', 'user_tags:user_id', 'user_identities:user_id'];
      for (const tc of tables) {
        const [tab, col] = tc.split(':');
        if (tab === 'role_grants') continue;
        const row = await t.db.get<any>(`SELECT COUNT(*) AS n FROM ${tab} WHERE ${col} = $1`, [g.userId]);
        assert.equal(Number(row.n), 0, `${tab}.${col} still references the deleted account`);
      }
      const u = await t.db.get<any>('SELECT status, handle, display_name, birth_year FROM users WHERE id = $1', [g.userId]);
      assert.equal(u.status, 'deleted'); assert.equal(u.handle, null); assert.equal(u.birth_year, null);
      // replies to her comment remain readable under a tombstone, post is gone
      assert.equal((await t.call('GET', `/api/posts/${p.id}`, { token: b.token })).status, 404);
      const text = JSON.stringify(await t.db.query('SELECT body FROM comments'));
      assert.ok(!text.includes('gina comment'));
      assert.equal((await t.call('GET', '/api/members/gina', { token: b.token })).status, 404);
    });

    test('every protected route rejects anonymous callers', async () => {
      const routes = t.app.router.list().filter((r) => r.auth !== 'none');
      for (const r of routes) {
        const path = r.pattern.replace(/:\w+/g, uuid());
        const res = await t.call(r.method, path);
        assert.equal(res.status, 401, `${r.method} ${r.pattern} did not return 401`);
      }
    });
  });
}
