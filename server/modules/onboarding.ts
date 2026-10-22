import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict } from '../http/errors';
import { json } from '../db';
import { ARCHETYPES } from '../../shared/constants';
import { ARCHETYPE_DEFS, INTENTS, suggestArchetypes } from '../../shared/archetypes';
import type { OnboardingPath, OnboardingState, OnboardingStep } from '../../shared/api/identity';
import { addIdentity, cleanAnswers, myIdentities } from './identities';
import type { Db } from '../db';
import type { Archetype } from '../../shared/constants';

const PATHS = ['identity_first', 'guided_discovery'] as const;
const MAX_PICK = 4;

export function buildSteps(path: OnboardingPath | null, selected: Archetype[]): OnboardingStep[] {
  if (!path) return [];
  const identitySteps = (quick: boolean): OnboardingStep[] => selected.map((a) => ({ id: `identity:${a}`, kind: 'identity', title: `About you as a ${ARCHETYPE_DEFS[a].label.toLowerCase()}`, archetype: a, optional: true, quick }));
  const tail: OnboardingStep[] = [{ id: 'interests', kind: 'interests', title: 'Interests', optional: true }, { id: 'privacy', kind: 'privacy', title: 'Your privacy', optional: true }, { id: 'finish', kind: 'finish', title: 'All set', optional: false }];
  // Path A leads with who you are and asks every question for each identity. Path B leads with what you want to do,
  // suggests identities from that, and keeps the follow-ups short. Same account, same data, different journey.
  if (path === 'identity_first') return [{ id: 'identities', kind: 'identities', title: 'Who are you here as?', optional: true }, ...identitySteps(false), ...tail];
  return [{ id: 'intents', kind: 'intents', title: 'What brings you here?', optional: true }, { id: 'suggest', kind: 'suggest', title: 'Identities that might fit', optional: true }, ...identitySteps(true), ...tail];
}

async function state(db: Db, userId: string): Promise<OnboardingState> {
  const u = await db.get<any>('SELECT onboarding_path, onboarding_step, onboarding_data, onboarding_completed_at FROM users WHERE id = $1', [userId]);
  const data = json<{ intents?: string[] }>(u?.onboarding_data, {});
  const ids = (await myIdentities(db, userId)).filter((i) => i.status === 'active');
  const selected = ids.map((i) => i.archetype);
  const path: OnboardingPath | null = u?.onboarding_path ?? null;
  const intents = (data.intents ?? []).filter((k) => INTENTS.some((x) => x.key === k));
  return {
    completed: !!u?.onboarding_completed_at, path, step: u?.onboarding_step ?? null, intents, selected, primary: ids.find((i) => i.isPrimary)?.archetype ?? null,
    steps: buildSteps(path, selected), suggestions: path === 'guided_discovery' ? suggestArchetypes(intents) : [],
    answers: Object.fromEntries(ids.map((i) => [i.archetype, i.answers])),
  };
}

export const onboardingModule: ModuleDef = {
  name: 'onboarding',
  register(router) {
    router.get('/api/onboarding', { auth: 'active' }, async (c) => ({ state: await state(c.db, c.me.userId), intents: INTENTS }));

    router.put('/api/onboarding/path', { auth: 'active', body: z.object({ path: z.enum(PATHS) }).strict() }, async (c) => {
      await c.db.run('UPDATE users SET onboarding_path = $2, onboarding_step = $3, updated_at = $4 WHERE id = $1', [c.me.userId, c.body.path, c.body.path === 'identity_first' ? 'identities' : 'intents', c.now().toISOString()]);
      return { state: await state(c.db, c.me.userId) };
    });

    router.put('/api/onboarding/intents', { auth: 'active', body: z.object({ intents: z.array(z.string().max(30)).max(13) }).strict() }, async (c) => {
      const keys = [...new Set(c.body.intents.filter((k) => INTENTS.some((x) => x.key === k)))];
      const u = await c.db.get<any>('SELECT onboarding_data FROM users WHERE id = $1', [c.me.userId]);
      await c.db.run('UPDATE users SET onboarding_data = $2, onboarding_step = $3, updated_at = $4 WHERE id = $1', [c.me.userId, JSON.stringify({ ...json<object>(u?.onboarding_data, {}), intents: keys }), 'suggest', c.now().toISOString()]);
      return { state: await state(c.db, c.me.userId) };
    });

    // Choosing identities (either path). “None” is allowed: a person can just explore.
    router.put('/api/onboarding/identities', { auth: 'active', body: z.object({ archetypes: z.array(z.enum(ARCHETYPES)).max(MAX_PICK), primary: z.enum(ARCHETYPES).nullable().optional() }).strict() }, async (c) => {
      const u = await c.db.get<any>('SELECT onboarding_completed_at, onboarding_path FROM users WHERE id = $1', [c.me.userId]);
      if (u?.onboarding_completed_at) throw conflict('Onboarding is finished. Manage identities from Settings or your Identity spaces.', 'onboarding_done');
      const want = [...new Set(c.body.archetypes)];
      if (c.body.primary && !want.includes(c.body.primary)) throw badRequest('The main identity must be one you picked.', { primary: 'invalid' }, 'invalid_primary');
      const live = await myIdentities(c.db, c.me.userId);
      for (const i of live) if (!want.includes(i.archetype)) await c.db.run("UPDATE user_identities SET status = 'removed', is_primary = $3, removed_at = $2 WHERE id = $1", [i.id, c.now().toISOString(), false]);
      for (const a of want) if (!live.some((i) => i.archetype === a)) {
        const old = await c.db.get<any>("SELECT id FROM user_identities WHERE user_id = $1 AND archetype = $2 AND status = 'removed'", [c.me.userId, a]);
        if (old) await c.db.run('DELETE FROM user_identities WHERE id = $1', [old.id]);
        await addIdentity(c.db, c.me.userId, a, c.now(), { makePrimary: false });
      }
      const mainChoice = c.body.primary ?? want[0] ?? null;
      await c.db.run('UPDATE user_identities SET is_primary = $2 WHERE user_id = $1', [c.me.userId, false]);
      if (mainChoice) await c.db.run(`UPDATE user_identities SET is_primary = ${c.s.db.dialect === 'postgres' ? 'TRUE' : '1'} WHERE user_id = $1 AND archetype = $2 AND status <> 'removed'`, [c.me.userId, mainChoice]);
      await c.db.run('UPDATE users SET onboarding_step = $2, updated_at = $3 WHERE id = $1', [c.me.userId, want[0] ? `identity:${want[0]}` : 'interests', c.now().toISOString()]);
      return { state: await state(c.db, c.me.userId) };
    });

    router.put('/api/onboarding/identities/:archetype/answers', { auth: 'active', body: z.object({ answers: z.record(z.string().max(40), z.union([z.string().max(400), z.array(z.string().max(60)).max(12)])), headline: z.string().trim().max(120).nullable().optional() }).strict() }, async (c) => {
      const a = z.enum(ARCHETYPES).safeParse(c.params.archetype);
      if (!a.success) throw badRequest('Unknown identity.', undefined, 'unknown_identity');
      const r = await c.db.get<any>("SELECT id, data FROM user_identities WHERE user_id = $1 AND archetype = $2 AND status <> 'removed'", [c.me.userId, a.data]);
      if (!r) throw conflict('Pick that identity first.', 'identity_not_selected');
      const merged = { ...json<object>(r.data, {}), ...cleanAnswers(a.data, c.body.answers) };
      await c.db.run('UPDATE user_identities SET data = $2, headline = COALESCE($3, headline), updated_at = $4 WHERE id = $1', [r.id, JSON.stringify(merged), c.body.headline ?? null, c.now().toISOString()]);
      return { state: await state(c.db, c.me.userId) };
    });

    router.post('/api/onboarding/step', { auth: 'active', body: z.object({ step: z.string().max(40) }).strict() }, async (c) => {
      const st = await state(c.db, c.me.userId);
      if (!st.steps.some((x) => x.id === c.body.step)) throw badRequest('That step is not part of your journey.', { step: 'invalid' }, 'invalid_step');
      await c.db.run('UPDATE users SET onboarding_step = $2 WHERE id = $1', [c.me.userId, c.body.step]);
      return { ok: true };
    });

    router.post('/api/onboarding/complete', { auth: 'active' }, async (c) => {
      await c.db.run('UPDATE users SET onboarding_completed_at = COALESCE(onboarding_completed_at, $2), onboarding_step = $3, updated_at = $2 WHERE id = $1', [c.me.userId, c.now().toISOString(), 'finish']);
      return { state: await state(c.db, c.me.userId) };
    });
    // Skipping is always allowed. It records nothing about you beyond “finished”, and everything stays editable later.
    router.post('/api/onboarding/skip', { auth: 'active' }, async (c) => {
      await c.db.run("UPDATE users SET onboarding_path = COALESCE(onboarding_path, 'guided_discovery'), onboarding_completed_at = COALESCE(onboarding_completed_at, $2), onboarding_step = 'skipped', updated_at = $2 WHERE id = $1", [c.me.userId, c.now().toISOString()]);
      return { state: await state(c.db, c.me.userId) };
    });
    router.post('/api/onboarding/reopen', { auth: 'active' }, async (c) => {
      await c.db.run('UPDATE users SET onboarding_completed_at = NULL, onboarding_step = $2, updated_at = $3 WHERE id = $1', [c.me.userId, null, c.now().toISOString()]);
      return { state: await state(c.db, c.me.userId) };
    });
  },
};
