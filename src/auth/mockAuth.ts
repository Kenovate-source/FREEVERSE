/**
 * MOCK AUTHENTICATION — Stage 1 only.
 * Accounts live in this browser's storage. Passwords are validated for shape and then discarded:
 * they are never stored, hashed, or sent anywhere. This is NOT a production auth integration (see ADR-003:
 * production uses a managed auth provider). Age attestation is captured here in the same shape the
 * architecture reserves (method + status + timestamp) so a real provider can replace this module.
 */
import type { Account } from '../types';
import { readJSON, type KV } from '../lib/kv';
import { slugHandle, validateDisplayName, validateEmail, validatePassword, type FieldErrors } from '../lib/validate';

const ACCOUNTS_KEY = 'fv.mock.accounts';
const SESSION_KEY = 'fv.mock.session';

export const DEMO_EMAIL = 'ada.demo@example.com';

export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; errors: FieldErrors<'email' | 'password' | 'displayName' | 'attestation' | 'form'> };

function loadAccounts(kv: KV): Account[] {
  return readJSON<Account[]>(kv, ACCOUNTS_KEY, []);
}
function saveAccounts(kv: KV, accounts: Account[]) {
  kv.set(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export interface SignUpInput {
  displayName: string;
  email: string;
  password: string;
  /** "I confirm I am 18 or older." Required. */
  attestedAdult: boolean;
}

export function signUp(kv: KV, input: SignUpInput, now: Date = new Date()): AuthResult {
  const errors: FieldErrors<'email' | 'password' | 'displayName' | 'attestation' | 'form'> = {};
  const nameErr = validateDisplayName(input.displayName);
  const emailErr = validateEmail(input.email);
  const pwErr = validatePassword(input.password);
  if (nameErr) errors.displayName = nameErr;
  if (emailErr) errors.email = emailErr;
  if (pwErr) errors.password = pwErr;
  if (!input.attestedAdult) {
    errors.attestation = 'FREEVERSE is for people aged 18 and over. You need to confirm this to create an account.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const accounts = loadAccounts(kv);
  const email = input.email.trim().toLowerCase();
  if (accounts.some((a) => a.email === email)) {
    return { ok: false, errors: { email: 'A mock account with this email already exists in this browser. Try signing in.' } };
  }
  let handle = slugHandle(input.displayName);
  const taken = new Set(accounts.map((a) => a.handle));
  if (taken.has(handle) || RESERVED_HANDLES.has(handle)) {
    let n = 2;
    while (taken.has(`${handle}${n}`) || RESERVED_HANDLES.has(`${handle}${n}`)) n++;
    handle = `${handle}${n}`;
  }
  const iso = now.toISOString();
  const account: Account = {
    id: `u_${accounts.length + 1}_${now.getTime().toString(36)}`,
    email,
    handle,
    displayName: input.displayName.trim(),
    bio: '',
    interests: [],
    goals: [],
    hue: accounts.length % 6,
    onboarded: false,
    age: { method: 'self_attestation', status: 'attested', attestedAt: iso },
    createdAt: iso,
  };
  saveAccounts(kv, [...accounts, account]);
  kv.set(SESSION_KEY, account.id);
  return { ok: true, account };
}

export function signIn(kv: KV, emailInput: string, password: string): AuthResult {
  const errors: FieldErrors<'email' | 'password' | 'displayName' | 'attestation' | 'form'> = {};
  const emailErr = validateEmail(emailInput);
  if (emailErr) errors.email = emailErr;
  if (!password) errors.password = 'Enter your password.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const email = emailInput.trim().toLowerCase();
  const account = loadAccounts(kv).find((a) => a.email === email);
  if (!account) {
    return { ok: false, errors: { form: 'No mock account with that email exists in this browser. Create one, or continue with the demo account.' } };
  }
  // Mock: the password is intentionally not verified. Real verification is the managed provider's job (ADR-003).
  kv.set(SESSION_KEY, account.id);
  return { ok: true, account };
}

export function signInDemo(kv: KV, now: Date = new Date()): Account {
  const accounts = loadAccounts(kv);
  let demo = accounts.find((a) => a.email === DEMO_EMAIL);
  if (!demo) {
    demo = {
      id: 'u_demo_ada',
      email: DEMO_EMAIL,
      handle: 'ada.okafor',
      displayName: 'Ada Okafor',
      bio: 'Product design student. Learning to build things people actually need. Always up for a good book recommendation.',
      interests: ['Design', 'Writing', 'Career growth'],
      goals: ['Land a first internship', 'Find a mentor'],
      hue: 0,
      onboarded: true,
      age: { method: 'self_attestation', status: 'attested', attestedAt: now.toISOString() },
      createdAt: now.toISOString(),
      isDemo: true,
    };
    saveAccounts(kv, [...accounts, demo]);
  }
  kv.set(SESSION_KEY, demo.id);
  return demo;
}

export function signOut(kv: KV) {
  kv.remove(SESSION_KEY);
}

export function getSession(kv: KV): Account | null {
  const id = kv.get(SESSION_KEY);
  if (!id) return null;
  return loadAccounts(kv).find((a) => a.id === id) ?? null;
}

export interface ProfilePatch {
  displayName?: string;
  bio?: string;
  interests?: string[];
  goals?: string[];
  hue?: number;
  onboarded?: boolean;
}

export function updateAccount(kv: KV, id: string, patch: ProfilePatch): { ok: true; account: Account } | { ok: false; error: string } {
  const accounts = loadAccounts(kv);
  const idx = accounts.findIndex((a) => a.id === id);
  const current = accounts[idx];
  if (!current) return { ok: false, error: 'Account not found.' };
  if (patch.displayName !== undefined) {
    const err = validateDisplayName(patch.displayName);
    if (err) return { ok: false, error: err };
  }
  if (patch.bio !== undefined && patch.bio.length > 280) return { ok: false, error: 'Bio can be up to 280 characters.' };
  const next: Account = {
    ...current,
    ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() } : {}),
    ...(patch.bio !== undefined ? { bio: patch.bio.trim() } : {}),
    ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
    ...(patch.goals !== undefined ? { goals: patch.goals } : {}),
    ...(patch.hue !== undefined ? { hue: patch.hue } : {}),
    ...(patch.onboarded !== undefined ? { onboarded: patch.onboarded } : {}),
  };
  accounts[idx] = next;
  saveAccounts(kv, accounts);
  return { ok: true, account: next };
}

/** Handles used by seeded mock members, so a new mock account can't impersonate one. */
export const RESERVED_HANDLES = new Set([
  'ada.okafor', 'tunde.bello', 'mira.chen', 'sam.rivera', 'priya.nair', 'kofi.mensah', 'lena.fischer', 'freeverse', 'nova', 'admin', 'moderator',
]);
