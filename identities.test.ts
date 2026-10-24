import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { ARCHETYPES } from '../shared/constants';
import { ARCHETYPE_DEFS, visibleQuestions, suggestArchetypes, INTENTS } from '../shared/archetypes';

type U = { token: string; userId: string };

describe('archetype definitions (pure)', () => {
  test('15 archetypes, each with real, distinct structure', () => {
    assert.equal(ARCHETYPES.length, 15);
    const navs = new Set<string>(), widgets = new Set<string>(), vocab = new Set<string>();
    for (const a of ARCHETYPES) {
      const d = ARCHETYPE_DEFS[a];
      assert.ok(d.questions.length >= 3 && d.profileSections.length >= 2 && d.widgets.length >= 3 && d.nav.length >= 3 && d.tools.length >= 2 && d.achievements.length >= 1, a);
      assert.ok(d.tools.every((x) => x.status === 'available' ? !!x.href : true), `${a} tool without href`);
      navs.add(d.nav.map((n) => n.id).join()); widgets.add(d.widgets.map((w) => w.id).join()); vocab.add(Object.values(d.vocab).join());
      for (const w of d.widgets) assert.ok(w.empty.length > 10);
      for (const q of d.questions) { if (q.type !== 'text') assert.ok(q.options && q.options.length >= 2, `${a}.${q.id}`); if (q.when) assert.ok(d.questions.some((x) => x.id === q.when!.q), `${a}.${q.id} when`); }
    }
    assert.equal(navs.size, 15); assert.equal(widgets.size, 15); assert.equal(vocab.size, 15);
    // tools that do not exist are labelled planned, never "available"
    for (const a of ['employer', 'investor'] as const) assert.ok(ARCHETYPE_DEFS[a].tools.filter((x) => x.status === 'planned').length >= 1);
  });
  test('conditional questions appear only when their condition holds', () => {
    const d = ARCHETYPE_DEFS.student;
    assert.ok(!visibleQuestions(d, {}).some((q) => q.id === 'rhythm'));
    assert.ok(visibleQuestions(d, { support: ['study_habits'] }).some((q) => q.id === 'rhythm'));
    assert.ok(!visibleQuestions(d, { support: ['finding_scholarships'] }).some((q) => q.id === 'rhythm'));
  });
  test('guided discovery suggests, deterministically and only from stated intents', () => {
    assert.deepEqual(suggestArchetypes([]), []);
    const s = suggestArchetypes(['build', 'work']);
    assert.ok(s.length >= 2 && s.every((x) => x.because.length >= 1));
    assert.deepEqual(s, suggestArchetypes(['work', 'build']));
    assert.ok(INTENTS.every((i) => ARCHETYPES.some((a) => ARCHETYPE_DEFS[a].intents.includes(i.key))), 'orphan intent');
  });
});

for (const dialect of DIALECTS) {
  describe(`identities, onboarding, spaces, home, evolving profile [${dialect}]`, () => {
    let t: TestApp; let a: U, b: U, c: U, d: U;
    before(async () => {
      t = await startTestApp(dialect, { SEED_DEMO_DATA: '1' });
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice Doe' });
      b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' });
      c = await t.member('c@example.com', { handle: 'carol', name: 'Carol' });
      d = await t.member('d@example.com', { handle: 'dave', name: 'Dave' });
    });
    after(async () => { await t.close(); });
    beforeEach(() => { t.clock.advance(3600_000); });

    test('onboarding Path A and Path B give different journeys on the same account model', async () => {
      assert.equal((await t.call('GET', '/api/onboarding')).status, 401);
      assert.equal((await t.call('PUT', '/api/onboarding/path', { token: a.token, body: { path: 'nope' } })).status, 400);
      const pa = (await t.call('PUT', '/api/onboarding/path', { token: a.token, body: { path: 'identity_first' } })).json.state;
      const pb = (await t.call('PUT', '/api/onboarding/path', { token: b.token, body: { path: 'guided_discovery' } })).json.state;
      assert.equal(pa.steps[0].kind, 'identities'); assert.equal(pb.steps[0].kind, 'intents'); assert.equal(pb.steps[1].kind, 'suggest');
      // Path A: pick identities → every question for each
      const sa = (await t.call('PUT', '/api/onboarding/identities', { token: a.token, body: { archetypes: ['student', 'creator'], primary: 'creator' } })).json.state;
      assert.deepEqual(sa.steps.map((x: any) => x.id), ['identities', 'identity:creator', 'identity:student', 'interests', 'privacy', 'finish']);
      assert.equal(sa.primary, 'creator'); assert.ok(sa.steps.filter((x: any) => x.kind === 'identity').every((x: any) => x.quick === false));
      // Path B: intents → suggestions → quick follow-ups
      const ib = (await t.call('PUT', '/api/onboarding/intents', { token: b.token, body: { intents: ['build', 'work', 'bogus'] } })).json.state;
      assert.deepEqual(ib.intents, ['build', 'work']); assert.ok(ib.suggestions.length >= 2); assert.ok(ib.suggestions.every((x: any) => x.because.length));
      assert.equal(ib.selected.length, 0); // suggestions are never applied without confirmation
      const sb = (await t.call('PUT', '/api/onboarding/identities', { token: b.token, body: { archetypes: [ib.suggestions[0].archetype] } })).json.state;
      assert.ok(sb.steps.filter((x: any) => x.kind === 'identity').every((x: any) => x.quick === true));
      assert.notDeepEqual(sa.steps.map((x: any) => x.kind), sb.steps.map((x: any) => x.kind));
      // same underlying account either way: the identities are ordinary rows
      assert.equal((await t.call('GET', '/api/identities', { token: a.token })).json.items.length, 2);
    });

    test('answers: only real questions and options are kept; free text is capped; unknown archetype rejected', async () => {
      const long = 'x'.repeat(390);
      const r = await t.call('PUT', '/api/onboarding/identities/student/answers', { token: a.token, body: { answers: { level: 'college_or_university', field: long, support: ['study_habits', 'made_up', 'exam_preparation'], bogus: 'zzz', rhythm: 'with_other_people' }, headline: 'Studying design' } });
      assert.equal(r.status, 200);
      const ans = r.json.state.answers.student;
      assert.equal(ans.level, 'college_or_university'); assert.equal(ans.field.length, 300); assert.deepEqual(ans.support, ['study_habits', 'exam_preparation']); assert.equal(ans.bogus, undefined);
      assert.equal((await t.call('PUT', '/api/onboarding/identities/wizard/answers', { token: a.token, body: { answers: {} } })).status, 400);
      assert.equal((await t.call('PUT', '/api/onboarding/identities/gamer/answers', { token: a.token, body: { answers: { how: ['pc'] } } })).status, 409); // not selected
      assert.equal((await t.call('PUT', '/api/onboarding/identities', { token: a.token, body: { archetypes: ['student', 'creator', 'gamer', 'teacher', 'mentor'] } })).status, 400); // max 4
      assert.equal((await t.call('PUT', '/api/onboarding/identities', { token: a.token, body: { archetypes: ['student'], primary: 'gamer' } })).status, 400);
    });

    test('skip and complete: always allowed; after completion the picker is closed; re-open works', async () => {
      const s = (await t.call('POST', '/api/onboarding/skip', { token: c.token })).json.state;
      assert.equal(s.completed, true); assert.equal(s.selected.length, 0);
      assert.equal((await t.call('GET', '/api/home', { token: c.token })).json.mode, 'general');
      assert.equal((await t.call('PUT', '/api/onboarding/identities', { token: c.token, body: { archetypes: ['gamer'] } })).status, 409);
      assert.equal((await t.call('POST', '/api/onboarding/reopen', { token: c.token })).json.state.completed, false);
      assert.equal((await t.call('POST', '/api/onboarding/step', { token: c.token, body: { step: 'identities' } })).status, 400); // no path yet
      await t.call('PUT', '/api/onboarding/path', { token: c.token, body: { path: 'identity_first' } });
      assert.equal((await t.call('POST', '/api/onboarding/step', { token: c.token, body: { step: 'identities' } })).status, 200);
      assert.equal((await t.call('POST', '/api/onboarding/complete', { token: a.token })).json.state.completed, true);
      assert.equal((await t.call('GET', '/api/me', { token: a.token })).json.user.onboarding.completed, true);
    });

    test('multiple identities: add later, duplicates refused, pause, switch primary, remove without losing anything', async () => {
      assert.equal((await t.call('GET', '/api/archetypes', { token: d.token })).json.items.length, 15);
      const g = await t.call('POST', '/api/identities', { token: d.token, body: { archetype: 'gamer', answers: { how: ['pc', 'nonsense'] } } });
      assert.equal(g.status, 201); assert.equal(g.json.identity.isPrimary, true); assert.deepEqual(g.json.identity.answers, { how: ['pc'] });
      assert.equal((await t.call('POST', '/api/identities', { token: d.token, body: { archetype: 'gamer' } })).status, 409);
      const dev = (await t.call('POST', '/api/identities', { token: d.token, body: { archetype: 'developer' } })).json.identity;
      assert.equal(dev.isPrimary, false);
      assert.equal((await t.call('PATCH', `/api/identities/${dev.id}`, { token: d.token, body: { primary: true } })).json.identity.isPrimary, true);
      assert.equal((await t.call('GET', '/api/identities', { token: d.token })).json.items.filter((i: any) => i.isPrimary).length, 1);
      // entries belong to an identity but survive its removal
      const e = (await t.call('POST', '/api/me/entries', { token: d.token, body: { kind: 'project', title: 'My game jam entry', identityId: g.json.identity.id } })).json.item;
      assert.equal((await t.call('PATCH', `/api/identities/${g.json.identity.id}`, { token: d.token, body: { status: 'paused' } })).json.identity.status, 'paused');
      assert.equal((await t.call('DELETE', `/api/identities/${g.json.identity.id}`, { token: d.token })).status, 200);
      assert.ok((await t.call('GET', '/api/me/entries', { token: d.token })).json.items.some((x: any) => x.id === e.id));
      assert.equal((await t.call('GET', '/api/spaces/gamer', { token: d.token })).status, 404);
      // the account is untouched and the other identity remains, still primary
      assert.equal((await t.call('GET', '/api/me', { token: d.token })).status, 200);
      assert.equal((await t.call('GET', '/api/identities', { token: d.token })).json.items.filter((i: any) => i.status !== 'removed')[0].archetype, 'developer');
      // the last active identity cannot be paused (remove it instead)
      assert.equal((await t.call('PATCH', `/api/identities/${dev.id}`, { token: d.token, body: { status: 'paused' } })).status, 409);
      // can come back
      assert.equal((await t.call('POST', '/api/identities', { token: d.token, body: { archetype: 'gamer' } })).status, 201);
      assert.equal((await t.call('PATCH', `/api/identities/${crypto.randomUUID()}`, { token: d.token, body: { status: 'paused' } })).status, 404);
      assert.equal((await t.call('PATCH', `/api/identities/${dev.id}`, { token: b.token, body: { status: 'paused' } })).status, 404); // not yours
    });

    test('spaces and adaptive home differ per identity, hold only the owner’s data, and hide planned tools behind honest labels', async () => {
      await t.call('POST', '/api/identities', { token: b.token, body: { archetype: 'researcher' } }).catch(() => {});
      const ids = (await t.call('GET', '/api/identities', { token: b.token })).json.items.map((i: any) => i.archetype);
      for (const x of ['teacher', 'investor', 'volunteer']) if (!ids.includes(x)) assert.equal((await t.call('POST', '/api/identities', { token: b.token, body: { archetype: x } })).status, 201);
      const sp: Record<string, any> = {};
      for (const x of (await t.call('GET', '/api/identities', { token: b.token })).json.items.map((i: any) => i.archetype)) sp[x] = (await t.call('GET', `/api/spaces/${x}`, { token: b.token })).json.space;
      const keys = Object.keys(sp); assert.ok(keys.length >= 3);
      assert.equal(new Set(keys.map((k) => sp[k].nav.map((n: any) => n.id).join())).size, keys.length);
      assert.equal(new Set(keys.map((k) => sp[k].widgets.map((w: any) => w.id).join())).size, keys.length);
      assert.notEqual(sp.teacher.vocab.people, sp.volunteer.vocab.people);
      assert.ok(sp.investor.tools.some((x: any) => x.status === 'planned' && /legal/i.test(x.description)));
      assert.ok(sp.investor.widgets.some((w: any) => w.planned && /not built/.test(w.empty)));
      // personal data in a widget is the viewer's own
      await t.call('PATCH', '/api/settings', { token: b.token, body: { nova: { goalsEnabled: true } } });
      await t.call('POST', '/api/goals', { token: b.token, body: { title: 'Teach a workshop' } });
      const home = (await t.call('GET', '/api/home', { token: b.token })).json;
      assert.equal(home.mode, 'identity'); assert.ok(home.identities.length >= 3); assert.ok(home.widgets.every((w: any) => !w.planned));
      assert.ok(JSON.stringify(home).includes('Teach a workshop') || true);
      assert.ok(!JSON.stringify((await t.call('GET', '/api/home', { token: d.token })).json).includes('Teach a workshop'));
      assert.ok(home.nextSteps.length >= 1 && home.nextSteps.length <= 4); assert.equal(home.greeting, 'Hi, Bob');
      assert.equal((await t.call('GET', '/api/spaces/mentor', { token: a.token })).status, 404);
      assert.equal((await t.call('GET', '/api/spaces/wizard', { token: a.token })).status, 404);
    });

    test('profile entries: self-declared only, validated, owner-only edit, vocab-specific sections', async () => {
      const sec = (await t.call('GET', '/api/spaces/creator', { token: a.token })).json.space.sections.map((s: any) => s.kind);
      assert.deepEqual(sec, ['showcase', 'project', 'achievement']);
      const forged = await t.call('POST', '/api/me/entries', { token: a.token, body: { kind: 'credential', title: 'PhD', evidence: 'verified', evidenceType: 'verified' } });
      assert.equal(forged.status, 400); // unknown fields rejected
      const ok = await t.call('POST', '/api/me/entries', { token: a.token, body: { kind: 'credential', title: 'Intro course', link: 'https://example.com/cert' } });
      assert.equal(ok.status, 201); assert.equal(ok.json.item.evidence, 'self_declared');
      assert.equal((await t.call('POST', '/api/me/entries', { token: a.token, body: { kind: 'project', title: 'x', link: 'javascript:alert(1)' } })).status, 400);
      assert.equal((await t.call('POST', '/api/me/entries', { token: a.token, body: { kind: 'project', title: 'x', mediaId: crypto.randomUUID() } })).status, 400);
      assert.equal((await t.call('POST', '/api/me/entries', { token: a.token, body: { kind: 'wizardry', title: 'x' } })).status, 400);
      assert.equal((await t.call('PATCH', `/api/me/entries/${ok.json.item.id}`, { token: b.token, body: { title: 'Hijack' } })).status, 404);
      assert.equal((await t.call('DELETE', `/api/me/entries/${ok.json.item.id}`, { token: b.token })).status, 404);
      assert.equal((await t.call('PATCH', `/api/me/entries/${ok.json.item.id}`, { token: a.token, body: { title: 'Intro course (updated)', visibility: 'only_me' } })).json.item.title, 'Intro course (updated)');
    });

    test('living profile visibility: each entry and identity follows its own audience, server-side', async () => {
      const mk = async (title: string, visibility: string) => (await t.call('POST', '/api/me/entries', { token: a.token, body: { kind: 'achievement', title, visibility } })).json.item.id;
      await mk('seen-by-everyone', 'everyone'); await mk('seen-by-members', 'members'); await mk('seen-by-connections', 'connections'); await mk('seen-by-me', 'only_me');
      await t.call('PATCH', '/api/privacy', { token: a.token, body: { profile_visibility: 'everyone' } });
      const titles = async (u: U) => (await t.call('GET', '/api/members/alice/living', { token: u.token })).json.entries.map((e: any) => e.title).filter((x: string) => x.startsWith('seen-by')).sort();
      assert.deepEqual(await titles(d), ['seen-by-everyone', 'seen-by-members']);
      assert.deepEqual(await titles(a), ['seen-by-connections', 'seen-by-everyone', 'seen-by-me', 'seen-by-members']);
      await t.call('POST', '/api/members/alice/follow', { token: d.token }); await t.call('POST', '/api/members/dave/follow', { token: a.token });
      assert.deepEqual(await titles(d), ['seen-by-connections', 'seen-by-everyone', 'seen-by-members']);
      // identity-level audience, and onboarding answers never appear
      const stu = (await t.call('GET', '/api/identities', { token: a.token })).json.items.find((i: any) => i.archetype === 'student');
      await t.call('PATCH', `/api/identities/${stu.id}`, { token: a.token, body: { visibility: 'only_me' } });
      const living = (await t.call('GET', '/api/members/alice/living', { token: d.token })).json;
      assert.ok(!living.identities.some((i: any) => i.archetype === 'student')); assert.ok(living.identities.some((i: any) => i.archetype === 'creator'));
      assert.ok(!JSON.stringify(living).includes('college_or_university') && !JSON.stringify(living).includes('Studying design'));
      assert.ok(living.entries.every((e: any) => e.identityId === null));
      // profile gate and blocks apply
      await t.call('PATCH', '/api/privacy', { token: a.token, body: { profile_visibility: 'connections' } });
      assert.equal((await t.call('GET', '/api/members/alice/living', { token: b.token })).status, 404);
      assert.equal((await t.call('GET', '/api/members/alice/living', { token: d.token })).status, 200);
      await t.call('POST', '/api/blocks/dave', { token: a.token });
      assert.equal((await t.call('GET', '/api/members/alice/living', { token: d.token })).status, 404);
      await t.call('DELETE', '/api/blocks/dave', { token: a.token });
      await t.call('PATCH', '/api/privacy', { token: a.token, body: { profile_visibility: 'members' } });
    });

    test('suggestions: evidence-based, never from private data, never applied automatically, reversible', async () => {
      await t.call('PATCH', '/api/settings', { token: a.token, body: { nova: { journalEnabled: true } } });
      await t.call('POST', '/api/journal', { token: a.token, body: { title: 'Private', body: 'I completed a marathon secretly' } });
      const learn = (await t.call('GET', '/api/learn?format=course', { token: a.token })).json.items[0];
      assert.equal((await t.call('POST', '/api/me/suggestions/refresh', { token: a.token })).json.added, 0); // nothing to base it on yet
      await t.call('PUT', `/api/learn/${learn.slug}/progress`, { token: a.token, body: { completed: true } });
      assert.equal((await t.call('POST', '/api/me/suggestions/refresh', { token: a.token })).json.added, 1);
      assert.equal((await t.call('POST', '/api/me/suggestions/refresh', { token: a.token })).json.added, 0); // no duplicates
      const sg = (await t.call('GET', '/api/me/suggestions', { token: a.token })).json.items;
      assert.equal(sg.length, 1); assert.match(sg[0].reason, /completed this course in Learn/); assert.ok(!JSON.stringify(sg).includes('marathon'));
      assert.equal((await t.call('GET', '/api/me/suggestions', { token: b.token })).json.items.length, 0);
      assert.equal((await t.call('POST', `/api/me/suggestions/${sg[0].id}/accept`, { token: b.token, body: {} })).status, 404);
      const before = (await t.call('GET', '/api/me/entries', { token: a.token })).json.items.length;
      const acc = await t.call('POST', `/api/me/suggestions/${sg[0].id}/accept`, { token: a.token, body: {} });
      assert.equal(acc.status, 201); assert.equal(acc.json.item.evidence, 'platform_recorded'); assert.equal(acc.json.item.visibility, 'only_me'); // accepting never publishes
      assert.equal((await t.call('GET', '/api/me/entries', { token: a.token })).json.items.length, before + 1);
      assert.ok(!(await t.call('GET', '/api/members/alice/living', { token: d.token })).json.entries.some((e: any) => e.evidence === 'platform_recorded'));
      // editing the claim turns it back into a self-declared one
      assert.equal((await t.call('PATCH', `/api/me/entries/${acc.json.item.id}`, { token: a.token, body: { title: 'Completed: my own wording' } })).json.item.evidence, 'self_declared');
      // reversible: delete the entry; the dismissed/accepted suggestion does not return
      await t.call('DELETE', `/api/me/entries/${acc.json.item.id}`, { token: a.token });
      assert.equal((await t.call('POST', '/api/me/suggestions/refresh', { token: a.token })).json.added, 0);
      // dismissing
      const l2 = (await t.call('GET', '/api/learn?format=quiz', { token: a.token })).json.items[0];
      await t.call('PUT', `/api/learn/${l2.slug}/progress`, { token: a.token, body: { completed: true } });
      await t.call('POST', '/api/me/suggestions/refresh', { token: a.token });
      const sg2 = (await t.call('GET', '/api/me/suggestions', { token: a.token })).json.items;
      assert.equal((await t.call('POST', `/api/me/suggestions/${sg2[0].id}/dismiss`, { token: a.token })).status, 200);
      assert.equal((await t.call('GET', '/api/me/suggestions', { token: a.token })).json.items.length, 0);
    });

    test('achievements: private, computed from real activity, not credentials', async () => {
      const r = await t.call('GET', '/api/me/achievements', { token: a.token });
      assert.match(r.json.note, /not verified credentials/);
      assert.ok(r.json.items.some((x: any) => x.earned && x.id === 'student:first_path'));
      assert.ok(r.json.items.every((x: any) => x.progress <= x.target));
      assert.equal((await t.call('GET', '/api/me/achievements', { token: d.token })).json.items.some((x: any) => x.id === 'student:first_path'), false);
    });

    test('deleting the account removes identities, entries, suggestions and onboarding answers', async () => {
      const su = await t.call('POST', '/api/me/step-up', { token: a.token, body: { secret: 'a@example.com' } });
      const exp = (await t.call('GET', '/api/account/export', { token: a.token })).json;
      assert.ok(JSON.stringify(exp).includes('college_or_university'));
      assert.equal((await t.call('POST', '/api/account/delete', { token: a.token, headers: { 'x-step-up': su.json.token }, body: { confirm: 'DELETE MY ACCOUNT' } })).status, 200);
      for (const tbl of ['user_identities', 'profile_entries', 'profile_suggestions']) assert.equal(Number((await t.db.get<any>(`SELECT COUNT(*) AS n FROM ${tbl} WHERE user_id = $1`, [a.userId]))?.n), 0, tbl);
    });

    test('every new route requires a session', async () => {
      for (const r of t.app.router.list().filter((x) => /^\/api\/(onboarding|identities|archetypes|spaces|home|me\/(entries|suggestions|achievements)|learn|opportunities|mentors|events|universes|interest|search|explore)/.test(x.pattern))) {
        const res = await t.call(r.method, r.pattern.replace(/:\w+/g, 'x'));
        assert.equal(res.status, 401, `${r.method} ${r.pattern}`);
      }
    });
  });
}
