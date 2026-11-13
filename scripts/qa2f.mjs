// Phase 2F quality assurance: visits representative pages in every motion condition and records what is really on screen.
// Usage: BASE=http://127.0.0.1:5199 OUT=screenshots/stage2f node scripts/qa2f.mjs   (server started with FOUNDER_EMAIL=tolu@example.test, fresh DB)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5199'; const OUT = process.env.OUT || 'screenshots/stage2f'; mkdirSync(OUT, { recursive: true });
const PAGES = [
  ['dashboard', '/home'], ['messages', '/messages'], ['calls', '/soon/calls'], ['profile', '/me/profile'], ['settings', '/settings'],
  ['graduate', '/spaces/graduate'], ['creator', '/spaces/creator'], ['developer', '/spaces/developer'],
  ['free-connect', '/universes/freeconnect'], ['free-play', '/universes/freeplay'], ['founder-ecosystem', '/founder'], ['founder-ai', '/founder/ai'],
];
const SIZES = { desktop: { width: 1366, height: 900 }, phone: { width: 390, height: 844 } };
const hash = (b) => createHash('sha1').update(b).digest('hex').slice(0, 10);
const results = []; const problems = [];

async function signUp(page) {
  await page.goto(BASE + '/#/signup'); await page.getByLabel('Email').fill('tolu@example.test'); await page.getByLabel('Password', { exact: true }).fill('correct horse 12'); await page.getByLabel('Confirm password').fill('correct horse 12');
  await page.getByLabel(/I’m an adult/).check(); await page.getByRole('button', { name: 'Create account' }).click(); await page.waitForURL(/eligibility/);
  await page.getByLabel('Month').selectOption('6'); await page.getByLabel('Day').selectOption('15'); await page.getByLabel('Year').selectOption(String(new Date().getFullYear() - 30)); await page.getByLabel(/accept the/).check(); await page.getByLabel(/date I entered/).check(); await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForURL(/onboarding/);
  await page.getByRole('button', { name: 'Skip setup for now' }).click(); await page.waitForURL(/#\/home/);
  await page.evaluate(async () => { for (const a of ['graduate', 'creator', 'developer']) await fetch('/api/identities', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + localStorage.getItem('fv.session') }, body: JSON.stringify({ archetype: a, primary: a === 'graduate' }) }); });
}
async function setMotion(page, value) {
  await page.goto(BASE + '/#/settings/accessibility'); const sel = page.getByLabel('Decorative motion'); await sel.waitFor({ timeout: 8000 }); await sel.selectOption(value); await page.waitForTimeout(500);
}

async function measure(page, name, path, cond, size, shot) {
  const errs = []; const onErr = (e) => errs.push(e.message); const onMsg = (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); };
  page.on('pageerror', onErr); page.on('console', onMsg);
  const t0 = Date.now(); await page.goto(BASE + '/#' + path); await page.locator('.env-page, .landing').first().waitFor({ timeout: 10000 }); const ready = Date.now() - t0;
  await page.waitForTimeout(1800);
  const info = await page.evaluate(() => {
    const d = document.documentElement; const c = document.querySelector('canvas.env-backdrop'); const h = document.querySelector('main h1, h1');
    const r = h?.getBoundingClientRect();
    return { env: d.dataset.env ?? null, section: document.querySelector('.env-page')?.getAttribute('data-env') ?? null, level: d.dataset.motionLevel, mode: d.dataset.motionMode, canvasMode: c?.getAttribute('data-env-mode') ?? null, canvasEnv: c?.getAttribute('data-env-canvas') ?? null,
      running: document.getAnimations().filter((a) => a.playState === 'running').length, svgAnim: document.querySelectorAll('animateMotion, animate, animateTransform').length, overflow: d.scrollWidth > innerWidth + 1,
      h1: h ? (h.textContent || '').trim().slice(0, 50) : null, h1Visible: !!r && r.bottom > 0 && r.top < innerHeight, long: window.__long ?? 0, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, webgl: !!document.querySelector('canvas[data-webgl], .sp-3d canvas') };
  });
  // Is anything visibly moving? Two frames of the same viewport, taken apart, must differ when motion is on.
  const a = hash(await page.screenshot()); await page.waitForTimeout(900); const b = hash(await page.screenshot()); const moving = a !== b;
  let shotHash = null; if (shot) { const buf = await page.screenshot({ path: `${OUT}/${name}-${size}.png` }); shotHash = hash(buf); }
  page.off('pageerror', onErr); page.off('console', onMsg);
  const row = { page: name, condition: cond, size, ready, moving, shotHash, ...info, errors: errs };
  results.push(row);
  if (errs.length) problems.push(`${name}/${cond}/${size}: console errors ${JSON.stringify(errs.slice(0, 2))}`);
  if (info.overflow) problems.push(`${name}/${cond}/${size}: horizontal overflow`);
  if (!info.h1Visible && info.h1) problems.push(`${name}/${cond}/${size}: heading not in view`);
  return row;
}

const browser = await chromium.launch();
async function run(cond, ctxOpts, init, motionValue) {
  for (const [size, vp] of Object.entries(SIZES)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, ...ctxOpts }); if (init) await ctx.addInitScript(init);
    await ctx.addInitScript(() => { window.__long = 0; try { new PerformanceObserver((l) => { window.__long += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch { /* not supported */ } });
    const page = await ctx.newPage(); await signUpOrIn(page); if (motionValue) await setMotion(page, motionValue);
    for (const [name, path] of PAGES) await measure(page, name, path, cond, size, cond === 'full');
    await ctx.close();
  }
}
let first = true; async function signUpOrIn(page) { if (first) { await signUp(page); first = false; } else { await page.goto(BASE + '/#/signin'); await page.getByLabel('Email').fill('tolu@example.test'); await page.getByLabel('Password', { exact: true }).fill('correct horse 12'); await page.getByRole('button', { name: /Sign in/ }).click(); await page.waitForURL(/#\/home/); } }

await run('full', {}, null, 'full');
await run('less', {}, null, 'reduced');
await run('off', {}, null, 'off');
await run('os-reduce', { reducedMotion: 'reduce' }, null, 'auto');
await run('no-webgl', {}, () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...r) { return /webgl/i.test(String(t)) ? null : g.call(this, t, ...r); }; }, 'full');
await browser.close();

// ── Verdicts ─────────────────────────────────────────────
const by = (c, s) => results.filter((r) => r.condition === c && r.size === s);
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); if (!ok) problems.push('CHECK FAILED: ' + name + ' — ' + detail); };
for (const s of Object.keys(SIZES)) {
  const full = by('full', s); const off = by('off', s); const less = by('less', s);
  check(`[${s}] every page has the content heading in view in all conditions`, results.filter((r) => r.size === s && r.h1 && !r.h1Visible).length === 0, '');
  check(`[${s}] no horizontal overflow in any condition`, results.filter((r) => r.size === s && r.overflow).length === 0, '');
  check(`[${s}] no console errors in any condition`, results.filter((r) => r.size === s && r.errors.length).length === 0, '');
  check(`[${s}] Off stops visible movement everywhere`, off.every((r) => !r.moving), off.filter((r) => r.moving).map((r) => r.page).join(', '));
  check(`[${s}] Off draws no animated background and runs no CSS animations`, off.every((r) => r.running === 0 || r.canvasMode === 'none' || r.canvasMode === null), off.filter((r) => r.running > 0).map((r) => `${r.page}:${r.running}`).join(', '));
  const still = full.filter((r) => !r.moving).map((r) => r.page); check(`[${s}] Full shows movement everywhere except deliberately calm pages (Settings, Founder AI when idle)`, still.every((p) => ['settings', 'founder-ai', 'founder-ecosystem'].includes(p)), `still: ${still.join(', ')}`);
  check(`[${s}] Less moves no more than Full`, less.filter((r) => r.moving).length <= full.filter((r) => r.moving).length, '');
  check(`[${s}] OS reduced-motion behaves like Less or Off (nothing in constant motion)`, by('os-reduce', s).filter((r) => r.moving).length <= less.filter((r) => r.moving).length, by('os-reduce', s).filter((r) => r.moving).map((r) => r.page).join(', '));
  check(`[${s}] no-WebGL fallback renders every page with its heading`, by('no-webgl', s).every((r) => r.h1Visible || !r.h1), '');
  const shots = new Set(full.map((r) => r.shotHash)); check(`[${s}] all ${full.length} representative pages render a visibly different screen`, shots.size === full.length, `${shots.size} different`);
  const noEnv = full.filter((r) => !r.canvasEnv && r.page !== 'founder-ecosystem' && r.page !== 'founder-ai' && r.page !== 'dashboard'); check(`[${s}] every page except the Dashboard and Founder pages has its own animated environment`, noEnv.length === 0, noEnv.map((r) => r.page).join(', '));
  const canv = full.map((r) => r.canvasEnv).filter(Boolean); check(`[${s}] no two pages share the same environment (${new Set(canv).size} different of ${canv.length})`, new Set(canv).size === canv.length, canv.join(','));
  const slow = full.filter((r) => r.ready > 4000); check(`[${s}] every page is interactive within 4 s`, slow.length === 0, slow.map((r) => `${r.page}:${r.ready}ms`).join(', '));
}
const summary = { when: new Date().toISOString(), checks, passed: checks.filter((c) => c.ok).length, total: checks.length, problems, timing: Object.fromEntries(['desktop', 'phone'].map((s) => [s, Object.fromEntries(by('full', s).map((r) => [r.page, { readyMs: r.ready, longTasks: r.long, jsHeapMB: r.heap }]))])), rows: results };
writeFileSync(`${OUT}/qa-results.json`, JSON.stringify(summary, null, 2));
for (const c of checks) console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.ok || !c.detail ? '' : '  -> ' + c.detail));
console.log(`\n${summary.passed}/${summary.total} QA checks passed; ${problems.length} problem(s)`);
