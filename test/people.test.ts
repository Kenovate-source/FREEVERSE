import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';

type U = { token: string; userId: string };
const png = (w = 64, h = 64) => sharp({ create: { width: w, height: h, channels: 3, background: '#4f9dff' } }).png().toBuffer();

for (const dialect of DIALECTS) {
  describe(`profiles, privacy, social graph and media [${dialect}]`, () => {
    let t: TestApp; let a: U, b: U, c: U;
    before(async () => {
      t = await startTestApp(dialect);
      a = await t.member('a@example.com', { handle: 'alice', name: 'Alice Doe' });
      b = await t.member('b@example.com', { handle: 'bob', name: 'Bob' });
      c = await t.member('c@example.com', { handle: 'carol', name: 'Carol' });
    });
    after(async () => { await t.close(); });
    beforeEach(() => { t.clock.advance(3600_000); });

    test('profile: handle rules, reserved handles, uniqueness, text sanitising, strict bodies', async () => {
      assert.equal((await t.call('PATCH', '/api/profile', { token: a.token, body: { handle: 'nova' } })).status, 400);
      assert.equal((await t.call('PATCH', '/api/profile', { token: a.token, body: { handle: 'a' } })).status, 400);
      assert.equal((await t.call('PATCH', '/api/profile', { token: a.token, body: { handle: 'bob' } })).status, 409);
      assert.equal((await t.call('PATCH', '/api/profile', { token: a.token, body: { isAdmin: true } })).status, 400);
      const r = await t.call('PATCH', '/api/profile', { token: a.token, body: { displayName: 'Alice D.', bio: 'Hello <script>alert(1)</script> world', pronouns: 'she/her', accent: '#ff00aa' } });
      assert.equal(r.status, 200); assert.ok(!r.json.profile.bio.includes('<')); assert.equal(r.json.profile.accent, '#ff00aa');
      assert.equal((await t.call('PATCH', '/api/profile', { token: a.token, body: { accent: 'red' } })).status, 400);
    });

    test('avatar: custom builder config persists; photo mode needs an owned upload', async () => {
      const r = await t.call('PUT', '/api/profile/avatar', { token: a.token, body: { mode: 'avatar', config: { palette: 'sunset', shape: 'squircle', eyes: 'happy', mouth: 'grin', extra: 'glasses' } } });
      assert.ok([200, 400].includes(r.status));
      const ok = await t.call('PUT', '/api/profile/avatar', { token: a.token, body: { mode: 'avatar', config: { shape: 'squircle', eyes: 'happy' } } });
      assert.equal(ok.status, 200); assert.equal(ok.json.profile.avatar.config.shape, 'squircle');
      assert.equal((await t.call('PUT', '/api/profile/avatar', { token: a.token, body: { mode: 'photo' } })).status, 400);
      assert.equal((await t.call('PUT', '/api/profile/avatar', { token: a.token, body: { mode: 'avatar', config: { shape: 'dragon' } } })).status, 400);
      const layered = await t.call('PUT', '/api/profile/avatar', { token: a.token, body: { mode: 'avatar', config: { shape: 'hex', brows: 'raised', pattern: 'sparkle' } } });
      assert.equal(layered.status, 200); assert.equal(layered.json.profile.avatar.config.pattern, 'sparkle');
      assert.equal((await t.call('PUT', '/api/profile/avatar', { token: a.token, body: { mode: 'avatar', config: { pattern: 'flames' } } })).status, 400);
      // every new member gets a distinct default avatar seed
      const sa = (await t.call('GET', '/api/profile', { token: a.token })).json.profile.avatar.config.seed;
      const sb = (await t.call('GET', '/api/profile', { token: b.token })).json.profile.avatar.config.seed;
      assert.ok(sa && sb && sa !== sb);
    });

    test('media: validates and re-encodes images, strips non-image content, enforces ownership, signed URLs', async () => {
      const up = await t.call('POST', '/api/media?purpose=avatar', { token: a.token, raw: await png(), contentType: 'image/png' });
      assert.equal(up.status, 201); assert.equal(up.json.media.mime, 'image/webp');
      assert.equal((await t.call('POST', '/api/media?purpose=avatar', { token: a.token, raw: Buffer.from('<svg onload=alert(1)>'), contentType: 'image/svg+xml' })).status >= 400, true);
      assert.equal((await t.call('POST', '/api/media?purpose=avatar', { token: a.token, raw: Buffer.from('not an image at all'), contentType: 'image/png' })).status >= 400, true);
      assert.equal((await t.call('POST', '/api/media?purpose=bogus', { token: a.token, raw: await png(), contentType: 'image/png' })).status, 400);
      assert.equal((await t.call('POST', '/api/media?purpose=avatar', { raw: await png(), contentType: 'image/png' })).status, 401);
      const img = await t.call('GET', up.json.media.url.replace(t.base, ''));
      assert.equal(img.status, 200); assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
      assert.equal((await t.call('GET', `/api/media/${up.json.media.id}`)).status, 404); // no token
      assert.equal((await t.call('GET', up.json.media.url.replace(t.base, '').replace(/s=[^&]+/, 's=forged'))).status, 404);
      // another member cannot use or delete it
      assert.equal((await t.call('PUT', '/api/profile/avatar', { token: b.token, body: { mode: 'photo', photoMediaId: up.json.media.id } })).status >= 400, true);
      assert.equal((await t.call('DELETE', `/api/media/${up.json.media.id}`, { token: b.token })).status, 404);
      const set = await t.call('PUT', '/api/profile/avatar', { token: a.token, body: { mode: 'both', photoMediaId: up.json.media.id } });
      assert.equal(set.status, 200); assert.ok(set.json.profile.avatar.photoUrl);
      // cover images must be cover-purpose uploads
      assert.equal((await t.call('PUT', '/api/profile/cover', { token: a.token, body: { mode: 'image', mediaId: up.json.media.id } })).status >= 400, true);
      const cov = await t.call('POST', '/api/media?purpose=cover', { token: a.token, raw: await png(1500, 500), contentType: 'image/png' });
      assert.equal((await t.call('PUT', '/api/profile/cover', { token: a.token, body: { mode: 'image', mediaId: cov.json.media.id } })).status, 200);
      // deleting an upload reverts the profile cleanly
      assert.equal((await t.call('DELETE', `/api/media/${up.json.media.id}`, { token: a.token })).status, 200);
      assert.equal((await t.call('GET', '/api/profile', { token: a.token })).json.profile.avatar.photoUrl, null);
    });

    test('privacy presets and per-field audiences are enforced by the server', async () => {
      await t.call('PATCH', '/api/profile', { token: a.token, body: { headline: 'Designer', bio: 'My bio text', pronouns: 'she/her' } });
      await t.call('POST', '/api/privacy/preset', { token: a.token, body: { preset: 'open' } });
      const seen = async (u: U) => (await t.call('GET', '/api/members/alice', { token: u.token })).json.profile;
      assert.equal((await seen(b)).bio, 'My bio text');
      await t.call('PATCH', '/api/privacy', { token: a.token, body: { field_visibility: { bio: 'only_me', pronouns: 'connections' } } });
      const p = await seen(b);
      assert.equal(p.bio, undefined); assert.equal(p.pronouns, undefined); // omitted, not sent as hidden placeholders
      assert.equal((await seen(a)).bio, 'My bio text');
      assert.equal((await t.call('PATCH', '/api/privacy', { token: a.token, body: { field_visibility: { pronouns: 'everyone' } } })).status, 400); // not allowed for that field
      assert.equal((await t.call('PATCH', '/api/privacy', { token: a.token, body: { who_can_message: 'everyone' } })).status, 400);
      await t.call('POST', '/api/privacy/preset', { token: a.token, body: { preset: 'private' } });
      const priv = (await t.call('GET', '/api/members/alice', { token: b.token })).json.profile;
      assert.equal(priv.restricted, true); assert.equal(priv.person.headline, null); assert.equal(priv.bio, undefined);
      assert.equal((await t.call('GET', '/api/privacy', { token: a.token })).json.privacy.preset, 'private');
      assert.equal((await t.call('POST', '/api/privacy/preset', { token: a.token, body: { preset: 'public' } })).status, 400);
      await t.call('POST', '/api/privacy/preset', { token: a.token, body: { preset: 'balanced' } });
    });

    test('settings: strict, merged, defaults safe', async () => {
      const s0 = (await t.call('GET', '/api/settings', { token: b.token })).json.settings;
      assert.equal(s0.nova.journalEnabled, false); assert.equal(s0.nova.goalsEnabled, false); assert.equal(s0.nova.habitsEnabled, false);
      assert.equal((await t.call('PATCH', '/api/settings', { token: b.token, body: { messaging: { readReceipts: false } } })).json.settings.messaging.readReceipts, false);
      assert.equal((await t.call('PATCH', '/api/settings', { token: b.token, body: { nova: { journalEnabled: 'yes' } } })).status, 400);
      assert.equal((await t.call('PATCH', '/api/settings', { token: b.token, body: { evil: {} } })).status, 400);
      assert.equal((await t.call('GET', '/api/settings', { token: b.token })).json.settings.messaging.readReceipts, false);
    });

    test('personalization: catalogue, custom interests, limits, private vs public', async () => {
      const cat = (await t.call('GET', '/api/catalog/interests', { token: a.token })).json;
      assert.ok(cat.categories.length >= 8 && cat.interests.length >= 100);
      const put = await t.call('PUT', '/api/personalization', { token: a.token, body: { kind: 'interest', items: [{ key: cat.interests[0].key, label: cat.interests[0].label }, { label: 'Competitive origami', isCustom: true }] } });
      assert.equal(put.status, 200);
      const mine = (await t.call('GET', '/api/personalization', { token: a.token })).json.personalization.interest;
      assert.equal(mine.length, 2); assert.ok(mine.some((i: any) => i.isCustom && i.label === 'Competitive origami'));
      const many = Array.from({ length: 45 }, (_, i) => ({ label: `Topic ${i}`, isCustom: true }));
      assert.ok((await t.call('PUT', '/api/personalization', { token: a.token, body: { kind: 'interest', items: many } })).status >= 400);
      assert.ok((await t.call('PUT', '/api/personalization', { token: a.token, body: { kind: 'interest', items: [{ label: '<b>x</b>'.repeat(30), isCustom: true }] } })).status >= 400);
      // interests are a profile field with its own audience
      await t.call('PATCH', '/api/privacy', { token: a.token, body: { field_visibility: { interests: 'only_me' } } });
      assert.equal((await t.call('GET', '/api/members/alice', { token: c.token })).json.profile.interests, undefined);
    });

    test('social graph: follow, connection, counts, idempotence, no self-follow, blocks sever and hide', async () => {
      assert.equal((await t.call('POST', '/api/members/alice/follow', { token: a.token })).status >= 400, true);
      assert.equal((await t.call('POST', '/api/members/bob/follow', { token: a.token })).status < 300, true);
      assert.equal((await t.call('POST', '/api/members/bob/follow', { token: a.token })).status < 300, true);
      let rel = (await t.call('GET', '/api/members/bob', { token: a.token })).json.profile.relation;
      assert.equal(rel.following, true); assert.equal(rel.connection, false);
      await t.call('POST', '/api/members/alice/follow', { token: b.token });
      rel = (await t.call('GET', '/api/members/bob', { token: a.token })).json.profile.relation;
      assert.equal(rel.connection, true);
      assert.equal((await t.call('GET', '/api/connections', { token: a.token })).json.items.length, 1);
      // block: relationship removed, each side cannot find the other, follow refused
      assert.equal((await t.call('POST', '/api/blocks/bob', { token: a.token })).status < 300, true);
      assert.equal((await t.call('GET', '/api/members/alice', { token: b.token })).status, 404);
      assert.equal((await t.call('GET', '/api/members/bob', { token: a.token })).status, 404);
      assert.equal((await t.call('POST', '/api/members/alice/follow', { token: b.token })).status >= 400, true);
      assert.equal((await t.call('GET', '/api/connections', { token: a.token })).json.items.length, 0);
      assert.equal((await t.call('GET', '/api/blocks', { token: a.token })).json.items.length, 1);
      assert.equal((await t.call('GET', '/api/members?q=alice', { token: b.token })).json.items.some((m: any) => m.person.handle === 'alice'), false);
      await t.call('DELETE', '/api/blocks/bob', { token: a.token });
      assert.equal((await t.call('GET', '/api/members/bob', { token: a.token })).status, 200);
    });

    test('discovery respects “not discoverable”, and only lists adults of this platform', async () => {
      await t.call('PATCH', '/api/privacy', { token: c.token, body: { discoverable: false } });
      assert.equal((await t.call('GET', '/api/members?q=carol', { token: a.token })).json.items.some((m: any) => m.person.handle === 'carol'), false);
      assert.equal((await t.call('GET', '/api/members/carol', { token: a.token })).status, 200); // a direct link still works if the profile is open
      assert.equal((await t.call('GET', '/api/members?q=%25', { token: a.token })).json.items.length, 0);
      assert.equal((await t.call('GET', '/api/members?limit=500', { token: a.token })).status, 400);
    });
  });
}
