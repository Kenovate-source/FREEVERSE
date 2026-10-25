export interface Me {
  id: string; status: string; handle: string | null; displayName: string | null; email: string | null; roles: string[]; permissions: string[]; seatLevel: number | null; createdAt: string | null;
  onboarding: { completed: boolean; path: 'identity_first' | 'guided_discovery' | null; step: string | null };
  eligibility: { status: string | null; method: string | null; attestedAt: string | null; ageBand: string | null; exemption: string | null };
}
export interface AppConfig {
  app: { name: string; stage: number };
  auth: { kind: 'dev' | 'supabase'; managed: boolean; note: string };
  eligibility: { min: number; max: number | null; noUpperLimit?: boolean; method: string; verified: boolean };
  terms: { version: string };
  features: { env: string; authProvider: string; database: string; aiProvider: string; storage: string; anonymousPosting: boolean; anonymousPostingEnabled: boolean; novaFlagRetentionDays: number; devTools: boolean };
}
