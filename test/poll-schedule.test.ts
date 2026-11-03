import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { runMaintenance } from '../server/jobs';

for (const dialect of DIALECTS) {
  describe(`poll scheduling and notifications [${dialect}]`, () => {
    let t: TestApp; let a: { token: string; userId: string }, b: typeof a, quiet: typeof a, founder: typeof a;
    before(async () => {
      t = await startTestApp(dialect, {});
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' }); b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' });
      quiet = await t.member('q@example.com', { handle: 'quiet', name: 'Quiet' });
      founder = await t.member('f@example.com', { handle: 'fnd', name: 'Fnd' }); await t.grantRole(founder.userId, 'founder');
      assert.equal((await t.call('PATCH', '/api/settings', { token: quiet.token, body: { notifications: { system: false } } })).status, 200);
    });
    after(async () => { await t.close(); });
    const call = (m: string, p: string, tok: string, body?: unknown) => t.call(m, p, { token: tok, body });
    const hour = 3600_000;
    const poll = async (title: string) => (await call('POST', '/api/founder/polls', founder.token, { title, description: 'A poll to test scheduling and notices.', eligibility: 'citizens', options: ['Yes', 'No'] })).json.poll;
    const notices = async (who: typeof a) => (await call('GET', '/api/notifications', who.token)).json.items.map((i: any) => i.text as string);

    test('publishing now tells eligible people once and respects their notification settings', async () => {
      const p = await poll('Immediate poll topic');
      const r = await call('POST', `/api/founder/polls/${p.id}/publish`, founder.token, { closesAt: new Date(t.clock.now().getTime() + 5 * hour).toISOString() });
      assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.poll.state, 'open');
      assert.ok((await notices(a)).some((x: string) => x.includes('Immediate poll topic') && x.includes('open')), 'alice was told');
      const before = (await notices(a)).length;
      await runMaintenance(t.s); await runMaintenance(t.s);
      assert.equal((await notices(a)).length, before, 'the sweep never sends the same notice twice');
    });
    test('a scheduled poll is invisible and unvotable until it opens, then opens by itself and is announced', async () => {
      const p = await poll('Later poll topic');
      const now = t.clock.now().getTime();
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/publish`, founder.token, { opensAt: new Date(now + 60_000).toISOString(), closesAt: new Date(now + 8 * hour).toISOString() })).status, 409, 'must be at least 5 minutes ahead');
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/publish`, founder.token, { opensAt: new Date(now + 40 * 86400_000).toISOString(), closesAt: new Date(now + 41 * 86400_000).toISOString() })).status, 409, 'too far ahead');
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/publish`, founder.token, { opensAt: new Date(now + 2 * hour).toISOString(), closesAt: new Date(now + 2 * hour + 600_000).toISOString() })).status, 409, 'must stay open at least an hour after opening');
      const r = await call('POST', `/api/founder/polls/${p.id}/publish`, founder.token, { opensAt: new Date(now + 2 * hour).toISOString(), closesAt: new Date(now + 8 * hour).toISOString() });
      assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.poll.state, 'scheduled');
      assert.equal((await call('GET', `/api/polls/${p.id}`, a.token)).status, 404, 'hidden from citizens');
      assert.ok(!(await call('GET', '/api/polls', a.token)).json.items.some((x: any) => x.id === p.id), 'not in the list');
      assert.equal((await call('POST', `/api/polls/${p.id}/vote`, a.token, { optionId: r.json.poll.options[0].id })).status, 404, 'cannot vote early');
      assert.ok(!(await notices(a)).some((x: string) => x.includes('Later poll topic')), 'no announcement before it opens');
      assert.equal((await call('GET', '/api/founder/polls', founder.token)).json.items.find((x: any) => x.id === p.id).state, 'scheduled');
      t.clock.advance(2 * hour + 60_000); await runMaintenance(t.s);
      assert.equal((await call('GET', `/api/polls/${p.id}`, a.token)).json.poll.state, 'open');
      assert.ok((await notices(a)).some((x: string) => x.includes('Later poll topic')), 'announced once open');
      assert.equal((await call('POST', `/api/polls/${p.id}/vote`, a.token, { optionId: r.json.poll.options[0].id })).status, 200, 'can vote now');
      // closing and the recorded decision are announced too, once each
      t.clock.advance(7 * hour); const s1 = await runMaintenance(t.s); assert.ok(s1.polls.closed >= 1);
      assert.ok((await notices(a)).some((x: string) => x.includes('Voting has closed') && x.includes('Later poll topic')));
      const n = (await notices(a)).length; await runMaintenance(t.s); assert.equal((await notices(a)).length, n);
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/decision`, founder.token, { decision: 'We will go ahead because most said yes.' })).status, 200);
      assert.ok((await notices(b)).some((x: string) => x.includes('decision was recorded')));
    });
    test('a person who turned system notices off is not sent poll notices', async () => {
      const settings = await call('GET', '/api/settings', quiet.token);
      assert.equal(settings.json.settings.notifications.system, false, 'precondition: muted');
      assert.ok((await notices(a)).some((x: string) => x.includes('Immediate poll topic')), 'precondition: others were told');
      assert.ok(!(await notices(quiet)).some((x: string) => x.toLowerCase().includes('poll')), 'the muted person got none');
    });
    test('a scheduled poll can be cancelled before it opens, and then never opens or notifies', async () => {
      const p = await poll('Cancelled early topic'); const now = t.clock.now().getTime();
      await call('POST', `/api/founder/polls/${p.id}/publish`, founder.token, { opensAt: new Date(now + 2 * hour).toISOString(), closesAt: new Date(now + 9 * hour).toISOString() });
      assert.equal((await call('POST', `/api/founder/polls/${p.id}/cancel`, founder.token, { reason: 'Changed our minds about this.' })).status, 200);
      t.clock.advance(3 * hour); await runMaintenance(t.s);
      assert.ok(!(await notices(a)).some((x: string) => x.includes('Cancelled early topic')));
    });
  });
}

import { aiApi } from '../server/ai/runtime';
for (const dialect of DIALECTS) {
  describe(`poll drafting with Founder AI [${dialect}]`, () => {
    // NOTE: the model is STUBBED here. These tests prove what the server does with a model's text (parse, validate, refuse, never save).
    // They say nothing about the quality of a real model's wording.
    let t: TestApp; let a: { token: string; userId: string }, founder: typeof a; const realCall = aiApi.callAgent; let out = ''; let calls = 0;
    before(async () => {
      t = await startTestApp(dialect, {});
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice' });
      founder = await t.member('f@example.com', { handle: 'fnd', name: 'Fnd' }); await t.grantRole(founder.userId, 'founder');
      aiApi.callAgent = (async () => { calls++; return { text: out, agentId: 'founder-ai', provider: 'stub', model: 'stub', mode: 'live', capability: 'text.chat' }; }) as typeof aiApi.callAgent;
    });
    after(async () => { aiApi.callAgent = realCall; await t.close(); });
    const assist = (tok: string, topic = 'Whether to add a weekly digest for members') => t.call('POST', '/api/founder/polls/draft-assist', { token: tok, body: { topic } });
    const drafts = async () => (await t.call('GET', '/api/founder/polls', { token: founder.token })).json.items.length;

    test('in demo mode it refuses honestly and never calls a model', async () => {
      assert.equal(t.s.ai.provider, 'demo');
      const r = await assist(founder.token); assert.equal(r.status, 409); assert.equal(r.json.error?.code ?? r.json.code, 'ai_unavailable'); assert.equal(calls, 0);
    });
    test('with a model: staff only; valid output is returned as an unsaved, labelled draft with duplicate options removed', async () => {
      (t.s.ai as any).provider = 'anthropic';
      out = 'Here you go:\n{"title":"Should we add a weekly digest?","description":"A short optional summary of what happened this week.","options":["Yes","No","yes","Only if it is opt-in"]}';
      assert.equal((await assist(a.token)).status, 403);
      const before = await drafts(); const r = await assist(founder.token);
      assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.saved, false); assert.deepEqual(r.json.draft.options, ['Yes', 'No', 'Only if it is opt-in']);
      assert.match(r.json.label, /Nothing has been saved/); assert.equal(await drafts(), before, 'no poll was created');
    });
    test('unusable model output is refused rather than patched up or saved', async () => {
      for (const bad of ['I think you should ask about digests.', '{"title":"x","description":"short","options":["a"]}', '{"title":"A fine question here","description":"Enough background text.","options":["Same","same"]}']) {
        out = bad; const r = await assist(founder.token); assert.equal(r.status, 502, bad); assert.equal(r.json.error?.code ?? r.json.code, 'ai_bad_output');
      }
      assert.equal(await drafts(), 0);
    });
  });
}
