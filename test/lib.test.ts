import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, NAV_GROUPS, TAB_BAR, matchRoute, normalizePath, visibleNav } from '../src/lib/routes';
import { PAGES_FOR_TEST } from './helpers/pages-list';
import { guardRoute } from '../src/lib/guard';
import { validateEmail, validatePassword, validatePost, validateDisplayName, slugHandle, POST_MAX } from '../src/lib/validate';
import { timeAgo, daysUntil } from '../src/lib/time';

test('every nav item resolves to a real route (no dead links)', () => {
  for (const g of NAV_GROUPS) for (const n of g.items) assert.ok(matchRoute(n.path), `nav ${n.id} -> ${n.path}`);
});
test('tab bar items exist in the nav', () => {
  const ids = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)));
  for (const t of TAB_BAR) assert.ok(ids.has(t), t);
});
test('permission-gated nav is hidden without the permission', () => {
  const none = visibleNav(new Set()).flatMap((g) => g.items.map((i) => i.id));
  assert.ok(!none.includes('founder') && !none.includes('moderation'));
  const some = visibleNav(new Set(['founder.console'])).flatMap((g) => g.items.map((i) => i.id));
  assert.ok(some.includes('founder'));
});
test('route params, unknown paths, and uniqueness', () => {
  assert.equal(matchRoute('/nope/nothing/here'), null);
  assert.equal(matchRoute('/communities/study-hall')?.params.slug, 'study-hall');
  assert.equal(matchRoute('/u/ada')?.route.id, 'member');
  assert.equal(new Set(ROUTES.map((r) => r.id)).size, ROUTES.length);
  assert.equal(normalizePath('#/home/'), '/home');
  assert.equal(normalizePath('#/home?x=1'), '/home');
  assert.equal(normalizePath(''), '/');
});
test('every route id has a page component registered', () => {
  for (const r of ROUTES) assert.ok(PAGES_FOR_TEST.includes(r.id), `no page for ${r.id}`);
});
const act = (o: object = {}) => ({ status: 'active', onboarded: true, permissions: new Set<string>(), ...o });
test('guard: signed-out users cannot reach private routes', () => {
  assert.deepEqual(guardRoute(matchRoute('/home'), null), { kind: 'redirect', to: '/signin' });
  assert.equal(guardRoute(matchRoute('/signin'), null).kind, 'render');
});
test('guard: pending eligibility is confined to the eligibility step', () => {
  assert.deepEqual(guardRoute(matchRoute('/home'), act({ status: 'pending_eligibility' })), { kind: 'redirect', to: '/eligibility' });
  assert.equal(guardRoute(matchRoute('/eligibility'), act({ status: 'pending_eligibility' })).kind, 'render');
});
test('guard: onboarding redirects both ways', () => {
  assert.deepEqual(guardRoute(matchRoute('/home'), act({ onboarded: false })), { kind: 'redirect', to: '/onboarding' });
  assert.deepEqual(guardRoute(matchRoute('/onboarding'), act()), { kind: 'redirect', to: '/home' });
  assert.equal(guardRoute(matchRoute('/home'), act()).kind, 'render');
  assert.equal(guardRoute(null, null).kind, 'notfound');
});
test('guard: permission routes are forbidden without the permission (server enforces it independently)', () => {
  assert.equal(guardRoute(matchRoute('/founder'), act()).kind, 'forbidden');
  assert.equal(guardRoute(matchRoute('/founder'), act({ permissions: new Set(['founder.console']) })).kind, 'render');
  assert.equal(guardRoute(matchRoute('/moderation/abc'), act()).kind, 'forbidden');
});
test('guard: suspended accounts only see public landing pages', () => {
  assert.deepEqual(guardRoute(matchRoute('/home'), act({ status: 'suspended' })), { kind: 'redirect', to: '/' });
});
test('validators', () => {
  assert.ok(validateEmail('bad'));
  assert.equal(validateEmail('a@b.co'), undefined);
  assert.ok(validatePassword('short'));
  assert.equal(validatePassword('longenough'), undefined);
  assert.ok(validatePost('   '));
  assert.ok(validatePost('x'.repeat(POST_MAX + 1)));
  assert.equal(validatePost('x'.repeat(POST_MAX)), undefined);
  assert.ok(validateDisplayName('a'));
  assert.match(slugHandle('Ada Okafor'), /^[a-z0-9._]+$/);
});
test('time helpers', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  assert.equal(timeAgo('2026-10-15T11:59:50Z', now), 'just now');
  assert.equal(timeAgo('2026-10-15T11:48:00Z', now), '12m ago');
  assert.equal(timeAgo('2026-10-15T09:00:00Z', now), '3h ago');
  assert.equal(daysUntil('2026-10-18T12:00:00Z', now), 3);
});

import { screenLabel } from '../shared/label-screen';
test('ordinary and edge-case words pass', () => { for (const ok of ['Skyscraper architect', 'Scunthorpe', 'Flame retardant research', 'Analyst', 'Kyoto', 'Class of 2026', 'Poet & carer', 'Nazir']) assert.equal(screenLabel(ok), null, ok); });
test('clear abuse is refused, including simple obfuscation', () => { for (const bad of ['n i g g e r', 'f4gg0t', 'ret@rd', 'k.y.s', 'NAZI', 'you are a whore']) assert.ok(screenLabel(bad), bad); });

