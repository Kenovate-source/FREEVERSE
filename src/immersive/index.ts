// FREEVERSE immersive bundle: a single lightweight three.js scene, choreographed by GSAP ScrollTrigger from NATIVE scrolling.
// Loaded lazily (dist/immersive.js) only when the device, settings and page allow it. It never pins, traps or hijacks scrolling.
import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  PerspectiveCamera, Points, Scene, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3, WebGLRenderer, CatmullRomCurve3, Line, MathUtils,
} from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ImmersiveApi, SceneHandle, SceneOptions } from './types';
import { KEYS, mixKey, placeNodes, clamp01, type Group as NodeGroup } from './keyframes';

gsap.registerPlugin(ScrollTrigger);

const BRAND = { cyan: new Color('#3ee6f4'), blue: new Color('#4f9dff'), violet: new Color('#a58bff'), pink: new Color('#f7b2ff') };
const QUALITY = { high: { dpr: 1.75, stars: 900, fps: 60, aa: true, seg: 48 }, medium: { dpr: 1.35, stars: 450, fps: 45, aa: false, seg: 32 }, low: { dpr: 1, stars: 200, fps: 30, aa: false, seg: 24 } } as const;

const SOFT_POINT_VERT = `attribute float size; attribute vec3 tint; varying vec3 vTint; uniform float scale; void main(){ vTint = tint; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const SOFT_POINT_FRAG = `varying vec3 vTint; uniform float opacity; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vTint, a * opacity); }`;
const CORE_VERT = `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const CORE_FRAG = `varying vec3 vN; varying vec3 vV; uniform vec3 cA; uniform vec3 cB; uniform vec3 cC; uniform float glow;
void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.2); vec3 base = mix(cB, cA, clamp(vN.y*0.5+0.55, 0.0, 1.0)); vec3 rim = mix(cC, cA, f); gl_FragColor = vec4(base*(0.55+0.45*glow) + rim*f*1.25, 1.0); }`;

function softPoints(positions: Float32Array, sizes: Float32Array, tints: Float32Array, scale: number, opacity: number) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3)); g.setAttribute('size', new Float32BufferAttribute(sizes, 1)); g.setAttribute('tint', new Float32BufferAttribute(tints, 3));
  const m = new ShaderMaterial({ vertexShader: SOFT_POINT_VERT, fragmentShader: SOFT_POINT_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { scale: { value: scale }, opacity: { value: opacity } } });
  return new Points(g, m);
}
// Per-identity orbit parameters: direction, angular speed (rad/s), radial offset from the ring, brightness. Deliberately unequal.
const ID_ORBIT = [
  { dir: 1, sp: 0.55, off: 0.0, lift: 0.0, size: 0.075, bright: 1 }, { dir: -1, sp: 0.9, off: 0.12, lift: 0.05, size: 0.06, bright: 0.75 }, { dir: 1, sp: 0.32, off: -0.1, lift: -0.06, size: 0.085, bright: 0.9 },
  { dir: -1, sp: 0.7, off: 0.18, lift: 0.08, size: 0.055, bright: 0.65 }, { dir: 1, sp: 1.1, off: -0.16, lift: 0.0, size: 0.065, bright: 1 }, { dir: -1, sp: 0.42, off: 0.08, lift: -0.08, size: 0.07, bright: 0.8 },
];
// Small deterministic generator so the scene looks the same on every visit and in tests.
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function mount(o: SceneOptions): SceneHandle {
  const q = QUALITY[o.quality];
  const renderer = new WebGLRenderer({ antialias: q.aa, alpha: true, powerPreference: o.quality === 'high' ? 'high-performance' : 'low-power' });
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement; canvas.className = 'journey-canvas'; canvas.setAttribute('aria-hidden', 'true'); canvas.tabIndex = -1;
  o.stage.appendChild(canvas);
  const scene = new Scene(); const cam = new PerspectiveCamera(42, 1, 0.1, 120);
  const world = new Group(); scene.add(world);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };

  // --- core and emblem ring (the citizen at the centre) ---
  const coreMat = track(new ShaderMaterial({ vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, uniforms: { cA: { value: BRAND.cyan }, cB: { value: BRAND.blue }, cC: { value: BRAND.violet }, glow: { value: 1 } } }));
  const core = new Mesh(track(new SphereGeometry(0.95, q.seg, q.seg)), coreMat); world.add(core);
  const halo = softPoints(new Float32Array([0, 0, 0]), new Float32Array([7.5]), new Float32Array([0.25, 0.75, 1]), 1, 0.35); world.add(halo); disposables.push(halo.geometry, halo.material as ShaderMaterial);
  const ringMat = track(new MeshBasicMaterial({ color: BRAND.violet, transparent: true, opacity: 0.85 }));
  const emblemRing = new Mesh(track(new TorusGeometry(1.95, 0.016, 8, q.seg * 3)), ringMat); emblemRing.rotation.set(1.15, 0.2, 0.35); world.add(emblemRing);
  const orbitNodeMat = track(new MeshBasicMaterial({ color: BRAND.pink })); const orbitNode = new Mesh(track(new SphereGeometry(0.075, 12, 12)), orbitNodeMat); emblemRing.add(orbitNode);

  // --- identity rings ---
  const identity = new Group(); world.add(identity); const idRings: Mesh[] = []; const idParticles: { m: Mesh; mat: MeshBasicMaterial; dir: number; sp: number; off: number; lift: number; size: number; bright: number; rad: number }[] = [];
  o.identityColors.slice(0, 6).forEach((c, i) => {
    const m = track(new MeshBasicMaterial({ color: new Color(c), transparent: true, opacity: 0 })); const r = new Mesh(track(new TorusGeometry(2.5 + i * 0.32, 0.01, 6, q.seg * 3)), m);
    r.rotation.set(0.9 + i * 0.37, i * 0.8, i * 0.5); identity.add(r); idRings.push(r);
    // each identity circle carries its own particle: different direction, speed, brightness and distance from its ring
    const pm = track(new MeshBasicMaterial({ color: new Color(c).lerp(new Color('#ffffff'), 0.35), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
    const pd = ID_ORBIT[i % ID_ORBIT.length]!; const pn = new Mesh(track(new SphereGeometry(pd.size, 10, 10)), pm); r.add(pn); idParticles.push({ m: pn, mat: pm, ...pd, rad: 2.5 + i * 0.32 });
  });

  // --- Universe nodes, placed in four sectors; relations come from the real cross-links ---
  const pos = placeNodes(o.nodes); const nodeMesh = new Map<string, Mesh>(); const nodeMats = new Map<string, MeshBasicMaterial>(); const nodeVec = new Map<string, Vector3>();
  const nodeGeo = track(new SphereGeometry(0.17, 16, 16));
  for (const n of o.nodes) {
    const p = pos.get(n.id)!; const m = track(new MeshBasicMaterial({ color: new Color(n.accent), transparent: true, opacity: 0 })); const mesh = new Mesh(nodeGeo, m);
    mesh.position.set(p[0], p[1], p[2]); mesh.scale.setScalar(0.001); world.add(mesh); nodeMesh.set(n.id, mesh); nodeMats.set(n.id, m); nodeVec.set(n.id, new Vector3(p[0], p[1], p[2]));
  }
  const linkPairs: [string, string][] = []; const seen = new Set<string>();
  for (const n of o.nodes) for (const r of n.related) { const k = [n.id, r].sort().join('|'); if (nodeVec.has(r) && !seen.has(k)) { seen.add(k); linkPairs.push([n.id, r]); } }
  const linkGeo = track(new BufferGeometry()); linkGeo.setAttribute('position', new Float32BufferAttribute(linkPairs.flatMap(([a, b]) => [...nodeVec.get(a)!.toArray(), ...nodeVec.get(b)!.toArray()]), 3));
  const linkMat = track(new LineBasicMaterial({ color: BRAND.blue, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })); const links = new LineSegments(linkGeo, linkMat); world.add(links);
  // cluster lines: nodes of the same group, chained, brightened when that group is the chapter's subject
  const groups: NodeGroup[] = ['knowledge', 'community', 'work', 'media']; const clusters = new Map<NodeGroup, LineSegments>();
  for (const g of groups) {
    const ids = o.nodes.filter((n) => n.group === g).map((n) => n.id); const pts: number[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pts.push(...nodeVec.get(ids[i]!)!.toArray(), ...nodeVec.get(ids[j]!)!.toArray());
    const geo = track(new BufferGeometry()); geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
    const mat = track(new LineBasicMaterial({ color: BRAND.cyan, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })); const l = new LineSegments(geo, mat); world.add(l); clusters.set(g, l);
  }
  // pathways: arcs from the core out to the work/opportunity nodes (drawn progressively)
  const pathLines: Line[] = []; const pathMat = track(new LineBasicMaterial({ color: BRAND.pink, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  for (const n of o.nodes.filter((x) => x.group === 'work')) {
    const e = nodeVec.get(n.id)!; const mid = e.clone().multiplyScalar(0.5).add(new Vector3(0, 1.1, 0));
    const g = track(new BufferGeometry().setFromPoints(new CatmullRomCurve3([new Vector3(0, 0, 0), mid, e]).getPoints(40))); const ln = new Line(g, pathMat); world.add(ln); pathLines.push(ln);
  }
  // pulse rings for media / events: expand with scroll progress through the chapter
  const pulseMat = track(new MeshBasicMaterial({ color: BRAND.pink, transparent: true, opacity: 0, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })); const pulseGeo = track(new TorusGeometry(1, 0.008, 6, q.seg * 3));
  const pulses = [0, 1, 2].map((i) => { const m = new Mesh(pulseGeo, pulseMat.clone()); disposables.push(m.material as MeshBasicMaterial); m.rotation.x = Math.PI / 2; world.add(m); return { m, i }; });
  // governance shells: 1 - 3 - 7 - 12 - 24 seats as concentric rings of points (the real structure)
  const shellCounts = [1, 3, 7, 12, 24]; const shells = new Group(); world.add(shells); const shellObjs: Points[] = []; const shellRings: Mesh[] = [];
  // 2.5: every ring of the structure turns on its own: its own direction, speed, tilt and depth
  const shellSpec = [{ dir: 1, sp: 0.1, tilt: 0.0, y: 0.0 }, { dir: -1, sp: 0.16, tilt: 0.07, y: 0.22 }, { dir: 1, sp: 0.07, tilt: -0.09, y: -0.3 }, { dir: -1, sp: 0.12, tilt: 0.11, y: 0.42 }, { dir: 1, sp: 0.05, tilt: -0.06, y: -0.5 }];
  const shellGroups: Group[] = [];
  shellCounts.forEach((n, ring) => {
    const rad = 1.7 + ring * 0.95; const p = new Float32Array(n * 3), s = new Float32Array(n).fill(ring === 0 ? 0.5 : 0.26), t = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + ring * 0.4; p.set([Math.cos(a) * rad, 0, Math.sin(a) * rad], k * 3); const c = ring === 0 ? BRAND.pink : ring < 3 ? BRAND.violet : BRAND.cyan; t.set([c.r, c.g, c.b], k * 3); }
    const rg = new Group(); shells.add(rg); shellGroups.push(rg);
    const pts = softPoints(p, s, t, 1, 0); rg.add(pts); shellObjs.push(pts); disposables.push(pts.geometry, pts.material as ShaderMaterial);
    const ringMesh = new Mesh(track(new TorusGeometry(rad, 0.006, 4, q.seg * 3)), track(new MeshBasicMaterial({ color: ring % 2 ? BRAND.cyan : BRAND.violet, transparent: true, opacity: 0 }))); ringMesh.rotation.x = Math.PI / 2; rg.add(ringMesh); shellRings.push(ringMesh);
  });
  // --- flow particles. Citizen -> Universe: particles ORBIT each Universe. Universe -> Universe: PULSES travel the real cross-links. Cluster flow: trailing energy along a group's structure. ---
  const FR = rng(31); const perLink = o.quality === 'high' ? 2 : 1; const perOrbit = o.quality === 'low' ? 1 : 2; const trail = o.quality === 'low' ? 2 : 4;
  const accent = new Map(o.nodes.map((n) => [n.id, new Color(n.accent)]));
  const pulseP: { a: Vector3; b: Vector3; u: number; sp: number; dir: number; k: Color; lift: number }[] = [];
  for (const [a, b] of linkPairs) for (let k = 0; k < perLink; k++) pulseP.push({ a: nodeVec.get(a)!, b: nodeVec.get(b)!, u: FR(), sp: 0.06 + FR() * 0.16, dir: FR() > 0.5 ? 1 : -1, k: accent.get(k % 2 ? a : b)!.clone().lerp(BRAND.pink, 0.25), lift: 0.15 + FR() * 0.3 });
  // the geometry copies its inputs, so mkFlow hands back the geometry's own arrays to write through
  const mkFlow = (n: number, size: number) => { const pos = new Float32Array(n * 3), sz = new Float32Array(n).fill(size), tn = new Float32Array(n * 3); const pts = softPoints(pos, sz, tn, 1, 0); pts.frustumCulled = false; world.add(pts); disposables.push(pts.geometry, pts.material as ShaderMaterial); const A = pts.geometry.attributes; return { pts, pos: A.position!.array as Float32Array, sz: A.size!.array as Float32Array, tn: A.tint!.array as Float32Array }; };
  const pulseF = mkFlow(pulseP.length, 0.3); pulseP.forEach((p, i) => pulseF.tn.set([p.k.r, p.k.g, p.k.b], i * 3));
  const orbitP: { c: Vector3; u: Vector3; v: Vector3; r: number; sp: number; ph: number; tint: Color }[] = [];
  for (const n of o.nodes) for (let k = 0; k < perOrbit; k++) {
    const nrm = new Vector3(FR() - 0.5, FR() - 0.5, FR() - 0.5).normalize(); const u = new Vector3().crossVectors(nrm, new Vector3(0.3, 1, 0.2)).normalize(); const v = new Vector3().crossVectors(nrm, u).normalize();
    orbitP.push({ c: nodeVec.get(n.id)!, u, v, r: 0.36 + FR() * 0.3 + k * 0.12, sp: (0.5 + FR() * 0.9) * (FR() > 0.5 ? 1 : -1), ph: FR() * 6.28, tint: new Color(n.accent).lerp(new Color('#ffffff'), 0.4) });
  }
  const orbitF = mkFlow(orbitP.length, 0.17); orbitP.forEach((p, i) => orbitF.tn.set([p.tint.r, p.tint.g, p.tint.b], i * 3));
  // cluster flow: along each group's chain of nodes, as a closed loop, several particles trailing one another
  const loops: { pts: Vector3[]; len: number; sp: number; g: NodeGroup; k: Color }[] = [];
  const groupTint: Record<NodeGroup, Color> = { knowledge: BRAND.cyan, community: BRAND.violet, work: BRAND.pink, media: BRAND.blue };
  for (const g of groups) { const pts = o.nodes.filter((n) => n.group === g).map((n) => nodeVec.get(n.id)!); if (pts.length > 1) loops.push({ pts, len: pts.length, sp: g === 'knowledge' ? 0.22 : 0.11 + FR() * 0.08, g, k: groupTint[g] }); }
  const clusterF = mkFlow(loops.length * trail, 0.22);
  loops.forEach((l, li) => { for (let k = 0; k < trail; k++) clusterF.tn.set([l.k.r, l.k.g, l.k.b], (li * trail + k) * 3); });
  for (const f of [pulseF, orbitF, clusterF]) (f.pts.geometry.attributes.tint as Float32BufferAttribute).needsUpdate = true;
  // star dust: sparse, static, very quiet
  const R = rng(7); const sp = new Float32Array(q.stars * 3), ss = new Float32Array(q.stars), st = new Float32Array(q.stars * 3);
  for (let i = 0; i < q.stars; i++) { const r = 16 + R() * 40, a = R() * Math.PI * 2, e = (R() - 0.5) * 1.6; sp.set([Math.cos(a) * r, Math.sin(e) * r * 0.6, Math.sin(a) * r], i * 3); ss[i] = 0.08 + R() * 0.16; const c = R() > 0.6 ? BRAND.violet : BRAND.cyan; st.set([c.r, c.g, c.b], i * 3); }
  const stars = softPoints(sp, ss, st, 1, 0.55); scene.add(stars); disposables.push(stars.geometry, stars.material as ShaderMaterial);

  // --- state: the chapter coordinate t is tweened by GSAP ScrollTrigger from the real scroll position ---
  const state = { t: 0 }; let hover: string | null = null; let frames = 0; let dirty = true; let paused = false; let onScreen = true; let disposed = false; let ready = false;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const sections = Array.from(o.journey.querySelectorAll<HTMLElement>(':scope > [data-chapter]'));
  const triggers: ScrollTrigger[] = []; const tweens: gsap.core.Tween[] = [];
  if (o.scrollLinked) {
    for (let i = 0; i < sections.length - 1; i++) {
      const tw = gsap.fromTo(state, { t: i }, { t: i + 1, ease: 'none', immediateRender: i === 0, overwrite: false,
        scrollTrigger: { trigger: sections[i]!, start: 'center center', endTrigger: sections[i + 1]!, end: 'center center', scrub: 0.8, onUpdate: () => { dirty = true; } } });
      tweens.push(tw); if (tw.scrollTrigger) triggers.push(tw.scrollTrigger);
    }
    // gentle depth on decorative elements only (never on text blocks or controls)
    o.journey.querySelectorAll<HTMLElement>('[data-depth]').forEach((el) => {
      const d = Number(el.dataset.depth || 0); const tw = gsap.fromTo(el, { yPercent: d * 6 }, { yPercent: d * -6, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
      tweens.push(tw); if (tw.scrollTrigger) triggers.push(tw.scrollTrigger);
    });
  } else { // no scroll-linking: pick the chapter nearest the viewport centre, no tweening
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { state.t = sections.indexOf(e.target as HTMLElement); dirty = true; } }, { rootMargin: '-45% 0px -45% 0px' });
    sections.forEach((s) => io.observe(s)); disposables.push({ dispose: () => io.disconnect() });
  }

  const onMove = (e: PointerEvent) => { if (!o.pointer || e.pointerType === 'touch') return; pointer.x = (e.clientX / window.innerWidth - 0.5) * 2; pointer.y = (e.clientY / window.innerHeight - 0.5) * 2; dirty = true; };
  window.addEventListener('pointermove', onMove, { passive: true });
  const resize = () => {
    const w = o.stage.clientWidth || window.innerWidth, h = o.stage.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr)); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); dirty = true;
    const mat = halo.material as ShaderMaterial; mat.uniforms.scale!.value = h * 0.5; (stars.material as ShaderMaterial).uniforms.scale!.value = h * 0.5; shellObjs.forEach((p) => { (p.material as ShaderMaterial).uniforms.scale!.value = h * 0.5; }); for (const f of [pulseF, orbitF, clusterF]) (f.pts.material as ShaderMaterial).uniforms.scale!.value = h * 0.5;
  };
  const ro = new ResizeObserver(resize); ro.observe(o.stage); resize();
  const vis = new IntersectionObserver((es) => { onScreen = !!es[0]?.isIntersecting; if (onScreen) dirty = true; }); vis.observe(o.stage);
  const onVis = () => { if (!document.hidden) dirty = true; }; document.addEventListener('visibilitychange', onVis);
  const onLost = (e: Event) => { e.preventDefault(); o.onError(new Error('webglcontextlost')); }; canvas.addEventListener('webglcontextlost', onLost);

  const tmp = new Vector3(); let last = 0; let raf = 0; let running = false;
  const nodeTarget = (id: string, g: NodeGroup, mk: ReturnType<typeof mixKey>) => {
    const emph = 0.5 + 0.5 * mk.hl[g]; const hov = hover === id ? 1 : 0; return { scale: mk.layers.nodes * (0.75 + 0.55 * mk.hl[g] + 0.5 * hov) * (hover && hover !== id ? 0.9 : 1), opacity: mk.layers.nodes * (hover ? (hov ? 1 : 0.45) : emph) };
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame); running = true;
    if (disposed || paused || document.hidden || !onScreen) { running = false; return; }
    const minGap = 1000 / q.fps; const ambient = now - last > 1000 / 20; // breathe at ~20fps when nothing else changes
    if (!dirty && !ambient) return; if (now - last < minGap) return; last = now; dirty = false;
    const mk = mixKey(state.t); const wide = clamp01((cam.aspect - 0.9) / 0.9); const L = mk.layers;
    pointer.sx = MathUtils.lerp(pointer.sx, pointer.x, 0.06); pointer.sy = MathUtils.lerp(pointer.sy, pointer.y, 0.06);
    cam.position.set(pointer.sx * 0.35, mk.camY - pointer.sy * 0.25, mk.camZ * (cam.aspect < 0.8 ? 1.5 : cam.aspect < 1.1 ? 1.15 : 1)); cam.lookAt(0, 0, 0);
    world.position.x = mk.x * 2.7 * wide; world.position.y = (mk.y ?? 0) + (cam.aspect < 0.9 ? 1.7 * (1 - L.nodes * 0.7) * (state.t < 1 ? 1 : 0.5) : 0);
    const T = (now / 1000) * (o.drift ?? 0); // continuous time-based motion, independent of scroll; 0 means none
    world.rotation.y = mk.rotY + pointer.sx * 0.08 + T * 0.045; world.rotation.x = mk.rotX;
    const breathe = 1 + Math.sin(now / 1900) * 0.015; core.scale.setScalar(breathe * (1 + 0.05 * (1 - L.nodes)));
    coreMat.uniforms.glow!.value = L.glow; (halo.material as ShaderMaterial).uniforms.opacity!.value = 0.18 + 0.3 * L.glow;
    emblemRing.rotation.z = 0.35 + state.t * 0.6 + T * 0.22; orbitNode.position.set(1.95, 0, 0); orbitNode.parent!.rotation.z = 0.35 + state.t * 0.6 - T * 0.5; // ring and its orbiting node turn in opposite directions
    idRings.forEach((r, i) => { (r.material as MeshBasicMaterial).opacity = 0.55 * L.identity; r.scale.setScalar(0.6 + 0.4 * L.identity); r.rotation.z = i * 0.5 + state.t * 0.35 * (i % 2 ? 1 : -1) + T * (0.1 + 0.06 * i) * (i % 2 ? -1 : 1); r.rotation.x += 0; const d = idParticles[i]; if (d) { const a = i * 1.9 + (T * d.sp + state.t * 0.25) * d.dir; const rr = d.rad + d.off; d.m.position.set(Math.cos(a) * rr, Math.sin(a) * rr, d.lift); d.mat.opacity = 0.95 * d.bright * L.identity; d.m.scale.setScalar(0.7 + 0.3 * L.identity); } });
    for (const n of o.nodes) { const m = nodeMesh.get(n.id)!, mat = nodeMats.get(n.id)!; const t = nodeTarget(n.id, n.group, mk); m.scale.setScalar(Math.max(0.001, t.scale)); mat.opacity = clamp01(t.opacity); }
    linkMat.opacity = 0.05 + 0.3 * L.links; linkMat.color.copy(BRAND.blue);
    for (const [g, l] of clusters) (l.material as LineBasicMaterial).opacity = 0.55 * mk.hl[g] + (hover ? 0 : 0);
    pathMat.opacity = 0.8 * L.paths; pathLines.forEach((ln) => ln.geometry.setDrawRange(0, Math.floor(41 * clamp01(L.paths * 1.1))));
    pulses.forEach(({ m, i }) => { const ph = ((1 - L.pulses) * 1.2 + i * 0.33) % 1; m.scale.setScalar(1.6 + ph * 3.8 * (L.pulses > 0.02 ? 1 : 0)); (m.material as MeshBasicMaterial).opacity = 0.5 * L.pulses * (1 - ph); });
    stars.rotation.y = T * 0.012; shells.visible = L.shells > 0.01; shells.scale.setScalar(0.7 + 0.3 * L.shells);
    shellGroups.forEach((rg, i) => { const sp = shellSpec[i]!; rg.rotation.y = (T * sp.sp + state.t * 0.18) * sp.dir; rg.rotation.x = sp.tilt; rg.position.y = sp.y * L.shells; });
    shellObjs.forEach((pt) => { (pt.material as ShaderMaterial).uniforms.opacity!.value = 0.85 * L.shells; }); shellRings.forEach((m) => { (m.material as MeshBasicMaterial).opacity = 0.35 * L.shells; });
    // flow particles: Universe -> Universe pulses, citizen -> Universe orbits, and trailing cluster energy. T = 0 (motion off) freezes them in place.
    const fl = L.flow; const pOp = (pulseF.pts.material as ShaderMaterial).uniforms.opacity!; pOp.value = 0.9 * fl * clamp01(L.links * 2);
    pulseP.forEach((p, i) => { const u = (((p.u + T * p.sp * p.dir) % 1) + 1) % 1; const e = Math.sin(u * Math.PI); pulseF.pos.set([p.a.x + (p.b.x - p.a.x) * u, p.a.y + (p.b.y - p.a.y) * u + e * p.lift, p.a.z + (p.b.z - p.a.z) * u], i * 3); pulseF.sz[i] = 0.14 + 0.2 * e; });
    (pulseF.pts.geometry.attributes.position as Float32BufferAttribute).needsUpdate = true; (pulseF.pts.geometry.attributes.size as Float32BufferAttribute).needsUpdate = true; (pulseF.pts.geometry.attributes.tint as Float32BufferAttribute).needsUpdate = true;
    (orbitF.pts.material as ShaderMaterial).uniforms.opacity!.value = 0.95 * fl * L.nodes;
    orbitP.forEach((p, i) => { const a = p.ph + T * p.sp; const c = Math.cos(a) * p.r, s2 = Math.sin(a) * p.r; orbitF.pos.set([p.c.x + p.u.x * c + p.v.x * s2, p.c.y + p.u.y * c + p.v.y * s2, p.c.z + p.u.z * c + p.v.z * s2], i * 3); });
    (orbitF.pts.geometry.attributes.position as Float32BufferAttribute).needsUpdate = true;
    (clusterF.pts.material as ShaderMaterial).uniforms.opacity!.value = 1;
    loops.forEach((l, li) => { const hl = mk.hl[l.g]; for (let k = 0; k < trail; k++) { const idx = li * trail + k; const f = ((((T * l.sp - k * 0.045) % 1) + 1) % 1) * l.len; const a = Math.floor(f) % l.len, b = (a + 1) % l.len, u = f - Math.floor(f); const A = l.pts[a]!, B = l.pts[b]!; clusterF.pos.set([A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u, A.z + (B.z - A.z) * u], idx * 3); clusterF.sz[idx] = hl * fl * (0.34 - k * (0.28 / trail)); } });
    (clusterF.pts.geometry.attributes.position as Float32BufferAttribute).needsUpdate = true; (clusterF.pts.geometry.attributes.size as Float32BufferAttribute).needsUpdate = true;
    // labels follow their nodes (DOM anchors stay real, focusable links)
    const lw = L.labels; const w = o.stage.clientWidth, h = o.stage.clientHeight; world.updateMatrixWorld(); cam.updateMatrixWorld();
    for (const n of o.nodes) {
      const el = o.labels[n.id]; if (!el) continue; const m = nodeMesh.get(n.id)!; m.getWorldPosition(tmp); tmp.project(cam);
      const vis = lw > 0.35 && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05; const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`; el.style.opacity = vis ? String(clamp01((lw - 0.35) / 0.4) * (hover && hover !== n.id ? 0.55 : 1)) : '0'; el.style.pointerEvents = vis && lw > 0.7 ? 'auto' : 'none';
    }
    renderer.render(scene, cam); frames++;
    if (!ready) { ready = true; o.onReady(); }
  };
  try { dirty = true; raf = requestAnimationFrame(frame); } catch (e) { o.onError(e); }

  return {
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(raf); running = false;
      triggers.forEach((t) => t.kill()); tweens.forEach((t) => t.kill()); gsap.killTweensOf(state);
      window.removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', onVis); canvas.removeEventListener('webglcontextlost', onLost); ro.disconnect(); vis.disconnect();
      for (const d of disposables) { try { d.dispose(); } catch { /* already disposed */ } }
      scene.traverse((obj) => { const m = obj as Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as { dispose?: () => void } | undefined; if (mat?.dispose) mat.dispose(); });
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); ScrollTrigger.refresh();
    },
    setHover(id) { hover = id; dirty = true; },
    setPaused(p) { paused = p; if (!p) dirty = true; },
    stats() { const i = renderer.info; return { frames, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0, chapter: Number(state.t.toFixed(3)), paused, running, quality: o.quality }; },
  };
}
let live: SceneHandle | null = null;
const mountTracked = (o: SceneOptions): SceneHandle => { live?.dispose(); const h = mount(o); const d = h.dispose.bind(h); h.dispose = () => { if (live === h) live = null; d(); }; live = h; return h; };
const api: ImmersiveApi = { mount: mountTracked, version: 'three@0.186.1 gsap@3.15.0', liveStats: () => live?.stats() ?? null };
window.FreeverseImmersive = api;
export default api;
void KEYS;
