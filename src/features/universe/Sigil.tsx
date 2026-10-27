import type { ReactNode } from 'react';
import type { SigilKind } from '../../../shared/universe-theme';

// Original geometric artwork, one motif per Universe. Drawn with the Universe's accent (via CSS `--accent`), purely
// decorative (aria-hidden); the page's real content never depends on it. Motion is CSS-only and switched off by the
// reduced-motion and focus modes (see journey.css).
const R = (n: number) => Array.from({ length: n }, (_, i) => i);
const pol = (cx: number, cy: number, r: number, a: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;

const ART: Record<SigilKind, () => ReactNode> = {
  constellation: () => { const pts = R(9).map((i) => pol(160, 100, 40 + (i % 3) * 22, i * 0.7)); return <>
    {pts.map((p, i) => <line key={i} x1={p[0]} y1={p[1]} x2={pts[(i + 3) % 9]![0]} y2={pts[(i + 3) % 9]![1]} className="sg-line" />)}
    {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i % 3 === 0 ? 6 : 4} className="sg-dot sg-float" style={{ animationDelay: `${i * 0.3}s` }} />)}</>; },
  pages: () => <>{R(5).map((i) => <rect key={i} x={70 + i * 14} y={150 - i * 24} width="120" height="22" rx="4" className="sg-fill" style={{ opacity: 0.25 + i * 0.15 }} />)}<path d="M200 150 C230 130 240 90 270 50" className="sg-stroke" /><circle cx="270" cy="50" r="6" className="sg-dot" /></>,
  path: () => <><path d="M30 170 C90 170 90 110 150 110 S210 50 290 40" className="sg-stroke" />{[[30, 170], [90, 140], [150, 110], [215, 75], [290, 40]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 4 ? 8 : 5} className="sg-dot sg-float" style={{ animationDelay: `${i * 0.25}s` }} />)}</>,
  council: () => <>{R(9).map((i) => { const [x, y] = pol(160, 100, 66, (i / 9) * Math.PI * 2); return <g key={i}><line x1="160" y1="100" x2={x} y2={y} className="sg-line" /><circle cx={x} cy={y} r="8" className="sg-dot sg-pulse" style={{ animationDelay: `${i * 0.22}s` }} /></g>; })}<circle cx="160" cy="100" r="14" className="sg-fill" /></>,
  sunburst: () => <>{R(16).map((i) => { const [x1, y1] = pol(160, 120, 28, Math.PI + (i / 15) * Math.PI); const [x2, y2] = pol(160, 120, 90 + (i % 2) * 20, Math.PI + (i / 15) * Math.PI); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="sg-stroke sg-pulse" style={{ animationDelay: `${i * 0.1}s` }} />; })}<circle cx="160" cy="120" r="20" className="sg-fill" /></>,
  blocks: () => <>{[[90, 120, 60, 40], [150, 120, 60, 40], [120, 80, 60, 40], [180, 80, 50, 40], [150, 40, 60, 40]].map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="5" className="sg-fill sg-snap" style={{ animationDelay: `${i * 0.2}s`, opacity: 0.4 + i * 0.12 }} />)}</>,
  stalls: () => <>{R(4).map((i) => <g key={i} transform={`translate(${40 + i * 62} 70)`}><path d="M0 30 L6 0 H48 L54 30 Z" className="sg-fill" style={{ opacity: 0.35 + (i % 2) * 0.3 }} /><rect x="4" y="30" width="46" height="50" rx="3" className="sg-stroke" /></g>)}</>,
  lattice: () => <>{R(5).map((r) => R(5).map((c) => <circle key={`${r}${c}`} cx={60 + c * 50} cy={35 + r * 32} r="3.5" className="sg-dot" />))}{R(4).map((r) => R(5).map((c) => <line key={`v${r}${c}`} x1={60 + c * 50} y1={35 + r * 32} x2={60 + c * 50} y2={67 + r * 32} className="sg-line" />))}{R(5).map((r) => R(4).map((c) => (r + c) % 2 === 0 ? <line key={`h${r}${c}`} x1={60 + c * 50} y1={35 + r * 32} x2={110 + c * 50} y2={35 + r * 32} className="sg-line" /> : null))}</>,
  hands: () => <><path d="M40 150 C80 150 100 110 150 100" className="sg-stroke" /><path d="M280 150 C240 150 220 110 170 100" className="sg-stroke" /><circle cx="160" cy="96" r="16" className="sg-fill sg-pulse" />{R(3).map((i) => <circle key={i} cx="160" cy="96" r={26 + i * 16} className="sg-ring sg-ripple" style={{ animationDelay: `${i * 0.6}s` }} />)}</>,
  breath: () => <>{R(6).map((i) => <circle key={i} cx="160" cy="100" r={18 + i * 15} className="sg-ring sg-breathe" style={{ animationDelay: `${i * 0.5}s`, opacity: 1 - i * 0.14 }} />)}</>,
  coins: () => <>{[30, 52, 74, 100, 130].map((h, i) => <rect key={i} x={60 + i * 42} y={170 - h} width="26" height={h} rx="4" className="sg-fill" style={{ opacity: 0.3 + i * 0.14 }} />)}<path d="M60 150 L102 128 L144 134 L186 98 L228 70 L270 40" className="sg-stroke" /></>,
  frames: () => <>{[[50, 50, 120, 80, -6], [110, 70, 120, 80, 4], [170, 40, 110, 80, -2]].map(([x, y, w, h, r], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="8" transform={`rotate(${r} ${Number(x) + Number(w) / 2} ${Number(y) + Number(h) / 2})`} className={i === 1 ? 'sg-fill sg-float' : 'sg-stroke sg-float'} style={{ animationDelay: `${i * 0.5}s` }} />)}</>,
  marquee: () => <><path d="M60 40 H260 L240 150 H80 Z" className="sg-stroke" />{R(14).map((i) => <circle key={i} cx={64 + i * 14.5} cy={40} r="3.5" className="sg-dot sg-pulse" style={{ animationDelay: `${(i % 4) * 0.25}s` }} />)}<path d="M100 150 C130 100 190 100 220 150" className="sg-fill" style={{ opacity: 0.4 }} /></>,
  flasks: () => <>{[0, 1, 2].map((i) => <g key={i} transform={`translate(${70 + i * 70} 40)`}><path d="M18 0 H32 V40 L50 96 Q52 108 40 108 H10 Q-2 108 0 96 L18 40 Z" className="sg-stroke" /><path d={`M6 ${80 - i * 8} H44 L50 96 Q52 108 40 108 H10 Q-2 108 0 96 Z`} className="sg-fill sg-ripple" style={{ animationDelay: `${i * 0.5}s` }} /></g>)}</>,
  pixels: () => <>{R(6).map((r) => R(10).map((c) => { const on = (r * 7 + c * 3) % 5 < 2; return <rect key={`${r}${c}`} x={50 + c * 24} y={30 + r * 22} width="18" height="16" rx="3" className={on ? 'sg-fill sg-snap' : 'sg-stroke'} style={on ? { animationDelay: `${((r + c) % 6) * 0.2}s` } : { opacity: 0.35 }} />; }))}</>,
};

export function UniverseSigil({ kind, label }: { kind: SigilKind; label?: string }) {
  return <svg className={`sigil sigil-${kind}`} viewBox="0 0 320 200" aria-hidden="true" focusable="false" data-sigil={kind} data-label={label}>{ART[kind]()}</svg>;
}
