import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DIALECTS, startTestApp, type TestApp } from './helpers/app';

const good = { headline: 'Product designer, 8 years', bio: 'I help early-career designers build portfolios and prepare for interviews. I have hired and been hired.', expertise: ['Design', 'Portfolios'], availabilityNote: 'Weekday evenings', capacity: 1, agreed: true };

for (const dialect of DIALECTS) {
  describe(`mentor onboarding [${dialect}]`, () => {
    let t: TestApp; type U = { token: string; userId: string };
    let mentor: U, rev: U, a: U, b: U, c: U; let mentorId = '';
    const notes = async (u: U, type: string) => ((await t.call('GET', '/api/notifications', { token: u.token })).json.items as any[]).filter((n) => n.type === type);
    const listed = async (u: U) => ((await t.call('GET', '/api/mentors', { token: u.token })).json.items as any[]);
    before(async () => {
      t = await startTestApp(dialect, {});
      mentor = await t.member('m@example.com', { handle: 'mara', name: 'Mara' }); rev = await t.member('r@example.com', { handle: 'rev', name: 'Rev' }); await t.grantRole(rev.userId, 'founder');
      a = await t.member('a@example.com', { handle: 'amy', name: 'Amy' }); b = await t.member('b@example.com', { handle: 'ben', name: 'Ben' }); c = await t.member('c@example.com', { handle: 'cy', name: 'Cy' });
    });
    after(async () => { await t.close(); });

    test('applying is validated and screened; the profile stays hidden while pending', async () => {
      assert.equal((await t.call('PUT', '/api/mentor-profile', { token: mentor.token, body: { ...good, bio: 'too short' } })).status, 400);
      assert.equal((await t.call('PUT', '/api/mentor-profile', { token: mentor.token, body: { ...good, agreed: false } })).status, 400);
      assert.equal((await t.call('PUT', '/api/mentor-profile', { token: mentor.token, body: { ...good, headline: 'Nigger expert in everything' } })).status, 400);
      assert.equal((await t.call('PUT', '/api/mentor-profile', { token: mentor.token, body: good })).status, 201);
      const mine = (await t.call('GET', '/api/mentor-profile', { token: mentor.token })).json; assert.equal(mine.profile.state, 'pending');
      assert.equal((await listed(a)).some((m) => m.headline === good.headline), false, 'not listed before approval');
      assert.equal((await t.call('POST', '/api/mentor-applications/x/decision', { token: a.token, body: { decision: 'approve' } })).status, 403, 'members can’t review');
    });

    test('review: needs a reason to reject, can’t review yourself, approval lists the mentor and notifies them', async () => {
      const q = (await t.call('GET', '/api/mentor-applications', { token: rev.token })).json.items; assert.equal(q.length, 1); mentorId = q[0].id;
      assert.equal((await t.call('GET', '/api/mentor-applications', { token: a.token })).status, 403);
      assert.equal((await t.call('POST', `/api/mentor-applications/${mentorId}/decision`, { token: rev.token, body: { decision: 'reject' } })).status, 400);
      const own = await t.call('PUT', '/api/mentor-profile', { token: rev.token, body: good }); assert.equal(own.status, 201);
      const ownId = (await t.call('GET', '/api/mentor-applications', { token: rev.token })).json.items.find((x: any) => x.mine).id;
      assert.equal((await t.call('POST', `/api/mentor-applications/${ownId}/decision`, { token: rev.token, body: { decision: 'approve' } })).status, 403, 'not your own');
      assert.equal((await t.call('DELETE', '/api/mentor-profile', { token: rev.token })).status, 200);
      assert.equal((await t.call('POST', `/api/mentor-applications/${mentorId}/decision`, { token: rev.token, body: { decision: 'approve' } })).status, 200);
      assert.equal((await notes(mentor, 'mentorship')).length, 1);
      const card = (await listed(a)).find((m) => m.headline === good.headline); assert.ok(card); assert.equal(card.isDemo, false); assert.equal(card.handle, 'mara');
      const log = await t.db.query<any>("SELECT action FROM audit_events WHERE action IN ('mentor.approved','mentor.application_submitted')"); assert.ok(log.length >= 2);
    });

    test('requests reach the mentor; capacity, self, duplicate and blocks are enforced', async () => {
      const id = (await listed(a)).find((m) => m.headline === good.headline).id;
      assert.equal((await t.call('POST', `/api/mentors/${id}/requests`, { token: mentor.token, body: {} })).status, 409, 'own profile');
      assert.equal((await t.call('POST', `/api/mentors/${id}/requests`, { token: a.token, body: { message: 'Could you look at my portfolio?' } })).status, 201);
      assert.equal((await t.call('POST', `/api/mentors/${id}/requests`, { token: a.token, body: {} })).status, 409, 'duplicate');
      assert.equal((await notes(mentor, 'mentorship')).length, 2, 'approval + request');
      await t.call('POST', '/api/blocks/mara', { token: c.token });
      assert.equal((await t.call('POST', `/api/mentors/${id}/requests`, { token: c.token, body: {} })).status, 404, 'a block hides the mentor');
      const inbox = (await t.call('GET', '/api/mentoring/requests', { token: mentor.token })).json.items; assert.equal(inbox.length, 1); assert.equal(inbox[0].state, 'pending'); assert.equal(inbox[0].person.handle, 'amy');
      assert.equal((await t.call('POST', `/api/mentoring/requests/${inbox[0].id}/respond`, { token: b.token, body: { decision: 'accept' } })).status, 404, 'only the mentor answers');
      assert.equal((await t.call('POST', `/api/mentoring/requests/${inbox[0].id}/respond`, { token: mentor.token, body: { decision: 'accept', reply: 'Happy to. Send me three pieces.' } })).status, 200);
      assert.equal((await t.call('POST', `/api/mentoring/requests/${inbox[0].id}/respond`, { token: mentor.token, body: { decision: 'decline' } })).status, 409, 'once');
      const mine = (await t.call('GET', '/api/mentor-requests', { token: a.token })).json.items[0]; assert.equal(mine.status, 'facilitated'); assert.equal(mine.reply, 'Happy to. Send me three pieces.'); assert.equal(mine.mentorHandle, 'mara');
      assert.equal((await notes(a, 'mentorship')).length, 1);
      // capacity is 1 and now taken
      assert.equal((await t.call('POST', `/api/mentors/${id}/requests`, { token: b.token, body: {} })).status, 409, 'mentor_full');
      assert.equal((await listed(b)).find((m) => m.id === id).full, true);
    });

    test('editing the reviewed words returns to review; pausing hides; stepping down closes open requests', async () => {
      await t.call('PATCH', '/api/mentor-profile', { token: mentor.token, body: { capacity: 3 } });
      const id = (await listed(b)).find((m) => m.headline === good.headline).id;
      assert.equal((await t.call('POST', `/api/mentors/${id}/requests`, { token: b.token, body: {} })).status, 201);
      assert.equal((await t.call('PATCH', '/api/mentor-profile', { token: mentor.token, body: { paused: true } })).status, 200);
      assert.equal((await listed(a)).some((m) => m.id === id), false, 'paused is hidden');
      await t.call('PATCH', '/api/mentor-profile', { token: mentor.token, body: { paused: false } });
      await t.call('PUT', '/api/mentor-profile', { token: mentor.token, body: { ...good, availabilityNote: 'Mondays only', capacity: 3 } });
      assert.equal((await listed(a)).some((m) => m.id === id), true, 'availability alone doesn’t need review');
      await t.call('PUT', '/api/mentor-profile', { token: mentor.token, body: { ...good, headline: 'Senior product designer', capacity: 3 } });
      assert.equal((await listed(a)).some((m) => m.id === id), false, 'new words are hidden until re-approved');
      assert.equal((await t.call('GET', '/api/mentor-profile', { token: mentor.token })).json.profile.state, 'pending');
      assert.equal((await t.call('DELETE', '/api/mentor-profile', { token: mentor.token })).status, 200);
      const mine = (await t.call('GET', '/api/mentor-requests', { token: b.token })).json.items.find((x: any) => x.mentorId === id); assert.equal(mine.status, 'closed');
      assert.equal((await notes(b, 'mentorship')).length >= 1, true);
      assert.equal((await t.call('GET', '/api/mentor-profile', { token: mentor.token })).json.profile, null, 'stepped down: the profile is gone and they can apply again');
    });

    test('the Founder decides whether moderators may review applications', async () => {
      const mod = await t.member('mod@example.com', { handle: 'moddy', name: 'Moddy' }); await t.grantRole(mod.userId, 'moderator');
      const cand = await t.member('cand@example.com', { handle: 'cand', name: 'Cand' }); assert.equal((await t.call('PUT', '/api/mentor-profile', { token: cand.token, body: good })).status, 201);
      const pid = (await t.call('GET', '/api/mentor-applications', { token: rev.token })).json.items[0].id;
      assert.equal((await t.call('GET', '/api/mentor-applications', { token: mod.token })).status, 403, 'off by default');
      assert.equal((await t.call('GET', '/api/mentor-profile', { token: mod.token })).json.canReview, false);
      assert.equal((await t.call('PUT', '/api/mentor-review-policy', { token: mod.token, body: { moderatorsMayReview: true } })).status, 403, 'only the Founder changes it');
      assert.equal((await t.call('PUT', '/api/mentor-review-policy', { token: rev.token, body: { moderatorsMayReview: true } })).status, 200);
      assert.equal((await t.call('GET', '/api/mentor-review-policy', { token: rev.token })).json.moderatorsMayReview, true);
      assert.equal((await t.call('GET', '/api/mentor-profile', { token: mod.token })).json.canReview, true);
      assert.equal((await t.call('GET', '/api/mentor-applications', { token: mod.token })).status, 200);
      assert.equal((await t.call('POST', '/api/mentor-applications/' + pid + '/decision', { token: a.token, body: { decision: 'approve' } })).status, 403, 'ordinary members still can’t');
      await t.call('PUT', '/api/mentor-review-policy', { token: rev.token, body: { moderatorsMayReview: false } });
      assert.equal((await t.call('POST', '/api/mentor-applications/' + pid + '/decision', { token: mod.token, body: { decision: 'approve' } })).status, 403, 'off again');
      await t.call('PUT', '/api/mentor-review-policy', { token: rev.token, body: { moderatorsMayReview: true } });
      assert.equal((await t.call('POST', '/api/mentor-applications/' + pid + '/decision', { token: mod.token, body: { decision: 'approve' } })).status, 200);
      assert.ok((await t.db.query<any>("SELECT 1 FROM audit_events WHERE action IN ('mentor.review_moderators_on','mentor.review_moderators_off')")).length >= 3);
    });

    test('the mentorship notification switch is honoured', async () => {
      await t.call('PATCH', '/api/settings', { token: a.token, body: { notifications: { mentorship: false } } });
      const { notify } = await import('../server/services/notify');
      assert.equal(await notify(t.db, { userId: a.userId, type: 'mentorship', data: { text: 'x' } }, t.clock.now()), false);
    });
  });
}
