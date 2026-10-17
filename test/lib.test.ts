import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, NAV, matchRoute, normalizePath } from '../src/lib/routes';
import { guardRoute } from '../src/lib/guard';
import { validateEmail, validatePassword, validatePost, validateDisplayName, slugHandle, POST_MAX } from '../src/lib/validate';
import { timeAgo, daysUntil } from '../src/lib/time';

test('every nav item resolves to a real route', () => {
  for (const n of NAV) assert.ok(matchRoute(n.path), `nav ${n.id} -> ${n.path}`);
});
test('route params and unknown paths', () => {
  assert.equal(matchRoute('/nope/nothing/here'), null);
  assert.ok(ROUTES.length > 5);
  assert.equal(normalizePath('#/home/'), '/home');
  assert.equal(normalizePath('#/home?x=1'), '/home');
  assert.equal(normalizePath(''), '/');
});
test('guard: signed-out users cannot reach private routes', () => {
  const r = guardRoute(matchRoute('/home'), null);
  assert.deepEqual(r, { kind: 'redirect', to: '/' });
});
test('guard: not-onboarded users are sent to onboarding; onboarded users skip it', () => {
  assert.deepEqual(guardRoute(matchRoute('/home'), { onboarded: false }), { kind: 'redirect', to: '/onboarding' });
  assert.deepEqual(guardRoute(matchRoute('/onboarding'), { onboarded: true }), { kind: 'redirect', to: '/home' });
  assert.equal(guardRoute(matchRoute('/home'), { onboarded: true }).kind, 'render');
  assert.equal(guardRoute(null, null).kind, 'notfound');
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
