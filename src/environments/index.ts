import type { EnvDef, EnvironmentsApi } from './types';
import { liveCount, mountEnvironment } from './engine';
import { messages } from './envs/messages';
import { calls } from './envs/calls';
import { profile } from './envs/profile';
import { communities } from './envs/communities';
import { notifications } from './envs/notifications';
import { saved } from './envs/saved';
import { settings } from './envs/settings';
import { posts } from './envs/posts';
import { council } from './envs/council';
import { nova } from './envs/nova';
import { SPACE_ENVS } from './envs/spaces';
import { UNIVERSE_ENVS } from './envs/universes';

// The registry. A new page or Universe gets its own environment by adding one file here: nothing else in the engine changes.
const ALL: EnvDef[] = [messages, calls, profile, communities, notifications, saved, settings, posts, council, nova, ...SPACE_ENVS, ...UNIVERSE_ENVS];
const byId = new Map(ALL.map((e) => [e.id, e]));
const api: EnvironmentsApi = {
  ids: ALL.map((e) => e.id),
  mount(canvas, id, o) { const d = byId.get(id); return d ? mountEnvironment(d, canvas, o) : null; },
  focusBehaviour: (id) => byId.get(id)?.focus ?? 'still',
  liveCount,
  version: 'environments-1',
};
window.FreeverseEnvironments = api;
export default api;
