// Page environments: routing, motion-mode mapping, and the landing flow data. Pure logic; the canvas behaviour is in scripts/e2e.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decideMotion, type MotionInputs } from '../src/motion/mode';
import { envModeFor } from '../src/motion/env-mode';
import { envFor } from '../src/lib/env-map';
import { KEYS, mixKey } from '../src/immersive/keyframes';

const base: MotionInputs = { osReduce: false, pref: 'full', reduceAll: false, webgl: true, lowPower: false, focus: false };

describe('envFor', () => {
  test('mapped routes get an environment, unmapped ones stay plain', () => {
    assert.equal(envFor('messages'), 'messages'); assert.equal(envFor('conversation'), 'messages'); assert.equal(envFor('council-agent'), 'council'); assert.equal(envFor('goals'), 'nova');
    assert.equal(envFor('home'), null); assert.equal(envFor(null), null); assert.equal(envFor(undefined), null);
  });
  test('Calls is recognised by path', () => assert.equal(envFor('soon', '/soon/calls'), 'calls'));
});

describe('envModeFor', () => {
  test('Off mounts nothing', () => assert.equal(envModeFor(decideMotion({ ...base, pref: 'off' }), { zones: 0, focusBehaviour: 'calm' }), 'none'));
  test('Full is full, Less is calm, and they differ', () => {
    const full = envModeFor(decideMotion(base), { zones: 0, focusBehaviour: 'calm' }); const less = envModeFor(decideMotion({ ...base, pref: 'reduced' }), { zones: 0, focusBehaviour: 'calm' });
    assert.equal(full, 'full'); assert.notEqual(less, 'full'); assert.ok(less === 'calm' || less === 'still');
  });
  test('a focus zone (typing, a game) always stills the backdrop', () => assert.equal(envModeFor(decideMotion(base), { zones: 1, focusBehaviour: 'calm' }), 'still'));
  test('a focus page follows the environment’s own focus behaviour', () => {
    const d = decideMotion({ ...base, focus: true });
    assert.equal(envModeFor(d, { zones: 0, focusBehaviour: 'calm' }), 'calm'); assert.equal(envModeFor(d, { zones: 0, focusBehaviour: 'still' }), 'still');
  });
  test('an OS reduced-motion request never yields full', () => assert.notEqual(envModeFor(decideMotion({ ...base, osReduce: true, pref: 'auto' }), { zones: 0, focusBehaviour: 'calm' }), 'full'));
});

describe('landing flow layer', () => {
  test('every chapter declares a flow value in 0..1', () => { for (const k of KEYS) assert.ok(k.layers.flow >= 0 && k.layers.flow <= 1); });
  test('flow is on where Universes are the subject and off for identity and trust', () => {
    assert.equal(KEYS[1]!.layers.flow, 0); assert.equal(KEYS[7]!.layers.flow, 0);
    assert.equal(KEYS[2]!.layers.flow, 1); assert.equal(KEYS[5]!.layers.flow, 1); assert.ok(KEYS[8]!.layers.flow > 0);
  });
  test('flow blends smoothly between chapters', () => { const m = mixKey(1.5); assert.ok(m.layers.flow > 0 && m.layers.flow < 1); });
});
