import { flatNodes, sceneNodes } from '../../lib/journey';

const NODES = flatNodes(); const REL = (() => { const seen = new Set<string>(); const out: [string, string][] = []; for (const n of sceneNodes()) for (const r of n.related) { const k = [n.id, r].sort().join('|'); if (!seen.has(k) && NODES.some((x) => x.id === r)) { seen.add(k); out.push([n.id, r]); } } return out; })();
const at = (id: string) => NODES.find((n) => n.id === id)!;

/** The CSS/SVG version of the FREEVERSE scene. It is the fallback (no WebGL, reduced motion, low data) and the placeholder
 *  until the 3D scene draws its first frame. The same chapter attribute that steers the 3D camera steers these layers. */
export function OrbitArt() {
  return (
    <svg className="orbit-art" viewBox="0 0 800 800" role="presentation" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="oa-core" cx="40%" cy="35%" r="75%"><stop offset="0" stopColor="#7df4ff" /><stop offset=".55" stopColor="#3b9bff" /><stop offset="1" stopColor="#6d5bff" /></radialGradient>
        <radialGradient id="oa-halo" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#3ee6f4" stopOpacity=".42" /><stop offset="1" stopColor="#3ee6f4" stopOpacity="0" /></radialGradient>
      </defs>
      <g className="oa-world">
        <circle cx="400" cy="400" r="210" fill="url(#oa-halo)" />
        <g className="oa-shells">{[1, 2, 3, 4, 5].map((i) => <ellipse key={i} cx="400" cy="400" rx={70 + i * 58} ry={(70 + i * 58) * 0.42} fill="none" stroke="#a58bff" strokeWidth="1" opacity=".6" />)}
          {[[1, 1], [3, 2], [7, 3], [12, 4], [24, 5]].map(([n, i]) => Array.from({ length: n! }, (_, k) => { const a = (k / n!) * Math.PI * 2 + i! * 0.4; const rx = 70 + i! * 58; return <circle key={`${i}-${k}`} cx={400 + Math.cos(a) * rx} cy={400 + Math.sin(a) * rx * 0.42} r={i === 1 ? 5 : 3} fill={i === 1 ? '#f7b2ff' : '#6fe9f6'} />; }))}</g>
        <g className="oa-identity">{[0, 1, 2, 3, 4, 5].map((i) => <ellipse key={i} cx="400" cy="400" rx={150 + i * 22} ry={(150 + i * 22) * (0.35 + i * 0.07)} transform={`rotate(${i * 31 - 40} 400 400)`} fill="none" stroke={['#3ee6f4', '#4f9dff', '#a58bff', '#f7b2ff', '#6ff0cf', '#ffd27a'][i]} strokeWidth="1.4" opacity=".7" />)}</g>
        <g className="oa-links">{REL.map(([a, b]) => <line key={a + b} x1={at(a).x} y1={at(a).y} x2={at(b).x} y2={at(b).y} stroke="#4f9dff" strokeWidth="1" opacity=".5" />)}</g>
        <g className="oa-nodes">{NODES.map((n) => <circle key={n.id} className={`oa-node oa-${n.group}`} cx={n.x} cy={n.y} r="9" fill={n.accent} />)}</g>
        <g className="oa-core"><circle cx="400" cy="400" r="62" fill="url(#oa-core)" /><ellipse cx="400" cy="400" rx="132" ry="52" transform="rotate(-24 400 400)" fill="none" stroke="#a58bff" strokeWidth="2.5" /><circle cx="515" cy="352" r="7" fill="#f7b2ff" /></g>
      </g>
    </svg>
  );
}
