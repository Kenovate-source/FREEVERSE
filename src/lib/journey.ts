import { UNIVERSES } from '../../shared/universes';
import { UNIVERSE_SPECS } from '../../shared/universe-spaces';
import { ARCHETYPE_LIST } from '../../shared/archetypes';
import type { SceneNode } from '../immersive/types';
import { placeNodes } from '../immersive/keyframes';

export const CHAPTERS = [
  { id: 'vision', label: 'Vision' }, { id: 'identity', label: 'Identities' }, { id: 'universes', label: 'Universes' },
  { id: 'knowledge', label: 'Learn & create' }, { id: 'community', label: 'Communities' }, { id: 'work', label: 'Work & enterprise' },
  { id: 'media', label: 'Media & play' }, { id: 'trust', label: 'Trust' }, { id: 'invite', label: 'Join' },
] as const;

/** Which part of the story each Universe belongs to. Drives the cluster in the 3D scene and in the SVG fallback. */
export const UNIVERSE_GROUP: Record<string, SceneNode['group']> = {
  freelearn: 'knowledge', freeresearch: 'knowledge', freeai: 'knowledge', freelabs: 'knowledge',
  freeconnect: 'community', freeevents: 'community', freevolunteer: 'community', freehealth: 'community',
  freework: 'work', freebuild: 'work', freemarket: 'work', freefinance: 'work',
  freemedia: 'media', freeplay: 'media', freeentertainment: 'media',
};

export function sceneNodes(): SceneNode[] {
  return UNIVERSES.map((u) => ({ id: u.id, name: u.name, accent: u.accent, group: UNIVERSE_GROUP[u.id] ?? 'community', related: [...(UNIVERSE_SPECS.find((s) => s.id === u.id)?.related ?? [])] }));
}
export const identityColors = (): string[] => ARCHETYPE_LIST.slice(0, 6).map((a) => a.accent);

/** Flat 2D positions (viewBox units) of the same constellation, for the SVG/CSS fallback. */
export function flatNodes(size = 800): { id: string; x: number; y: number; accent: string; group: string }[] {
  const nodes = sceneNodes(); const pos = placeNodes(nodes, 1); const c = size / 2;
  return nodes.map((n) => { const p = pos.get(n.id)!; return { id: n.id, x: c + (p[0] * 0.95 + p[2] * 0.2) * size * 0.4, y: c + (p[1] * 0.9 + p[2] * 0.48) * size * 0.4, accent: n.accent, group: n.group }; });
}
