import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';
import { loadConfig, ConfigError } from '../server/config';
import { checkEligibility, ageBand } from '../server/domain/eligibility';
import { renderAll } from '../scripts/render-migrations.mjs';
import { readFileSync } from 'node:fs';

describe('config safety', () => {
  test('production refuses SQLite and the dev auth provider', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production', AUTH_PROVIDER: 'supabase', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' }), ConfigError);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', AUTH_PROVIDER: 'dev' }), /development auth provider/);
  });
  test('dev auth refuses a non-loopback bind', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'development', AUTH_PROVIDER: 'dev', HOST: '0.0.0.0' }), /loopback/);
  });
  test('supabase requires its variables', () => {
    assert.throws(() => loadConfig({ AUTH_PROVIDER: 'supabase' }), /SUPABASE_URL/);
  });
});

describe('eligibility maths (18–24, month+year stored only)', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  test('boundaries', () => {
    assert.equal(checkEligibility({ year: 2008, month: 10, day: 15 }, now).eligible, true); // turns 18 today
    assert.deepEqual(checkEligibility({ year: 2008, month: 10, day: 16 }, now), { eligible: false, reason: 'too_young' });
    assert.equal(checkEligibility({ year: 2001, month: 10, day: 16 }, now).eligible, true); // still 24 until 16 Oct 2026+1 day
    assert.deepEqual(checkEligibility({ year: 2001, month: 10, day: 15 }, now), { eligible: false, reason: 'too_old' });
    assert.deepEqual(checkEligibility({ year: 2003, month: 2, day: 30 }, now), { eligible: false, reason: 'invalid_date' });
    assert.deepEqual(checkEligibility({ year: 2030, month: 1, day: 1 }, now), { eligible: false, reason: 'invalid_date' });
  });
  test('founder exemption only lifts the upper bound', () => {
    assert.equal(checkEligibility({ year: 1990, month: 1, day: 1 }, now, { skipMax: true }).eligible, true);
    assert.equal(checkEligibility({ year: 2012, month: 1, day: 1 }, now, { skipMax: true }).eligible, false);
  });
  test('age band', () => { assert.equal(ageBand(3, 2003, now), '21–24'); assert.equal(ageBand(3, 2007, now), '18–20'); });
});

test('rendered migrations are up to date', () => {
  for (const { dialect, name, sql } of renderAll()) assert.equal(readFileSync(`migrations/${dialect}/${name}`, 'utf8'), sql, `${dialect}/${name} is stale: run npm run db:render`);
});

for (const dialect of DIALECTS) {
  describe(`foundation on ${dialect}`, () => {
    let t: TestApp;
    before(async () => { t = await startTestApp(dialect, { FOUNDER_EMAIL: 'founder@example.com' }); });
    after(async () => { await t.close(); });

    test('security headers and public config', async () => {
      const r = await t.call('GET', '/api/config');
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'self'/);
      assert.equal(r.json.eligibility.verified, false);
      assert.equal(JSON.stringify(r.json).includes('SUPABASE_SERVICE'), false);
    });

    test('protected routes reject anonymous callers', async () => {
      const r = await t.call('GET', '/api/me');
      assert.equal(r.status, 401);
      const r2 = await t.call('GET', '/api/me', { token: 'garbage' });
      assert.equal(r2.status, 401);
    });

    test('signup requires the age-range confirmation and a decent password', async () => {
      assert.equal((await t.call('POST', '/api/auth/signup', { body: { email: 'a@example.com', password: 'longenough1', confirmAgeRange: false } })).status, 400);
      assert.equal((await t.call('POST', '/api/auth/signup', { body: { email: 'a@example.com', password: 'short', confirmAgeRange: true } })).status, 400);
    });

    test('new accounts are pending until eligibility; product routes are blocked meanwhile', async () => {
      const a = await t.register('pending@example.com');
      const me = await t.call('GET', '/api/me', { token: a.token });
      assert.equal(me.json.user.status, 'pending_eligibility');
      const cfg = await t.call('POST', '/api/me/step-up', { token: a.token, body: { secret: 'x' } });
      assert.equal(cfg.status, 403);
      assert.equal(cfg.json.error.code, 'eligibility_required');
    });

    test('eligibility stores month and year only and never the day', async () => {
      const a = await t.register('elig@example.com');
      const r = await t.call('POST', '/api/me/eligibility', { token: a.token, body: { birthMonth: 3, birthDay: 14, birthYear: 2003, acceptTerms: true, confirmSelfDeclared: true } });
      assert.equal(r.status, 200);
      assert.equal(r.json.user.status, 'active');
      assert.equal(r.json.user.eligibility.status, 'self_attested');
      assert.equal(r.json.user.eligibility.method, 'self_declared_birthdate');
      const row = await t.db.get<any>('SELECT * FROM users WHERE id = $1', [a.userId]);
      assert.equal(Number(row.birth_month), 3); assert.equal(Number(row.birth_year), 2003);
      assert.ok(!('birth_day' in row));
      assert.equal(JSON.stringify(r.json).includes('2003'), false, 'birth year must not be echoed');
      const events = await t.db.query<any>("SELECT meta FROM audit_events WHERE action = 'account.eligibility_self_attested'");
      assert.equal(JSON.stringify(events).includes('14'), false);
    });

    test('under-18 and over-24 are refused server-side and nothing about the date is kept', async () => {
      for (const [email, year] of [['young@example.com', 2012], ['old@example.com', 1995]] as const) {
        const a = await t.register(email);
        const r = await t.call('POST', '/api/me/eligibility', { token: a.token, body: { birthMonth: 6, birthDay: 6, birthYear: year, acceptTerms: true, confirmSelfDeclared: true } });
        assert.equal(r.status, 403); assert.equal(r.json.error.code, 'ineligible');
        const row = await t.db.get<any>('SELECT status, birth_year FROM users WHERE id = $1', [a.userId]);
        assert.equal(row.status, 'ineligible'); assert.equal(row.birth_year, null);
        const again = await t.call('POST', '/api/me/eligibility', { token: a.token, body: { birthMonth: 6, birthDay: 6, birthYear: 2003, acceptTerms: true, confirmSelfDeclared: true } });
        assert.equal(again.status, 403, 'cannot retry with a different date');
      }
    });

    test('founder bootstrap grants exactly one founder and waives only the upper age bound', async () => {
      const f = await t.register('founder@example.com');
      const r = await t.call('POST', '/api/me/eligibility', { token: f.token, body: { birthMonth: 1, birthDay: 1, birthYear: 1985, acceptTerms: true, confirmSelfDeclared: true } });
      assert.equal(r.status, 200);
      assert.ok(r.json.user.roles.includes('founder'));
      assert.ok(r.json.user.permissions.includes('founder.console'));
      assert.equal(r.json.user.eligibility.exemption, 'founder');
      const seat = await t.db.get<any>('SELECT holder_user_id FROM governance_seats WHERE level = 1');
      assert.equal(seat.holder_user_id, f.userId);
      await assert.rejects(t.db.run("INSERT INTO role_grants (id, user_id, role, granted_at) VALUES ('11111111-1111-1111-1111-111111111111', $1, 'founder', $2)", [f.userId, new Date().toISOString()]), 'second live founder grant must violate the unique index');
    });

    test('step-up grants are required and expire', async () => {
      const m = await t.member('stepup@example.com');
      const bad = await t.call('POST', '/api/me/step-up', { token: m.token, body: { secret: 'wrong' } });
      assert.equal(bad.status, 403);
      const ok = await t.call('POST', '/api/me/step-up', { token: m.token, body: { secret: 'stepup@example.com' } });
      assert.equal(ok.status, 200);
      const { verifyStepUp } = await import('../server/authz/step-up');
      assert.equal(await verifyStepUp(t.db, m.userId, ok.json.token, t.clock.now()), true);
      t.clock.advance(11 * 60_000);
      assert.equal(await verifyStepUp(t.db, m.userId, ok.json.token, t.clock.now()), false);
    });

    test('audit log is append-only at the database level', async () => {
      await assert.rejects(t.db.run("UPDATE audit_events SET action = 'x'"));
      await assert.rejects(t.db.run('DELETE FROM audit_events'));
    });

    test('governance seats are seeded 1-3-7-12-24', async () => {
      const rows = await t.db.query<any>('SELECT level, COUNT(*) AS n FROM governance_seats GROUP BY level ORDER BY level');
      assert.deepEqual(rows.map((r) => [Number(r.level), Number(r.n)]), [[1, 1], [3, 3], [7, 7], [12, 12], [24, 24]]);
    });
  });
}
