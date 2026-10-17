import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const tok = (n: string) => {
  const m = css.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `token --${n} missing`);
  return m![1]!;
};
const lin = (c: number) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const pairs: [string, string, string][] = [
  ['text', 'bg', 'body text'], ['text', 'surface', 'text on cards'], ['text', 'surface-2', 'text on raised cards'],
  ['text-muted', 'bg', 'muted text'], ['text-muted', 'surface', 'muted on cards'],
  ['text-faint', 'bg', 'faint text'], ['text-faint', 'surface', 'faint on cards'],
  ['primary-ink', 'primary', 'primary button label'],
  ['mock-ink', 'mock-bg', 'mock banner text'],
  ['danger', 'danger-bg', 'error text'], ['success', 'success-bg', 'success text'],
  ['cyan', 'bg', 'links/accent on bg'],
];
for (const [fg, bg, label] of pairs) {
  test(`contrast >= 4.5:1 — ${label} (--${fg} on --${bg})`, () => {
    const r = ratio(tok(fg), tok(bg));
    assert.ok(r >= 4.5, `${r.toFixed(2)}:1`);
  });
}
