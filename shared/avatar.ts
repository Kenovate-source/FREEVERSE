// Avatar builder options. Avatars are original abstract "orbit creatures" drawn as SVG in the browser from this small config,
// so nobody is reduced to initials and nobody needs to upload a photo. The server validates configs against these lists.

export const AVATAR_PALETTES = [
  { id: 'aurora', a: '#3ee6f4', b: '#4f9dff', ink: '#04102a' },
  { id: 'nebula', a: '#a58bff', b: '#f7b2ff', ink: '#1b0a3a' },
  { id: 'ember', a: '#ffb86b', b: '#ff7b9c', ink: '#3a1204' },
  { id: 'moss', a: '#7ee7a8', b: '#3ee6f4', ink: '#04281a' },
  { id: 'dusk', a: '#6f7bff', b: '#a58bff', ink: '#0a0b3a' },
  { id: 'peach', a: '#ffd36b', b: '#ffa38a', ink: '#3a2204' },
  { id: 'orchid', a: '#f7b2ff', b: '#ff8ad8', ink: '#3a0a30' },
  { id: 'glacier', a: '#b8f1ff', b: '#86b7ff', ink: '#06203a' },
  { id: 'lime', a: '#d6f27a', b: '#6ff0cf', ink: '#1a2a04' },
  { id: 'rose', a: '#ff9aa9', b: '#ffb86b', ink: '#3a0a14' },
] as const;
export const AVATAR_SHAPES = ['blob', 'circle', 'squircle', 'drop', 'star', 'cloud', 'hex', 'moon'] as const;
export const AVATAR_EYES = ['dots', 'happy', 'sleepy', 'wide', 'wink', 'star', 'lashes', 'visor'] as const;
export const AVATAR_MOUTHS = ['smile', 'grin', 'o', 'flat', 'tongue', 'smirk'] as const;
export const AVATAR_EXTRAS = ['none', 'glasses', 'headphones', 'cap', 'flower', 'antenna', 'halo', 'scarf'] as const;

export interface AvatarConfig {
  seed?: string;
  palette?: (typeof AVATAR_PALETTES)[number]['id'];
  shape?: (typeof AVATAR_SHAPES)[number];
  eyes?: (typeof AVATAR_EYES)[number];
  mouth?: (typeof AVATAR_MOUTHS)[number];
  extra?: (typeof AVATAR_EXTRAS)[number];
}

export const COVER_PRESETS = [
  { id: 'orbit', label: 'Orbit', a: '#0f8bfe', b: '#a58bff' },
  { id: 'sunrise', label: 'Sunrise', a: '#ffb86b', b: '#ff7b9c' },
  { id: 'forest', label: 'Forest hum', a: '#1e9b7a', b: '#3ee6f4' },
  { id: 'dusk', label: 'Dusk', a: '#4a3aa8', b: '#f7b2ff' },
  { id: 'ink', label: 'Ink', a: '#0a1236', b: '#4f9dff' },
  { id: 'paper', label: 'Paper lanterns', a: '#ffd36b', b: '#ff8ad8' },
  { id: 'tide', label: 'Tide', a: '#3ee6f4', b: '#0f8bfe' },
  { id: 'bloom', label: 'Bloom', a: '#ff8ad8', b: '#a58bff' },
] as const;
export const COVER_PATTERNS = ['rings', 'dots', 'waves', 'grid', 'none'] as const;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = <T,>(list: readonly T[], n: number): T => list[n % list.length] as T;

/** Fills any missing avatar fields deterministically from the seed, so every person gets a distinct default. */
export function resolveAvatar(cfg: AvatarConfig | Record<string, unknown> | null | undefined, fallbackSeed = 'neutral'): Required<Omit<AvatarConfig, 'seed'>> & { seed: string } {
  const c = (cfg ?? {}) as AvatarConfig;
  const seed = c.seed || fallbackSeed;
  const h = hash(seed);
  return {
    seed,
    palette: c.palette ?? pick(AVATAR_PALETTES, h).id,
    shape: c.shape ?? pick(AVATAR_SHAPES, h >>> 3),
    eyes: c.eyes ?? pick(AVATAR_EYES, h >>> 7),
    mouth: c.mouth ?? pick(AVATAR_MOUTHS, h >>> 11),
    extra: c.extra ?? pick(AVATAR_EXTRAS, h >>> 15),
  };
}
