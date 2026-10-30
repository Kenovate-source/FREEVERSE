// Motion system, Universe identity and journey data. Pure logic: no browser needed (the browser behaviour is in scripts/e2e.mjs).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decideMotion, isFocusRoute, detectLowPower, type MotionInputs } from '../src/motion/mode';
import { KEYS, mixKey, placeNodes, span, clamp01 } from '../src/immersive/keyframes';
import { CHAPTERS, sceneNodes, flatNodes, UNIVERSE_GROUP } from '../src/lib/journey';
import { UNIVERSES, UNIVERSE_IDS } from '../shared/universes';
import { UNIVERSE_THEMES, themeFor } from '../shared/universe-theme';
import { matchRoute } from '../src/lib/routes';

const base: MotionInputs = { osReduce: false, pref: 'full', reduceAll: false, webgl: true, lowPower: false, focus: false };

describe('decideMotion', () => {
  test('full experience by default', () => { const d = decideMotion(base); assert.equal(d.mode, 'exploration'); assert.ok(d.scene3d && d.scrollLinked && d.pointer); assert.equal(d.quality, 'high'); });
  test('Full, Less and Off are three genuinely different configurations', () => {
    const f = decideMotion({ ...base, pref: 'full' }), l = decideMotion({ ...base, pref: 'reduced' }), o = decideMotion({ ...base, pref: 'off' });
    assert.deepEqual([f.level, l.level, o.level], ['full', 'less', 'off']); assert.deepEqual([f.mode, l.mode, o.mode], ['exploration', 'calm', 'off']);
    // Full: everything. Less: calm 3D only. Off: nothing.
    assert.ok(f.scene3d && f.scrollLinked && f.pointer && f.drift === 1 && f.decor === 'full');
    assert.ok(l.scene3d && !l.scrollLinked && !l.pointer && l.drift > 0 && l.drift < f.drift && l.decor === 'slow' && l.quality === 'low');
    assert.ok(!o.scene3d && !o.scrollLinked && !o.pointer && o.drift === 0 && o.decor === 'none');
    // no two levels share the same configuration
    const key = (d: typeof f) => JSON.stringify([d.scene3d, d.scrollLinked, d.pointer, d.drift, d.decor, d.quality]);
    assert.equal(new Set([key(f), key(l), key(o)]).size, 3);
  });
  test('device reduced-motion: the default is Off, Full is capped to Less, and Less stays still', () => {
    assert.equal(decideMotion({ ...base, pref: 'auto', osReduce: true }).level, 'off'); assert.equal(decideMotion({ ...base, pref: 'auto' }).level, 'full');
    const capped = decideMotion({ ...base, pref: 'full', osReduce: true }); assert.equal(capped.level, 'less'); assert.ok(!capped.scrollLinked && !capped.pointer);
    const less = decideMotion({ ...base, pref: 'reduced', osReduce: true }); assert.equal(less.mode, 'calm'); assert.equal(less.drift, 0); assert.equal(less.decor, 'still');
    assert.equal(decideMotion({ ...base, pref: 'off', osReduce: true }).level, 'off');
  });
  test('Less is also lighter than Full when WebGL is missing; Off is never overridden by anything', () => {
    assert.equal(decideMotion({ ...base, pref: 'reduced', webgl: false }).pointer, false);
    for (const x of [{ focus: true }, { webgl: false }, { lowPower: true }]) assert.equal(decideMotion({ ...base, pref: 'off', ...x }).mode, 'off');
  });
  test('reduce-all wins over everything', () => { assert.equal(decideMotion({ ...base, reduceAll: true, focus: true, webgl: false }).mode, 'off'); });
  test('focus beats fallback, low and exploration', () => { for (const x of [{}, { webgl: false }, { lowPower: true }]) assert.equal(decideMotion({ ...base, ...x, focus: true }).mode, 'focus'); assert.ok(!decideMotion({ ...base, focus: true }).scene3d); });
  test('no WebGL: fallback with the CSS scene', () => { const d = decideMotion({ ...base, webgl: false }); assert.equal(d.mode, 'fallback'); assert.ok(!d.scene3d); });
  test('constrained devices get the same story at lower quality, not nothing', () => { const d = decideMotion({ ...base, lowPower: true }); assert.equal(d.mode, 'low'); assert.ok(d.scene3d); assert.equal(d.quality, 'low'); assert.ok(!d.pointer); assert.equal(decideMotion({ ...base, smallScreen: true }).quality, 'medium'); });
  test('priority is off > focus > fallback > low > exploration', () => {
    const order = [decideMotion({ ...base, reduceAll: true, focus: true }), decideMotion({ ...base, focus: true, webgl: false }), decideMotion({ ...base, webgl: false, lowPower: true }), decideMotion({ ...base, lowPower: true })].map((d) => d.mode);
    assert.deepEqual(order, ['off', 'focus', 'fallback', 'low']);
  });
  test('every decision explains itself', () => { for (const x of [{}, { osReduce: true }, { focus: true }, { webgl: false }, { lowPower: true }, { pref: 'off' as const }, { pref: 'reduced' as const }]) assert.ok(decideMotion({ ...base, ...x }).reason.length > 5); });
});

describe('focus routes', () => {
  test('forms, policies, reading and writing are focus routes', () => { for (const r of ['signup', 'signin', 'onboarding', 'terms', 'privacy', 'rules', 'settings', 'post', 'learn-item', 'nova-chat', 'conversation', 'founder']) assert.ok(isFocusRoute(r), r); });
  test('the landing page and the Universe hub are for exploring', () => { for (const r of ['landing', 'home', 'universes', 'universe', null, undefined, '']) assert.ok(!isFocusRoute(r as string | null), String(r)); });
  test('tool and game spaces inside a Universe are focused; overviews are not', () => { assert.ok(isFocusRoute('universe-space', '/universes/freeplay/games')); assert.ok(isFocusRoute('universe-space', '/universes/freefinance/tools')); assert.ok(!isFocusRoute('universe-space', '/universes/freelearn/browse')); });
});

describe('detectLowPower', () => {
  test('data saver, little memory or few cores', () => { assert.ok(detectLowPower({ connection: { saveData: true } })); assert.ok(detectLowPower({ deviceMemory: 2 })); assert.ok(detectLowPower({ hardwareConcurrency: 2 })); });
  test('capable devices and unknown values are not low power', () => { assert.ok(!detectLowPower({ deviceMemory: 8, hardwareConcurrency: 8 })); assert.ok(!detectLowPower({})); assert.ok(!detectLowPower(undefined)); });
});

describe('scene keyframes', () => {
  test('one keyframe per chapter', () => assert.equal(KEYS.length, CHAPTERS.length));
  test('mixing is continuous and clamped at both ends', () => {
    assert.deepEqual(mixKey(-5).camZ, mixKey(0).camZ); assert.equal(mixKey(99).camZ, mixKey(KEYS.length - 1).camZ);
    let prev = mixKey(0).camZ; for (let t = 0; t <= KEYS.length - 1; t += 0.05) { const z = mixKey(t).camZ; assert.ok(Math.abs(z - prev) < 3, `jump at ${t}`); prev = z; }
  });
  test('span returns valid neighbours', () => { for (const t of [0, 0.5, 3, 7.9, 8, 20]) { const s = span(t); assert.ok(s.i >= 0 && s.j < KEYS.length && s.f >= 0 && s.f <= 1); } });
  test('node placement is deterministic and gives every Universe a position', () => {
    const a = placeNodes(sceneNodes()), b = placeNodes(sceneNodes()); assert.equal(a.size, 15); assert.deepEqual([...a], [...b]);
    for (const [, p] of a) for (const v of p) assert.ok(Number.isFinite(v));
  });
  test('clamp01', () => { assert.equal(clamp01(-1), 0); assert.equal(clamp01(2), 1); assert.equal(clamp01(0.4), 0.4); });
});

describe('journey data', () => {
  test('nine chapters with unique ids', () => { assert.equal(CHAPTERS.length, 9); assert.equal(new Set(CHAPTERS.map((c) => c.id)).size, 9); });
  test('all fifteen Universes appear in the scene, grouped, with accents', () => {
    const n = sceneNodes(); assert.equal(n.length, 15); assert.deepEqual(n.map((x) => x.id).sort(), [...UNIVERSE_IDS].sort());
    for (const x of n) { assert.ok(UNIVERSE_GROUP[x.id], x.id); assert.match(x.accent, /^#[0-9a-f]{6}$/i); }
  });
  test('the fallback map places all fifteen inside its viewBox', () => { const f = flatNodes(800); assert.equal(f.length, 15); for (const p of f) assert.ok(p.x > 0 && p.x < 800 && p.y > 0 && p.y < 800, p.id); });
});

describe('Universe identity', () => {
  test('every Universe has exactly one theme and every theme names a real Universe', () => {
    assert.equal(UNIVERSE_THEMES.length, 15); for (const u of UNIVERSES) assert.ok(themeFor(u.id), u.id);
    assert.deepEqual(UNIVERSE_THEMES.map((t) => t.id).sort(), [...UNIVERSE_IDS].sort());
  });
  test('the fifteen are visually distinct: unique signature artwork and accent', () => {
    assert.equal(new Set(UNIVERSE_THEMES.map((t) => t.sigil)).size, 15); assert.equal(new Set(UNIVERSES.map((u) => u.accent)).size, 15);
  });
  test('several layout families and motion languages are in use, not one template', () => {
    assert.ok(new Set(UNIVERSE_THEMES.map((t) => t.layout)).size >= 4); assert.ok(new Set(UNIVERSE_THEMES.map((t) => t.motion)).size >= 5);
  });
  test('learning and research are ordered and calm; creative spaces are expressive; the marketplace is browse-first', () => {
    for (const id of ['freelearn', 'freeresearch', 'freefinance', 'freehealth']) assert.equal(themeFor(id)!.layout, 'ordered', id);
    for (const id of ['freemedia', 'freeentertainment', 'freeplay']) assert.equal(themeFor(id)!.layout, 'expressive', id);
    assert.equal(themeFor('freemarket')!.layout, 'browse');
    for (const id of ['freelearn', 'freeresearch', 'freefinance', 'freehealth', 'freemarket']) assert.equal(themeFor(id)!.depth <= 1, true, `${id} stays calm`);
  });
  test('every Universe route resolves and has an honest status', () => {
    for (const u of UNIVERSES) { assert.ok(matchRoute(`/universes/${u.id}`), u.id); assert.ok(['available', 'partial'].includes(u.status), u.id); assert.ok(u.basis.length > 10); }
  });
  test('no Universe still describes anonymous posting as off by default', () => { for (const u of UNIVERSES) assert.ok(!/anonymous[^.]*off by default/i.test(JSON.stringify(u)), u.id); });
});
