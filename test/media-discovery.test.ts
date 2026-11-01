import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { sessionStatus } from '../shared/media-taxonomy';

describe('watch-along session status (pure)', () => {
  const start = '2026-11-01T18:00:00.000Z'; const at = (m: number) => Date.parse(start) + m * 60_000;
  test('upcoming, live and finished, with a 120-minute default and an explicit length', () => {
    assert.equal(sessionStatus(start, undefined, at(-1)), 'upcoming');
    assert.equal(sessionStatus(start, undefined, at(0)), 'live');
    assert.equal(sessionStatus(start, undefined, at(119)), 'live');
    assert.equal(sessionStatus(start, undefined, at(120)), 'finished');
    assert.equal(sessionStatus(start, 30, at(31)), 'finished');
    assert.equal(sessionStatus(undefined, 30, at(0)), null);
  });
});

for (const dialect of DIALECTS) {
  describe(`media discovery and watch-along [${dialect}]`, () => {
    let t: TestApp; let a: { token: string; userId: string }, b: { token: string; userId: string };
    before(async () => { t = await startTestApp(dialect); a = await t.member('a@example.com', { handle: 'host_a', name: 'Host' }); b = await t.member('b@example.com', { handle: 'viewer_b', name: 'Viewer' }); });
    after(async () => { await t.close(); });
    const post = (body: unknown, tok = a.token) => t.call('POST', '/api/posts', { token: tok, body });
    const feed = (q: string) => t.call('GET', `/api/feed?universe=freeentertainment${q}`, { token: b.token }).then((r) => { assert.equal(r.status, 200); return r.json.items.map((i: any) => i.title) as string[]; });
    const title = (over: Record<string, unknown>, extra: Record<string, unknown> = {}) => post({ kind: 'resource', universe: 'freeentertainment', template: 'recommendation', body: 'Worth your time.', ...extra, meta: { medium: 'Feature film', availability: 'Information only', rating: '4 – really good', spoilers: 'Spoiler-free', ...over } });

    test('titles carry structured metadata and are validated against the taxonomy', async () => {
      assert.equal((await title({ genre: 'Drama', language: 'Korean', country: 'South Korea', year: 2019, animation: 'Not animated' }, { title: 'Parasite-like Drama' })).status, 201);
      assert.equal((await title({ genre: 'Fantasy', language: 'Japanese', country: 'Japan', year: 1997, animation: 'Anime', medium: 'Anime', availability: 'External destination' }, { title: 'Spirit Tale', url: 'https://example.com/watch/1' })).status, 201);
      assert.equal((await title({ genre: 'Documentary-ish' }, { title: 'Bad genre' })).status, 422, 'unknown genre is refused');
      assert.equal((await title({ year: 1700 }, { title: 'Bad year' })).status, 422);
      assert.equal((await title({ availability: 'Free forever, trust me' }, { title: 'Bad availability' })).status, 422);
      assert.equal((await title({}, { title: 'No availability' }).then(() => post({ kind: 'resource', universe: 'freeentertainment', template: 'recommendation', title: 'x', body: 'y', meta: { medium: 'Series', rating: '3 – good', spoilers: 'Spoiler-free' } }))).status, 422, 'availability is required');
    });

    test('filters: format, genre, language, country, year range, availability, title search', async () => {
      assert.deepEqual((await feed('&genre=Drama')).sort(), ['Parasite-like Drama']);
      assert.deepEqual(await feed('&language=Japanese'), ['Spirit Tale']);
      assert.deepEqual(await feed('&country=korea'), ['Parasite-like Drama']);
      assert.deepEqual(await feed('&animation=Anime'), ['Spirit Tale']);
      assert.deepEqual(await feed('&availability=External%20destination'), ['Spirit Tale']);
      assert.deepEqual(await feed('&yfrom=2000'), ['Parasite-like Drama']);
      assert.deepEqual(await feed('&yto=1999'), ['Spirit Tale']);
      assert.deepEqual(await feed('&facet=Anime'), ['Spirit Tale']);
      assert.deepEqual(await feed('&q=spirit'), ['Spirit Tale']);
      assert.deepEqual(await feed('&genre=Drama&language=Japanese'), [], 'filters combine');
    });

    test('watch-along: upcoming, live and finished by the session length; discovering needs no session', async () => {
      const now = Date.now(); const iso = (min: number) => new Date(now + min * 60_000).toISOString();
      const wa = (name: string, startMin: number, minutes?: number) => post({ kind: 'event', universe: 'freeentertainment', template: 'watch-along', title: name, body: 'Join us', startsAt: iso(startMin), meta: { medium: 'Series', availability: 'External destination', ...(minutes ? { minutes } : {}) } });
      for (const r of [await wa('Future night', 600), await wa('Right now', -10), await wa('Long ago', -600), await wa('Short and over', -90, 30)]) assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.deepEqual(await feed('&template=watch-along&when=upcoming'), ['Future night']);
      assert.deepEqual(await feed('&template=watch-along&when=live'), ['Right now']);
      assert.deepEqual((await feed('&template=watch-along&when=finished')).sort(), ['Long ago', 'Short and over']);
      assert.ok(!(await feed('&template=recommendation')).includes('Right now'), 'watch-alongs do not appear among titles');
      assert.equal((await post({ kind: 'event', universe: 'freeentertainment', template: 'watch-along', title: 'No time', body: 'x', meta: { medium: 'Series', availability: 'External destination' } })).status, 422, 'a start time is required');
    });
  });
}

import { SAMPLES } from '../server/seed/universe-content';
import { templateFor, validateMeta } from '../shared/universe-spaces';
describe('demo seed samples stay valid against the templates', () => {
  test('every Universe sample passes its template validation', () => {
    for (const x of SAMPLES) { const tpl = templateFor(x.universe, x.template); assert.ok(tpl, `${x.universe}/${x.template} exists`); const m = validateMeta(tpl!, x.meta as Record<string, unknown>); assert.ok(m.ok, `${x.universe}/${x.template}: ${JSON.stringify(m.errors)}`); }
  });
});
