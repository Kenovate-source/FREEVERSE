import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, type TestApp } from './helpers/app';
import { ARCHETYPES } from '../shared/constants';
import { ROUTES, matchRoute } from '../src/lib/routes';
import { PAGES } from '../src/pages';

// Every in-app link the product can emit must land on a real, mounted page. This is the guard against the
// "We couldn't find that page" class of defect.
const path = (h: string) => h.replace(/^#/, '').split('?')[0]!.split('#')[0]!;
const resolves = (h: string) => { const m = matchRoute(path(h)); return !!m && !!(PAGES as Record<string, unknown>)[m.route.id]; };

describe('route integrity', () => {
  test('every route has a mounted page and every page has a route', () => {
    for (const r of ROUTES) assert.ok((PAGES as Record<string, unknown>)[r.id], `route ${r.id} has no page`);
    for (const k of Object.keys(PAGES)) assert.ok(ROUTES.some((r) => r.id === k), `page ${k} has no route`);
  });
  let t: TestApp;
  before(async () => { t = await startTestApp('sqlite', { SEED_DEMO_DATA: '1' }); });
  after(async () => { await t.close(); });
  test('every link in every identity space resolves (nav, tools, widgets, widget items)', async () => {
    // a person may hold up to 8 identities, so spread the 15 across two accounts
    const users = [await t.member('route0@example.com', { handle: 'router0', name: 'Route A' }), await t.member('route1@example.com', { handle: 'router1', name: 'Route B' })];
    for (const [i, a] of ARCHETYPES.entries()) {
      const u = users[i < 8 ? 0 : 1]!;
      const add = await t.call('POST', '/api/identities', { token: u.token, body: { archetype: a } });
      assert.ok([200, 201].includes(add.status), `add ${a}: ${add.status}`);
      const r = await t.call('GET', `/api/spaces/${a}`, { token: u.token });
      assert.equal(r.status, 200, `space ${a}`);
      const s = r.json.space; const links: string[] = [];
      for (const n of s.nav) links.push(n.href);
      for (const x of s.tools) if (x.href) links.push(x.href);
      for (const w of s.widgets) { if (w.href) links.push(w.href); for (const i of w.items) if (i.href) links.push(i.href); }
      for (const l of links) assert.ok(resolves(l), `${a}: ${l} does not resolve`);
      // planned tools with no href go to /soon/:id, which must also resolve
      for (const x of s.tools) if (!x.href) assert.ok(resolves(`/soon/${x.id}`), `${a}: /soon/${x.id}`);
    }
  });
});
