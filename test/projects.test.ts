import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { UNIVERSE_SPECS } from '../shared/universe-spaces';
import { UNIVERSE_IDS } from '../shared/universes';

test('every Universe has its own Projects space', () => {
  assert.equal(UNIVERSE_SPECS.length, UNIVERSE_IDS.length);
  for (const u of UNIVERSE_SPECS) assert.equal(u.spaces.filter((s) => s.id === 'projects').length, 1, u.id);
});

const base = { title: 'Community garden map', summary: 'Mapping every shared garden in our city so newcomers can find one.', lookingFor: 'A designer and a writer' };

for (const dialect of DIALECTS) {
  describe(`projects per Universe [${dialect}]`, () => {
    let t: TestApp; type U = { token: string; userId: string };
    let o: U, a: U, b: U, c: U, mod: U; let pid = '';
    const notes = async (u: U) => ((await t.call('GET', '/api/notifications', { token: u.token })).json.items as any[]).filter((n) => n.type === 'project');
    const list = async (u: U, uni: string, q = '') => (await t.call('GET', `/api/universes/${uni}/projects${q}`, { token: u.token })).json.items as any[];
    before(async () => {
      t = await startTestApp(dialect, {});
      o = await t.member('o@example.com', { handle: 'owen', name: 'Owen' }); a = await t.member('a@example.com', { handle: 'ada', name: 'Ada' }); b = await t.member('b@example.com', { handle: 'bo', name: 'Bo' }); c = await t.member('c@example.com', { handle: 'cat', name: 'Cat' });
      mod = await t.member('m@example.com', { handle: 'mod', name: 'Mod' }); await t.grantRole(mod.userId, 'moderator');
    });
    after(async () => { await t.close(); });

    test('creating: validated, screened, scoped to a real Universe, capped per owner', async () => {
      assert.equal((await t.call('POST', '/api/universes/nope/projects', { token: o.token, body: base })).status, 404);
      assert.equal((await t.call('POST', '/api/universes/freebuild/projects', { token: o.token, body: { ...base, title: 'x' } })).status, 400);
      assert.equal((await t.call('POST', '/api/universes/freebuild/projects', { token: o.token, body: { ...base, summary: 'a nigger project nobody wants' } })).status, 400);
      const r = await t.call('POST', '/api/universes/freebuild/projects', { token: o.token, body: base }); assert.equal(r.status, 201); pid = r.json.id;
      for (let i = 0; i < 4; i++) assert.equal((await t.call('POST', '/api/universes/freelearn/projects', { token: o.token, body: { ...base, title: `Study group ${i}` } })).status, 201);
      assert.equal((await t.call('POST', '/api/universes/freelearn/projects', { token: o.token, body: base })).status, 409, 'five at once');
    });

    test('each Universe lists only its own projects, with search and my-state', async () => {
      assert.equal((await list(a, 'freebuild')).length, 1); assert.equal((await list(a, 'freelearn')).length, 4); assert.equal((await list(a, 'freework')).length, 0);
      assert.equal((await list(a, 'freebuild', '?q=garden')).length, 1); assert.equal((await list(a, 'freebuild', '?q=zebra')).length, 0);
      assert.equal((await list(o, 'freebuild'))[0].mine, 'owner'); assert.equal((await list(a, 'freebuild'))[0].mine, null);
      assert.equal((await list(a, 'freebuild'))[0].owner.handle, 'owen');
    });

    test('joining: request → owner notified → accept → team; decline; duplicates; own project; full; blocks', async () => {
      assert.equal((await t.call('POST', `/api/projects/${pid}/join`, { token: o.token, body: {} })).status, 409);
      assert.equal((await t.call('POST', `/api/projects/${pid}/join`, { token: a.token, body: { message: 'I design maps for fun.' } })).status, 201);
      assert.equal((await t.call('POST', `/api/projects/${pid}/join`, { token: a.token, body: {} })).status, 409, 'duplicate');
      assert.equal((await notes(o)).length, 1);
      assert.equal((await t.call('GET', `/api/projects/${pid}`, { token: a.token })).json.project.requests.length, 0, 'only the owner sees requests');
      const d = (await t.call('GET', `/api/projects/${pid}`, { token: o.token })).json.project; assert.equal(d.requests.length, 1); assert.equal(d.requests[0].message, 'I design maps for fun.');
      assert.equal((await t.call('POST', `/api/projects/${pid}/requests/${a.userId}`, { token: b.token, body: { decision: 'accept' } })).status, 404, 'only the owner decides');
      assert.equal((await t.call('POST', `/api/projects/${pid}/requests/${a.userId}`, { token: o.token, body: { decision: 'accept' } })).status, 200);
      assert.equal((await notes(a)).length, 1); assert.equal((await list(o, 'freebuild'))[0].members, 2); assert.equal((await list(a, 'freebuild'))[0].mine, 'member');
      await t.call('POST', `/api/projects/${pid}/join`, { token: b.token, body: {} });
      assert.equal((await t.call('POST', `/api/projects/${pid}/requests/${b.userId}`, { token: o.token, body: { decision: 'decline' } })).status, 200);
      assert.equal((await list(b, 'freebuild'))[0].mine, null, 'declined means no trace');
      await t.call('POST', '/api/blocks/owen', { token: c.token });
      assert.equal((await t.call('POST', `/api/projects/${pid}/join`, { token: c.token, body: {} })).status, 404, 'a block hides the project');
      assert.equal((await list(c, 'freebuild')).length, 0);
      assert.equal((await t.call('PATCH', `/api/projects/${pid}`, { token: o.token, body: { maxMembers: 2 } })).status, 200);
      assert.equal((await t.call('POST', `/api/projects/${pid}/join`, { token: b.token, body: {} })).status, 409, 'full');
      assert.equal((await t.call('GET', '/api/projects/not-a-uuid', { token: a.token })).status, 404);
    });

    test('updates: team only, screened, notify the rest of the team; owner can’t leave; members can', async () => {
      assert.equal((await t.call('POST', `/api/projects/${pid}/updates`, { token: b.token, body: { body: 'Hello from outside' } })).status, 403);
      const before = (await notes(o)).length;
      assert.equal((await t.call('POST', `/api/projects/${pid}/updates`, { token: a.token, body: { body: 'Drafted the first map layer.' } })).status, 201);
      assert.equal((await notes(o)).length, before + 1); 
      assert.equal((await t.call('GET', `/api/projects/${pid}`, { token: b.token })).json.project.updates[0].body, 'Drafted the first map layer.');
      assert.equal((await t.call('DELETE', `/api/projects/${pid}/members/${o.userId}`, { token: o.token })).status, 409, 'owner can’t leave');
      assert.equal((await t.call('DELETE', `/api/projects/${pid}/members/${a.userId}`, { token: b.token })).status, 403, 'only owner removes others');
      assert.equal((await t.call('DELETE', `/api/projects/${pid}/members/${a.userId}`, { token: a.token })).status, 200, 'a member can leave');
      assert.equal((await list(a, 'freebuild'))[0].mine, null);
    });

    test('moderators can hide a project; owners are told; hidden ones leave the lists; completed stops joins', async () => {
      assert.equal((await t.call('POST', `/api/projects/${pid}/hide`, { token: a.token, body: { hide: true, note: 'not allowed' } })).status, 403);
      assert.equal((await t.call('POST', `/api/projects/${pid}/hide`, { token: mod.token, body: { hide: true, note: 'Breaks the community rules' } })).status, 200);
      assert.equal((await list(a, 'freebuild')).length, 0); assert.equal((await t.call('GET', `/api/projects/${pid}`, { token: a.token })).status, 404);
      assert.equal((await t.call('GET', `/api/projects/${pid}`, { token: mod.token })).status, 200, 'moderators can still look');
      assert.ok((await t.db.query<any>("SELECT 1 FROM audit_events WHERE action = 'project.hidden'")).length >= 1);
      await t.call('POST', `/api/projects/${pid}/hide`, { token: mod.token, body: { hide: false, note: 'Reviewed and restored' } });
      assert.equal((await t.call('PATCH', `/api/projects/${pid}`, { token: o.token, body: { status: 'completed' } })).status, 200);
      assert.equal((await t.call('POST', `/api/projects/${pid}/join`, { token: b.token, body: {} })).status, 409, 'not open');
      assert.equal((await t.call('DELETE', `/api/projects/${pid}`, { token: a.token })).status, 404, 'only the owner deletes');
      assert.equal((await t.call('DELETE', `/api/projects/${pid}`, { token: o.token })).status, 200); assert.equal((await list(o, 'freebuild')).length, 0);
    });

    test('the Projects notification switch is honoured', async () => {
      await t.call('PATCH', '/api/settings', { token: a.token, body: { notifications: { projects: false } } });
      const { notify } = await import('../server/services/notify');
      assert.equal(await notify(t.db, { userId: a.userId, type: 'project', data: { text: 'x' } }, t.clock.now()), false);
    });
  });
}
