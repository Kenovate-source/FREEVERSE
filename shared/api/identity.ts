import type { Archetype } from '../constants';
import type { EntryKind } from '../archetypes';
import type { Audience } from '../constants';

export interface IdentityView { id: string; archetype: Archetype; status: 'active' | 'paused' | 'removed'; isPrimary: boolean; headline: string | null; visibility: Audience; answers: Record<string, unknown>; createdAt: string }
export interface EntryView { id: string; kind: EntryKind; identityId: string | null; title: string; description: string | null; link: string | null; mediaUrl: string | null; occurredOn: string | null; evidence: 'self_declared' | 'platform_recorded' | 'verified'; visibility: Audience; pinned: boolean; createdAt: string }
export interface SuggestionView { id: string; kind: EntryKind; draft: { title: string; description?: string; occurredOn?: string }; reason: string; evidenceRef: string; createdAt: string }
export interface AchievementView { id: string; archetype: Archetype; label: string; description: string; earned: boolean; progress: number; target: number }

export type OnboardingPath = 'identity_first' | 'guided_discovery';
export type OnboardingStep = { id: string; kind: 'path' | 'intents' | 'suggest' | 'identities' | 'identity' | 'interests' | 'privacy' | 'finish'; title: string; archetype?: Archetype; optional: boolean; quick?: boolean };
export interface OnboardingState { completed: boolean; path: OnboardingPath | null; step: string | null; intents: string[]; selected: Archetype[]; primary: Archetype | null; steps: OnboardingStep[]; suggestions: { archetype: Archetype; because: string[] }[]; answers: Record<string, Record<string, unknown>> }

export interface WidgetData { id: string; title: string; source: string; wide: boolean; href: string | null; empty: string; items: { title: string; subtitle: string | null; href: string | null; progress?: number }[]; planned: boolean }
export interface SpaceView { archetype: Archetype; label: string; icon: string; accent: string; tagline: string; vocab: Record<string, string>; nav: { id: string; label: string; href: string }[]; widgets: WidgetData[]; tools: { id: string; label: string; description: string; status: 'available' | 'planned'; href: string | null }[]; sections: { kind: EntryKind; label: string; prompt: string; entries: EntryView[] }[]; achievements: AchievementView[]; identity: IdentityView }
export interface HomeView { greeting: string; identities: { id: string; archetype: Archetype; label: string; icon: string; accent: string; isPrimary: boolean }[]; widgets: (WidgetData & { fromIdentity: Archetype | null })[]; nextSteps: { id: string; title: string; description: string; href: string }[]; mode: 'identity' | 'general' }
