import { useRef } from 'react';
import { Link } from '../../lib/router';
import { Badge } from '../../ui/kit';
import { UniverseSigil } from './Sigil';
import { themeFor } from '../../../shared/universe-theme';
import { useMotion } from '../../motion/react';
import type { UniverseView } from '../../../shared/api/catalog';

const tone = (s: string) => (s === 'available' ? 'ok' : s === 'partial' ? 'cyan' : undefined) as 'ok' | 'cyan' | undefined;

/** Horizontal exploration of the Universes. A native scroll region (arrow keys, touch, wheel and the buttons all work),
 *  plus mouse drag. Each item is an ordinary link, so keyboard users move through it with Tab and are never trapped. */
export function OrbitMap({ items }: { items: UniverseView[] }) {
  const ref = useRef<HTMLDivElement>(null); const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const motion = useMotion();
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.max(240, (ref.current?.clientWidth ?? 600) * 0.8), behavior: motion.mode === 'off' || motion.mode === 'calm' || motion.mode === 'focus' ? 'auto' : 'smooth' });
  const onDown = (e: React.PointerEvent) => { if (e.pointerType !== 'mouse' || e.button !== 0 || !ref.current) return; drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false }; };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d || !ref.current) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 4) d.moved = true; ref.current.scrollLeft = d.left - dx; };
  const end = () => { const d = drag.current; drag.current = null; if (d?.moved) { const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); }; window.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0); } };
  return <section className="orbit-map stack-sm" aria-labelledby="om-h" data-testid="orbit-map">
    <div className="om-bar"><div><h2 id="om-h" className="h-md">Explore along the orbit</h2><p className="muted universe-cluster-hint">Scroll sideways, drag, or use the arrows. Every card is a normal link.</p></div>
      <div className="row-wrap"><button type="button" className="btn btn-secondary btn-sm" onClick={() => by(-1)} aria-label="Scroll Universes back">←</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => by(1)} aria-label="Scroll Universes forward">→</button></div></div>
    <div ref={ref} className="om-viewport om-grab" role="region" aria-label="Universes, horizontal list" tabIndex={0} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} onDragStart={(e) => e.preventDefault()}>
      <ul className="om-track" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{items.map((u) => { const th = themeFor(u.id);
        return <li key={u.id} className="om-item"><article className={`card uni-card spatial uni-layout-${th?.layout ?? 'ordered'}`} style={{ ['--accent' as string]: u.accent, padding: 12, display: 'grid', gap: 6 }}>
          {th && <UniverseSigil kind={th.sigil} />}
          <div className="spread"><h3 className="h-sm"><Link to={`/universes/${u.id}`}>{u.name}</Link></h3><Badge tone={tone(u.status)}>{u.statusLabel}</Badge></div><p className="muted">{u.tagline}</p></article></li>; })}</ul></div>
  </section>;
}
