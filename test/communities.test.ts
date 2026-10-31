import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';

for (const dialect of DIALECTS) {
  describe(`community configuration, approval, health and multi-link posts [${dialect}]`, () => {
    let t: TestApp; let owner: { token: string; userId: string }, m1: { token: string; userId: string }, m2: { token: string; userId: string };
    before(async () => { t = await startTestApp(dialect); owner = await t.member('o@example.com', { handle: 'owner', name: 'Owner' }); m1 = await t.member('m1@example.com', { handle: 'member_one', name: 'M1' }); m2 = await t.member('m2@example.com', { handle: 'member_two', name: 'M2' }); });
    after(async () => { await t.close(); });
    const call = (m: string, p: string, tok: string, body?: unknown) => t.call(m, p, { token: tok, body });

    test('a citizen creates a community with settings; discovery filters and unlisted communities work', async () => {
      const r = await call('POST', '/api/communities', owner.token, { name: 'Night Owls', description: 'For people who do their best work after dark.', category: 'Lifestyle', rules: ['Be kind'], settings: { joinPolicy: 'approval', postPolicy: 'members', commentPolicy: 'members', allowLinks: false, discoverable: true, pinnedNote: 'Start here: say hello.' } });
      assert.equal(r.status, 201); const c = r.json.community;
      assert.equal(c.settings.joinPolicy, 'approval'); assert.equal(c.settings.allowLinks, false); assert.equal(c.settings.pinnedNote, 'Start here: say hello.'); assert.equal(c.viewer.role, 'moderator');
      await call('POST', '/api/communities', owner.token, { name: 'Quiet Cellar', description: 'A private corner not shown in discovery.', category: 'Lifestyle', settings: { discoverable: false } });
      const list = (q: string, tok = m1.token) => t.call('GET', `/api/communities${q}`, { token: tok }).then((x) => x.json.items.map((i: any) => i.slug));
      assert.ok((await list('')).includes('night-owls')); assert.ok(!(await list('')).includes('quiet-cellar'), 'unlisted is not discoverable');
      assert.ok((await list('', owner.token)).includes('quiet-cellar'), 'its members still see it');
      assert.ok(!(await list('?open=1')).includes('night-owls'), 'approval-only is excluded by the open filter');
      assert.ok((await list('?sort=new')).includes('night-owls'));
    });

    test('approval-only membership: request, pending state, decision by a moderator, no bypass', async () => {
      const j = await call('POST', '/api/communities/night-owls/join', m1.token); assert.equal(j.json.status, 'pending');
      assert.equal((await t.call('GET', '/api/communities/night-owls', { token: m1.token })).json.community.viewer.joinRequest, 'pending');
      // not a member yet: cannot post
      assert.equal((await call('POST', '/api/posts', m1.token, { kind: 'text', body: 'let me in', communityId: (await t.call('GET', '/api/communities/night-owls', { token: m1.token })).json.community.id })).status, 403);
      // only moderators see or decide requests
      assert.equal((await t.call('GET', '/api/communities/night-owls/requests', { token: m1.token })).status, 403);
      assert.equal((await call('POST', `/api/communities/night-owls/requests/${m1.userId}`, m2.token, { decision: 'approve' })).status, 403);
      const q = await t.call('GET', '/api/communities/night-owls/requests', { token: owner.token }); assert.equal(q.json.items.length, 1); assert.equal(q.json.items[0].handle, 'member_one');
      assert.equal((await call('POST', `/api/communities/night-owls/requests/${m1.userId}`, owner.token, { decision: 'approve' })).status, 200);
      assert.equal((await t.call('GET', '/api/communities/night-owls', { token: m1.token })).json.community.viewer.member, true);
      // decline is final until reopened
      await call('POST', '/api/communities/night-owls/join', m2.token);
      await call('POST', `/api/communities/night-owls/requests/${m2.userId}`, owner.token, { decision: 'decline' });
      assert.equal((await call('POST', '/api/communities/night-owls/join', m2.token)).status, 403);
    });

    test('posting and commenting rights, external-link rule, and multi-link posts', async () => {
      const com = (await t.call('GET', '/api/communities/night-owls', { token: m1.token })).json.community;
      assert.equal((await call('POST', '/api/posts', m1.token, { kind: 'text', body: 'see https://example.com', communityId: com.id, links: ['https://example.com/a'] })).status, 422, 'links not allowed here');
      const ok = await call('POST', '/api/posts', m1.token, { kind: 'text', body: 'hello owls', communityId: com.id }); assert.equal(ok.status, 201);
      // allow links, then multi-link post keeps order, host and de-duplicates the main link
      await call('PATCH', '/api/communities/night-owls/settings', owner.token, { settings: { allowLinks: true } });
      const multi = await call('POST', '/api/posts', m1.token, { kind: 'resource', title: 'Reading list', url: 'https://example.com/main', links: ['https://example.com/main', 'https://news.example.org/x', 'https://news.example.org/x', 'https://docs.example.net/y'], communityId: com.id });
      assert.equal(multi.status, 201); assert.deepEqual(multi.json.post.data.links.map((l: any) => l.host), ['news.example.org', 'docs.example.net']);
      assert.equal((await call('POST', '/api/posts', m1.token, { kind: 'text', body: 'bad', links: ['javascript:alert(1)'] })).status, 400, 'unsafe links are refused');
      assert.equal((await call('POST', '/api/posts', m1.token, { kind: 'text', body: 'too many', links: Array.from({ length: 6 }, (_, i) => `https://e.com/${i}`) })).status, 400);
      // moderators-only posting and commenting, enforced on the server
      await call('PATCH', '/api/communities/night-owls/settings', owner.token, { settings: { postPolicy: 'moderators', commentPolicy: 'moderators' } });
      assert.equal((await call('POST', '/api/posts', m1.token, { kind: 'text', body: 'nope', communityId: com.id })).status, 403);
      assert.equal((await call('POST', `/api/posts/${ok.json.post.id}/comments`, m1.token, { body: 'nope' })).status, 403);
      assert.equal((await call('POST', '/api/posts', owner.token, { kind: 'text', body: 'mods can post', communityId: com.id })).status, 201);
      assert.equal((await call('POST', `/api/posts/${ok.json.post.id}/comments`, owner.token, { body: 'mods can comment' })).status, 201);
      // a non-moderator cannot change settings
      assert.equal((await call('PATCH', '/api/communities/night-owls/settings', m1.token, { settings: { postPolicy: 'members' } })).status, 403);
    });

    test('health indicators are counted from real data, and moderator-only numbers stay hidden from members', async () => {
      const asOwner = (await t.call('GET', '/api/communities/night-owls', { token: owner.token })).json.community.health;
      const asMember = (await t.call('GET', '/api/communities/night-owls', { token: m1.token })).json.community.health;
      assert.ok(asOwner.posts30d >= 3 && asOwner.comments30d >= 1 && asOwner.activePosters30d === 2 && asOwner.memberCount === 2);
      assert.equal(typeof asOwner.pendingJoinRequests, 'number'); assert.equal(asMember.pendingJoinRequests, null); assert.equal(asMember.openReports, null);
      assert.match(asMember.basis, /real posts/);
    });
  });
}
