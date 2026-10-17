import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryKV } from '../src/lib/kv';
import { createApi, ApiError } from '../src/data/api';
import type { SimMode } from '../src/types';

function make(mode: SimMode = 'normal', t = Date.parse('2026-10-15T12:00:00Z')) {
  let m = mode;
  const kv = memoryKV();
  const delays: number[] = [];
  const viewer = { id: 'u_me', handle: 'me.tester', displayName: 'Me Tester', bio: '', hue: 1 } as never;
  const api = createApi({ kv, getMode: () => m, getViewer: () => viewer, now: () => t, sleep: async (ms) => { delays.push(ms); } });
  return { api, kv, delays, setMode: (x: SimMode) => { m = x; } };
}

test('feed is strictly chronological, newest first, and a new post lands on top', async () => {
  const { api } = make();
  await api.createPost('Hello from the test');
  const feed = await api.getFeed();
  assert.ok(feed.length > 3);
  for (let i = 1; i < feed.length; i++) assert.ok(feed[i - 1]!.createdAt >= feed[i]!.createdAt, 'order broken at ' + i);
  assert.equal(feed[0]!.body, 'Hello from the test');
});
test('createPost validates', async () => {
  const { api } = make();
  await assert.rejects(api.createPost('   '), (e: unknown) => e instanceof ApiError);
  await assert.rejects(api.createPost('x'.repeat(501)), (e: unknown) => e instanceof ApiError);
});
test('reactions toggle and persist', async () => {
  const { api } = make();
  const [first] = await api.getFeed();
  const a = await api.toggleReaction(first!.id);
  assert.equal(a.reacted, true);
  assert.equal(a.total, first!.reactionTotal + 1);
  assert.equal((await api.toggleReaction(first!.id)).reacted, false);
});
test('simulation modes: error rejects, empty returns nothing, slow uses a longer delay', async () => {
  const s = make('error');
  await assert.rejects(s.api.getFeed(), (e: unknown) => e instanceof ApiError);
  await assert.rejects(s.api.createPost('hi'), (e: unknown) => e instanceof ApiError);
  s.setMode('empty');
  assert.deepEqual(await s.api.getFeed(), []);
  assert.deepEqual(await s.api.getLearn(), []);
  const slow = make('slow');
  await slow.api.getFeed();
  const normal = make('normal');
  await normal.api.getFeed();
  assert.ok(slow.delays[0]! > normal.delays[0]!);
});
test('unknown profile is a typed not_found error; RSVP and intro round-trip', async () => {
  const { api } = make();
  await assert.rejects(api.getProfile('nobody.here'), (e: unknown) => e instanceof ApiError);
  const events = await api.getEvents();
  const updated = await api.setRsvp(events[0]!.id, 'yes');
  assert.equal(updated.myRsvp, 'yes');
  const { mentors } = await api.getMentors();
  await api.requestIntro(mentors[0]!.id);
  assert.ok((await api.getMentors()).requested[mentors[0]!.id]);
});
