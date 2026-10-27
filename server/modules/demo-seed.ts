import type { ModuleDef } from './types';
import { seedDemoMembers } from '../seed/demo-members';
import { seedUniverseContent } from '../seed/universe-content';

/** Registered last so communities already exist. Only runs when SEED_DEMO_DATA is on (never by default in production). */
export const demoSeedModule: ModuleDef = { name: 'demo-seed', register() {}, async seed(s) { await seedDemoMembers(s); await seedUniverseContent(s); } };
