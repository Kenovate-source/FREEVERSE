import { AVATAR_PALETTES, resolveAvatar, type AvatarConfig } from '../../shared/avatar';

const SHAPES: Record<string, string> = {
  blob: 'M50 6c18 0 38 12 40 34 2 22-10 52-40 54S8 70 8 48 28 6 50 6z', circle: 'M50 6a44 44 0 1 0 .1 0z', squircle: 'M50 6c32 0 44 12 44 44S82 94 50 94 6 82 6 50 18 6 50 6z',
  drop: 'M50 5C72 30 90 46 90 64a40 40 0 0 1-80 0C10 46 28 30 50 5z', star: 'M50 5l12 27 29 3-22 20 7 29-26-15-26 15 7-29L9 35l29-3z', cloud: 'M28 80a20 20 0 0 1-3-40 26 26 0 0 1 50-4 22 22 0 0 1-2 44z',
  hex: 'M50 5l38 22v46L50 95 12 73V27z', moon: 'M62 6a44 44 0 1 0 28 62A36 36 0 0 1 62 6z',
};
const eyes = (k: string, ink: string) => {
  switch (k) {
    case 'happy': return <g stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none"><path d="M30 46q6-8 12 0" /><path d="M58 46q6-8 12 0" /></g>;
    case 'sleepy': return <g stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none"><path d="M30 46q6 6 12 0" /><path d="M58 46q6 6 12 0" /></g>;
    case 'wide': return <g fill="#fff" stroke={ink} strokeWidth="3"><circle cx="36" cy="46" r="8" /><circle cx="64" cy="46" r="8" /><circle cx="37" cy="47" r="3.5" fill={ink} /><circle cx="63" cy="47" r="3.5" fill={ink} /></g>;
    case 'wink': return <g stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none"><circle cx="36" cy="46" r="3" fill={ink} /><path d="M58 46q6-8 12 0" /></g>;
    case 'star': return <g fill={ink}><path d="M36 38l2 5 5 .5-4 3.5 1.2 5-4.2-2.8-4.2 2.8 1.2-5-4-3.5 5-.5z" /><path d="M64 38l2 5 5 .5-4 3.5 1.2 5-4.2-2.8-4.2 2.8 1.2-5-4-3.5 5-.5z" /></g>;
    case 'lashes': return <g stroke={ink} strokeWidth="3" strokeLinecap="round" fill="none"><circle cx="36" cy="47" r="4" fill={ink} /><circle cx="64" cy="47" r="4" fill={ink} /><path d="M30 41l-3-3 M36 39v-4 M42 41l3-3 M58 41l-3-3 M64 39v-4 M70 41l3-3" /></g>;
    case 'visor': return <g><rect x="24" y="40" width="52" height="14" rx="7" fill={ink} /><rect x="28" y="43" width="20" height="3" rx="1.5" fill="#fff" opacity=".6" /></g>;
    default: return <g fill={ink}><circle cx="36" cy="46" r="4.5" /><circle cx="64" cy="46" r="4.5" /></g>;
  }
};
const mouth = (k: string, ink: string) => {
  switch (k) {
    case 'grin': return <path d="M36 62q14 16 28 0z" fill={ink} />;
    case 'o': return <ellipse cx="50" cy="66" rx="5" ry="6" fill={ink} />;
    case 'flat': return <path d="M40 66h20" stroke={ink} strokeWidth="4" strokeLinecap="round" />;
    case 'tongue': return <g><path d="M38 62q12 12 24 0z" fill={ink} /><path d="M46 68q4 8 8 0z" fill="#ff7b9c" /></g>;
    case 'smirk': return <path d="M38 66q12 6 24-4" stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none" />;
    default: return <path d="M38 62q12 12 24 0" stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none" />;
  }
};
const extra = (k: string, ink: string) => {
  switch (k) {
    case 'glasses': return <g fill="none" stroke={ink} strokeWidth="3"><circle cx="36" cy="46" r="11" /><circle cx="64" cy="46" r="11" /><path d="M47 46h6" /></g>;
    case 'headphones': return <g fill="none" stroke={ink} strokeWidth="5" strokeLinecap="round"><path d="M16 56V46a34 34 0 0 1 68 0v10" /><rect x="10" y="52" width="10" height="18" rx="4" fill={ink} /><rect x="80" y="52" width="10" height="18" rx="4" fill={ink} /></g>;
    case 'cap': return <g fill={ink}><path d="M20 28q30-26 60 0z" /><rect x="14" y="26" width="40" height="6" rx="3" /></g>;
    case 'flower': return <g><circle cx="76" cy="18" r="4" fill="#ffd36b" /><g fill="#ff8ad8">{[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={76 + 8 * Math.cos((a * Math.PI) / 180)} cy={18 + 8 * Math.sin((a * Math.PI) / 180)} r="4.5" />)}</g><circle cx="76" cy="18" r="3.5" fill="#ffd36b" /></g>;
    case 'antenna': return <g stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M50 8V-2" /><circle cx="50" cy="-4" r="4" fill="#ff7b9c" stroke="none" /></g>;
    case 'halo': return <ellipse cx="50" cy="6" rx="20" ry="5" fill="none" stroke="#ffd36b" strokeWidth="4" />;
    case 'scarf': return <g fill={ink} opacity=".85"><path d="M22 80q28 12 56 0v8q-28 12-56 0z" /><rect x="60" y="84" width="9" height="14" rx="3" /></g>;
    default: return null;
  }
};

/** Draws the avatar. Any missing option is derived from the seed, so everyone gets a distinct default. */
export function AvatarArt({ config, size = 44, label }: { config: Record<string, unknown> | AvatarConfig | null | undefined; size?: number; label?: string }) {
  const c = resolveAvatar(config); const pal = AVATAR_PALETTES.find((p) => p.id === c.palette) ?? AVATAR_PALETTES[0]; const gid = `g${c.seed.replace(/[^a-z0-9]/gi, '').slice(0, 12)}${c.palette}${c.shape}`;
  return (
    <svg width={size} height={size} viewBox="0 -8 100 112" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false" style={{ display: 'block', overflow: 'visible' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={pal.a} /><stop offset="1" stopColor={pal.b} /></linearGradient></defs>
      <path d={SHAPES[c.shape] ?? SHAPES.blob} fill={`url(#${gid})`} />
      {eyes(c.eyes, pal.ink)}{mouth(c.mouth, pal.ink)}{extra(c.extra, pal.ink)}
    </svg>
  );
}

export interface AvatarLike { mode: 'avatar' | 'photo' | 'both'; config: Record<string, unknown>; photoUrl: string | null }
export function Avatar({ avatar, size = 44, name, anonymous }: { avatar?: AvatarLike | null; size?: number; name?: string; anonymous?: boolean }) {
  const style = { width: size, height: size, borderRadius: '50%', overflow: 'visible', flex: 'none', display: 'inline-block' } as const;
  if (anonymous) return <span style={{ ...style, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', display: 'inline-grid', placeItems: 'center', color: 'var(--text-muted)' }} role="img" aria-label="Anonymous"><svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8c3-2 13-2 16 0v4a8 8 0 0 1-16 0z M8.5 11.5v.1 M15.5 11.5v.1 M9 15c1.5 1 4.5 1 6 0" /></svg></span>;
  // 'both': the photo with the person's drawn avatar as a small badge; 'photo': the photo alone; 'avatar': the drawn avatar alone.
  if (avatar && avatar.photoUrl && avatar.mode === 'both') return <span style={{ ...style, position: 'relative' }}><img src={avatar.photoUrl} alt={name ? `${name}’s photo` : ''} width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }} /><span style={{ position: 'absolute', right: -size * 0.06, bottom: -size * 0.06, width: size * 0.42, height: size * 0.42, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--surface, #fff)', background: 'var(--surface-2)' }}><AvatarArt config={avatar.config} size={size * 0.42} /></span></span>;
  if (avatar && avatar.photoUrl && avatar.mode !== 'avatar') return <img src={avatar.photoUrl} alt={name ? `${name}’s photo` : ''} width={size} height={size} style={{ ...style, objectFit: 'cover' }} />;
  return <span style={style}><AvatarArt config={avatar?.config} size={size} label={name ? `${name}’s avatar` : undefined} /></span>;
}
