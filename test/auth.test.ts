import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV } from '../src/lib/kv';
import { signUp, signIn, signInDemo, getSession, signOut, DEMO_EMAIL } from '../src/auth/mockAuth';

const good = { displayName: 'Test Person', email: 'Test@Example.com', password: 'password123', attestedAdult: true };

test('sign-up requires the 18+ attestation', () => {
  const kv = memoryKV();
  const r = signUp(kv, { ...good, attestedAdult: false });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.attestation);
  assert.equal(getSession(kv), null);
});
test('sign-up records attestation in a pluggable shape and never stores the password', () => {
  const kv = memoryKV();
  const now = new Date('2026-10-15T10:00:00Z');
  const r = signUp(kv, good, now);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.account.age, { method: 'self_attestation', status: 'attested', attestedAt: now.toISOString() });
  assert.equal(r.account.email, 'test@example.com');
  assert.equal(r.account.onboarded, false);
  const dump = JSON.stringify([kv.get('fv.mock.accounts'), kv.get('fv.mock.session')]);
  assert.ok(!dump.includes('password123'));
  assert.equal(getSession(kv)?.id, r.account.id);
});
test('duplicate email rejected; handles are de-duplicated; reserved handles avoided', () => {
  const kv = memoryKV();
  assert.equal(signUp(kv, good).ok, true);
  assert.equal(signUp(kv, good).ok, false);
  const a = signUp(kv, { ...good, email: 'x@example.com', displayName: 'Test Person' });
  assert.ok(a.ok && a.account.handle !== 'test.person');
  const admin = signUp(kv, { ...good, email: 'y@example.com', displayName: 'Admin' });
  assert.ok(admin.ok && admin.account.handle !== 'admin');
});
test('sign-in: unknown email fails clearly; known email works; sign-out clears session', () => {
  const kv = memoryKV();
  assert.equal(signIn(kv, 'nobody@example.com', 'whatever1').ok, false);
  signUp(kv, good);
  signOut(kv);
  assert.equal(getSession(kv), null);
  assert.equal(signIn(kv, 'test@example.com', 'x').ok, true);
  assert.equal(signIn(kv, 'test@example.com', '').ok, false);
});
test('demo account', () => {
  const kv = memoryKV();
  const d = signInDemo(kv);
  assert.equal(d.email, DEMO_EMAIL);
  assert.equal(d.onboarded, true);
  assert.equal(signInDemo(kv).id, d.id);
});
