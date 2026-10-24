import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { LEGAL_DOCS, LEGAL_DOC_IDS, placeholderCount } from '../shared/legal';
import { LEGAL_VERSION, LEGAL_STATUS } from '../shared/constants';
import { ROUTES } from '../src/lib/routes';

test('legal drafts: present, labelled draft, placeholders explicit, consistent with app behaviour', () => {
  assert.equal(LEGAL_STATUS, 'draft');
  for (const id of LEGAL_DOC_IDS) {
    const { md } = LEGAL_DOCS[id];
    assert.match(md, /DRAFT/); assert.match(md, /not (?:legal advice|final)/i);
    assert.ok(placeholderCount(id) >= 3, `${id} lists placeholders`);
    assert.ok(md.length > 1500, `${id} is substantive`);
  }
  const t = LEGAL_DOCS.terms.md.toLowerCase();
  for (const w of ['eligib', 'account', 'acceptable use', 'safety', 'your content', 'intellectual property', 'moderation', 'appeal', 'termination', 'service limits']) assert.ok(t.includes(w), `terms cover ${w}`);
  const p = LEGAL_DOCS.privacy.md.toLowerCase();
  for (const w of ['what we collect', 'anonymous posting', 'ai interactions', 'third-party', 'retention', 'security', 'your rights', 'complaints', 'international']) assert.ok(p.includes(w), `privacy covers ${w}`);
  const all = LEGAL_DOC_IDS.map((i) => LEGAL_DOCS[i].md).join('\n');
  assert.doesNotMatch(all.replace(/does not describe members as "age verified"/gi, ""), /age[- ]verified/i);
  assert.match(LEGAL_DOCS.privacy.md, /off by default/i);
  assert.match(LEGAL_DOCS.terms.md + LEGAL_DOCS.privacy.md, /does \*\*not\*\* automatically have this power/);
});
test('legal routes are public, always reachable and the pages are registered', () => {
  for (const [id, path] of [['terms', '/terms'], ['privacy', '/privacy'], ['rules', '/rules']] as const) {
    const r = ROUTES.find((x) => x.id === id); assert.ok(r); assert.equal(r.path, path); assert.ok(r.public && r.always);
  }
  const idx = readFileSync(new URL('../src/pages/index.tsx', import.meta.url), 'utf8');
  assert.match(idx, /terms: w\(TermsPage\)/); assert.match(idx, /privacy: w\(PrivacyPage\)/); assert.match(idx, /rules: w\(RulesPage\)/);
});
test('legal links are reachable from landing, sign-up, eligibility and settings', () => {
  const read = (f: string) => readFileSync(new URL(`../src/pages/${f}`, import.meta.url), 'utf8');
  for (const f of ['landing.tsx', 'auth.tsx', 'settings.tsx']) { const s = read(f); for (const p of ['/terms', '/privacy', '/rules']) assert.ok(s.includes(`"${p}"`), `${f} links ${p}`); }
});

for (const dialect of DIALECTS) describe(`legal acceptance [${dialect}]`, () => {
  let t: TestApp;
  before(async () => { t = await startTestApp(dialect); });
  after(async () => { await t.close(); });
  test('config exposes the draft status and version', async () => {
    const r = await t.call('GET', '/api/config'); assert.equal(r.status, 200);
    assert.equal(r.json.legal.status, 'draft'); assert.equal(r.json.legal.version, LEGAL_VERSION); assert.deepEqual([...r.json.legal.documents].sort(), [...LEGAL_DOC_IDS].sort());
  });
  test('eligibility requires acceptance and records version + timestamp for every document', async () => {
    const { token, userId } = await t.register('legal@example.com');
    const bad = await t.call('POST', '/api/me/eligibility', { token, body: { birthMonth: 3, birthDay: 14, birthYear: 2003, acceptTerms: false, confirmSelfDeclared: true } });
    assert.equal(bad.status, 400);
    assert.equal((await t.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM legal_acceptances WHERE user_id = $1', [userId]))!.n, 0);
    const ok = await t.call('POST', '/api/me/eligibility', { token, body: { birthMonth: 3, birthDay: 14, birthYear: 2003, acceptTerms: true, confirmSelfDeclared: true } });
    assert.equal(ok.status, 200);
    const rows = await t.db.query<{ document: string; version: string; accepted_at: string }>('SELECT document, version, accepted_at FROM legal_acceptances WHERE user_id = $1', [userId]);
    assert.deepEqual(rows.map((r) => r.document).sort(), [...LEGAL_DOC_IDS].sort());
    assert.ok(rows.every((r) => r.version === LEGAL_VERSION && r.accepted_at));
  });
});
