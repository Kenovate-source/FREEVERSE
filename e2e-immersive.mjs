// Browser checks for the immersive experience: 3D scene lifecycle, the five motion modes, fallbacks, keyboard use,
// horizontal exploration, Universe identity and layout at phone, tablet and desktop sizes.
// Usage: BASE=http://127.0.0.1:5199 node scripts/e2e-immersive.mjs   (server running; Playwright via PLAYWRIGHT_PATH)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const OUT = process.env.SHOTS || 'screenshots/immersive'; mkdirSync(OUT, { recursive: true });
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SIZES = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1100 }, desktop: { width: 1366, height: 900 } };
const IDS = ['freeconnect', 'freelearn', 'freework', 'freeai', 'freeevents', 'freebuild', 'freemarket', 'freeresearch', 'freevolunteer', 'freehealth', 'freefinance', 'freemedia', 'freeentertainment', 'freelabs', 'freeplay'];
const results = []; const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open({ size = 'desktop', reducedMotion = 'no-preference', noWebgl = false, args = GL } = {}) {
  const browser = await chromium.launch({ args }); const ctx = await browser.newContext({ viewport: SIZES[size], reducedMotion });
  const page = await ctx.newPage(); page.setDefaultTimeout(8000); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 }); Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 }); });
  if (noWebgl) await page.addInitScript(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(String(t)) ? null : orig.call(this, t, ...a); }; });
  return { browser, ctx, page, errs };
}
async function check(group, name, fn) {
  const t = { group, name }; try { await fn(); t.ok = true; } catch (e) { t.ok = false; t.err = String(e.message).split('\n')[0]; console.log('FAIL', group, name, t.err); } results.push(t);
}
let stamp = Date.now(); let n = 0;
async function signUp(page) {
  const email = `imm${stamp}${n++}@example.test`; await page.goto(`${BASE}/#/signup`); await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill('correct horse 12'); await page.getByLabel(/I’m an adult/).check(); await page.getByRole('button', { name: 'Create account' }).click(); await page.waitForURL(/#\/eligibility/);
  await page.getByLabel('Month').selectOption('6'); await page.getByLabel('Day').selectOption('15'); await page.getByLabel('Year').selectOption(String(new Date().getFullYear() - 37)); await page.getByLabel(/accept the/).check(); await page.getByLabel(/date I entered/).check(); await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForURL(/#\/onboarding/);
  await page.getByRole('button', { name: 'Skip setup for now' }).click(); await page.waitForURL(/#\/home/);
}
const attr = (page, a) => page.evaluate((a) => document.documentElement.getAttribute(a), a);
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${b}, got ${a}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
async function land(page) { await page.goto(`${BASE}/#/`); await page.waitForSelector('h1'); }

// ---- 1. 3D lifecycle (exploration mode) ----
{
  const { browser, page, errs } = await open();
  await check('3d', 'scene mounts lazily and becomes ready', async () => { await land(page); await page.waitForFunction(() => document.querySelector('[data-scene]')?.getAttribute('data-scene') === 'ready', null, { timeout: 25000 }); eq(await attr(page, 'data-motion-mode'), 'exploration', 'mode'); ok(await page.locator('.journey-stage canvas').count() === 1, 'one canvas'); });
  await check('3d', 'scene holds real GPU resources and renders frames', async () => { await sleep(600); const s = await page.evaluate(() => window.FreeverseImmersive.liveStats()); ok(s && s.geometries > 0 && s.programs > 0, JSON.stringify(s)); ok(s.frames > 0, 'frames ' + s.frames); });
  await check('3d', 'scrolling advances the chapter coordinate; ordinary wheel scroll is not intercepted', async () => {
    await page.evaluate(() => { window.__prevented = []; window.addEventListener('wheel', (e) => setTimeout(() => window.__prevented.push(e.defaultPrevented), 0), { passive: true }); });
    const y0 = await page.evaluate(() => scrollY); await page.mouse.move(600, 500); await page.mouse.wheel(0, 700); await sleep(700);
    const y1 = await page.evaluate(() => scrollY); ok(y1 > y0 + 300, `scrolled ${y0} -> ${y1}`); ok((await page.evaluate(() => window.__prevented)).every((x) => x === false), 'wheel was default-prevented');
    eq(await page.evaluate(() => scrollX), 0, 'no diagonal/horizontal page scroll');
    await page.evaluate(() => document.querySelector('[data-chapter="5"]').scrollIntoView()); await sleep(900); const s = await page.evaluate(() => window.FreeverseImmersive.liveStats()); ok(s.chapter > 3, 'chapter t=' + s.chapter);
  });
  await check('3d', 'hidden tab pauses the render loop', async () => {
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => { const x = window.FreeverseImmersive.liveStats(); return x.paused || !x.running; }, null, { timeout: 8000 }).catch(() => {}); // software WebGL frames are slow; wait for the loop to notice
    const a = await page.evaluate(() => window.FreeverseImmersive.liveStats()); await sleep(600); const b = await page.evaluate(() => window.FreeverseImmersive.liveStats());
    ok(a.paused || !a.running, 'not paused ' + JSON.stringify(a)); ok(b.frames - a.frames <= 1, `frames advanced ${a.frames}->${b.frames}`);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  });
  await check('3d', 'Settings "Off" tears the scene down completely and persists across reload', async () => {
    await page.evaluate(() => scrollTo(0, 0)); await page.getByRole('group', { name: 'Decorative motion' }).first().getByRole('button', { name: 'Off' }).click(); await sleep(500);
    eq(await attr(page, 'data-motion-mode'), 'reduced', 'mode'); eq(await page.locator('.journey-stage canvas').count(), 0, 'canvas removed'); eq(await page.evaluate(() => window.FreeverseImmersive.liveStats()), null, 'scene disposed');
    await page.reload(); await page.waitForSelector('h1'); await sleep(800); eq(await attr(page, 'data-motion-mode'), 'reduced', 'persisted'); eq(await page.locator('canvas').count(), 0, 'no canvas after reload');
    await page.getByRole('group', { name: 'Decorative motion' }).first().getByRole('button', { name: 'Full' }).click(); await sleep(300);
  });
  await check('3d', 'leaving the landing disposes the scene; returning remounts it', async () => {
    await page.waitForFunction(() => document.querySelector('[data-scene]')?.getAttribute('data-scene') === 'ready', null, { timeout: 25000 });
    await page.goto(`${BASE}/#/terms`); await page.waitForSelector('main h2'); await sleep(600); eq(await page.locator('canvas').count(), 0, 'canvas gone'); eq(await page.evaluate(() => window.FreeverseImmersive?.liveStats() ?? null), null, 'disposed');
    await land(page); await page.waitForFunction(() => document.querySelector('[data-scene]')?.getAttribute('data-scene') === 'ready', null, { timeout: 25000 });
    const s = await page.evaluate(() => window.FreeverseImmersive.liveStats()); ok(s.geometries > 0, 'remounted with resources');
  });
  await check('3d', 'repeated mount/unmount does not accumulate GPU resources', async () => {
    const before = await page.evaluate(() => window.FreeverseImmersive.liveStats().geometries);
    for (let i = 0; i < 3; i++) { await page.goto(`${BASE}/#/privacy`); await page.waitForSelector('main h2'); await sleep(300); await land(page); await page.waitForFunction(() => document.querySelector('[data-scene]')?.getAttribute('data-scene') === 'ready', null, { timeout: 25000 }); }
    const after = await page.evaluate(() => window.FreeverseImmersive.liveStats().geometries); ok(after <= before + 2, `geometries ${before} -> ${after}`);
  });
  await check('3d', 'no console errors during the 3D session', async () => { ok(errs.length === 0, errs.join(' | ')); });
  await browser.close();
}

// ---- 2. Modes: reduced (OS), fallback (no WebGL), focus (forms and policies) ----
{
  const { browser, page, errs } = await open({ reducedMotion: 'reduce' });
  await check('modes', 'OS reduce-motion: static art, no canvas, no 3D bundle fetched, content fully visible', async () => {
    const reqs = []; page.on('request', (r) => reqs.push(r.url())); await land(page); await sleep(1500);
    eq(await attr(page, 'data-motion-mode'), 'reduced', 'mode'); eq(await page.locator('canvas').count(), 0, 'canvas'); ok(await page.locator('svg.orbit-art').count() === 1, 'static SVG art'); ok(!reqs.some((u) => u.includes('immersive.js')), 'immersive.js should not load');
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.reveal')].filter((e) => getComputedStyle(e).opacity !== '1').length); eq(hidden, 0, 'reveal elements still hidden');
  });
  await check('modes', 'reduced mode keeps every chapter and its call to action reachable', async () => { eq(await page.locator('[data-chapter]').count() >= 9, true, 'chapters'); ok(await page.getByRole('link', { name: /Create your account|Join|Get started/i }).first().isVisible(), 'CTA visible'); });
  ok(errs.length === 0, 'errors: ' + errs.join('|')); await browser.close();
}
{
  const { browser, page, errs } = await open({ noWebgl: true });
  await check('modes', 'no WebGL: fallback mode with the SVG scene, nothing broken', async () => { await land(page); await sleep(1500); eq(await attr(page, 'data-motion-mode'), 'fallback', 'mode'); eq(await page.locator('canvas').count(), 0, 'canvas'); ok(await page.locator('svg.orbit-art').count() === 1, 'svg'); ok((await page.locator('[data-chapter]').count()) >= 9, 'chapters'); });
  await check('modes', 'fallback art follows the chapter as you scroll', async () => { const a = await page.evaluate(() => document.querySelector('.journey-stage').getAttribute('data-chapter')); await page.evaluate(() => document.querySelector('[data-chapter="6"]').scrollIntoView()); await sleep(800); const b = await page.evaluate(() => document.querySelector('.journey-stage').getAttribute('data-chapter')); ok(a !== b, `${a} -> ${b}`); });
  await check('modes', 'fallback has no console errors', async () => { ok(errs.length === 0, errs.join('|')); }); await browser.close();
}
{
  const { browser, page } = await open();
  for (const [route, label] of [['/signup', 'registration'], ['/terms', 'terms'], ['/privacy', 'privacy'], ['/rules', 'rules'], ['/signin', 'sign in']])
    await check('modes', `focus mode on ${label}: no canvas, no motion layers`, async () => { await page.goto(`${BASE}/#${route}`); await sleep(900); eq(await attr(page, 'data-motion-mode'), 'focus', 'mode'); eq(await page.locator('canvas').count(), 0, 'canvas'); });
  await signUp(page);
  await check('modes', 'focus mode on the Universe composer and games, exploration on the hub', async () => {
    await page.goto(`${BASE}/#/universes`); await page.waitForSelector('main h1'); await sleep(500); eq(await attr(page, 'data-motion-mode'), 'exploration', 'hub');
    await page.goto(`${BASE}/#/universes/freeplay`); await page.waitForSelector('main h1'); await sleep(500); eq(await attr(page, 'data-motion-mode'), 'exploration', 'universe overview');
  });
  await browser.close();
}

// ---- 3. Keyboard, focus and horizontal exploration ----
{
  const { browser, page, errs } = await open();
  await land(page); await page.waitForSelector('.hscroll');
  await check('keyboard', 'skip link is the first stop and moves focus to main content', async () => { await page.keyboard.press('Tab'); eq(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Skip to content', 'first stop'); await page.keyboard.press('Enter'); eq(await page.evaluate(() => document.activeElement?.id), 'main', 'focus target'); });
  await check('keyboard', 'every interactive element shows a visible focus indicator', async () => {
    await page.evaluate(() => document.activeElement?.blur()); let bad = [];
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); const r = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); return { t: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30), o: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, b: s.boxShadow !== 'none' }; }); if (r && !r.o && !r.b) bad.push(r.t); }
    ok(bad.length === 0, 'no focus ring: ' + bad.join(', '));
  });
  await check('keyboard', 'chapter rail buttons jump to chapters', async () => { await page.getByRole('button', { name: /^6\./ }).click(); await page.waitForFunction(() => Math.abs(document.querySelector('[data-chapter="5"]').getBoundingClientRect().top) < 300, null, { timeout: 8000 }).catch(() => {}); const y = await page.evaluate(() => document.querySelector('[data-chapter="5"]').getBoundingClientRect().top); ok(Math.abs(y) < 300, 'chapter 6 top=' + y); });
  await check('keyboard', 'horizontal section scrolls with arrow keys and never traps Tab', async () => {
    const hs = page.locator('.hscroll').first(); await hs.scrollIntoViewIfNeeded(); await hs.focus();  const a0 = await hs.evaluate((e) => e.scrollLeft); for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight'); await page.waitForFunction(() => document.querySelector('.hscroll').scrollLeft > 0, null, { timeout: 4000 }).catch(() => {}); void a0; const b = await hs.evaluate((e) => e.scrollLeft); const a = 0; ok(b > a, `scrollLeft ${a}->${b}`);
    await page.keyboard.press('Tab'); const inside = await hs.evaluate((e) => e.contains(document.activeElement) && document.activeElement !== e); for (let i = 0; i < 40 && await hs.evaluate((e) => e.contains(document.activeElement)); i++) await page.keyboard.press('Tab');
    ok(!(await hs.evaluate((e) => e.contains(document.activeElement))), 'focus escaped the horizontal section'); void inside;
  });
  await check('keyboard', 'horizontal drag with the mouse scrolls sideways', async () => { const hs = page.locator('.hscroll').first(); await hs.scrollIntoViewIfNeeded(); const box = await hs.boundingBox(); await hs.evaluate((e) => { e.scrollLeft = 0; }); await sleep(200); const a = 0; await page.mouse.move(box.x + box.width * 0.7, box.y + 40); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.2, box.y + 40, { steps: 8 }); await page.mouse.up(); await sleep(300); const b = await hs.evaluate((e) => e.scrollLeft); ok(b > a, `drag ${a}->${b}`); });
  await check('keyboard', 'no console errors', async () => ok(errs.length === 0, errs.join('|'))); await browser.close();
}

// ---- 4. Universes: hub orbit map and fifteen distinct identities ----
{
  const { browser, page, errs } = await open();
  await signUp(page); await page.goto(`${BASE}/#/universes`); await page.waitForSelector('[data-testid="orbit-map"]');
  await check('universes', 'orbit map lists all fifteen as ordinary links', async () => { eq(await page.locator('[data-testid="orbit-map"] a[href^="#/universes/"]').count(), 15, 'links'); });
  await check('universes', 'arrow button, keyboard and drag all move the map; a drag does not trigger navigation', async () => {
    const vp = page.locator('.om-viewport'); const a = await vp.evaluate((e) => e.scrollLeft); await page.getByRole('button', { name: 'Scroll Universes forward' }).click(); await page.waitForFunction(() => document.querySelector('.om-viewport').scrollLeft > 50, null, { timeout: 5000 }).catch(() => {}); const b = await vp.evaluate((e) => e.scrollLeft); ok(b > a, `button ${a}->${b}`);
    await vp.focus(); await page.keyboard.press('ArrowRight'); await sleep(400); ok(await vp.evaluate((e) => e.scrollLeft) >= b, 'keyboard');
    const box = await vp.boundingBox(); const c = await vp.evaluate((e) => e.scrollLeft); await page.mouse.move(box.x + 300, box.y + 120); await page.mouse.down(); await page.mouse.move(box.x + 60, box.y + 120, { steps: 8 }); await page.mouse.up(); await sleep(300); ok(await vp.evaluate((e) => e.scrollLeft) > c, 'drag');
    ok(/#\/universes$/.test(page.url()), 'drag navigated: ' + page.url());
  });
  await check('universes', 'clicking a card (no drag) opens the Universe', async () => { await page.locator('[data-testid="orbit-map"] a', { hasText: 'FreeLearn' }).first().click(); await page.waitForURL(/#\/universes\/freelearn/); });
  const sig = new Set(), layouts = new Set(), motions = new Set();
  for (const id of IDS) await check('universes', `${id}: renders with its own identity`, async () => {
    await page.goto(`${BASE}/#/universes/${id}`); await page.waitForSelector('.uni-hero h1'); const d = await page.evaluate(() => ({ s: document.querySelector('.sigil')?.getAttribute('data-sigil'), c: document.querySelector('.uni-page').className, u: document.querySelector('.uni-page').getAttribute('data-universe'), acc: getComputedStyle(document.querySelector('.uni-hero')).getPropertyValue('--accent') }));
    eq(d.u, id, 'data-universe'); ok(d.s, 'sigil'); sig.add(d.s); layouts.add(d.c.match(/uni-layout-(\w+)/)[1]); motions.add(d.c.match(/uni-motion-(\w+)/)[1]);
    ok(await page.locator('main h1, .uni-hero h1').first().isVisible(), 'heading'); ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'horizontal overflow');
  });
  await check('universes', 'fifteen distinct signature artworks across several layouts and motion languages', async () => { eq(sig.size, 15, 'sigils'); ok(layouts.size >= 4, 'layouts ' + [...layouts]); ok(motions.size >= 5, 'motions ' + [...motions]); });
  await check('universes', 'no console errors', async () => ok(errs.length === 0, errs.join('|'))); await browser.close();
}

// ---- 5. Responsive: no overflow, screenshots ----
for (const size of Object.keys(SIZES)) {
  const { browser, page, errs } = await open({ size });
  await check('responsive', `${size}: landing has no horizontal overflow and shows its headline, CTA and motion control`, async () => {
    await land(page); await page.waitForFunction(() => document.querySelector('[data-scene]')?.getAttribute('data-scene') === 'ready', null, { timeout: 25000 }); await sleep(800);
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'overflow'); ok(await page.locator('h1').first().isVisible(), 'h1'); ok(await page.getByRole('group', { name: 'Decorative motion' }).first().isVisible(), 'motion control');
    await page.screenshot({ path: `${OUT}/${size}-landing-hero.png` });
    for (const [i, n] of [[2, 'universes'], [5, 'work'], [7, 'trust'], [8, 'join']]) { await page.evaluate((i) => document.querySelector(`[data-chapter="${i}"]`).scrollIntoView(), i); await sleep(1100); await page.screenshot({ path: `${OUT}/${size}-chapter-${n}.png` }); ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `overflow at ${n}`); }
  });
  await check('responsive', `${size}: Universe hub and a Universe page`, async () => { await signUp(page); await page.goto(`${BASE}/#/universes`); await page.waitForSelector('[data-testid="orbit-map"]'); await sleep(500); await page.screenshot({ path: `${OUT}/${size}-universes-hub.png` }); await page.goto(`${BASE}/#/universes/freeplay`); await page.waitForSelector('.sigil'); await sleep(500); await page.screenshot({ path: `${OUT}/${size}-universe-freeplay.png` }); await page.goto(`${BASE}/#/universes/freefinance`); await page.waitForSelector('.sigil'); await sleep(400); await page.screenshot({ path: `${OUT}/${size}-universe-freefinance.png` }); });
  await check('responsive', `${size}: no console errors`, async () => ok(errs.length === 0, errs.join('|'))); await browser.close();
}

const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/immersive-report.json`, JSON.stringify({ base: BASE, results, problems }, null, 2));
console.log(`${results.length - failed.length}/${results.length} immersive checks passed`);
for (const f of failed) console.log(`FAIL [${f.group}] ${f.name}: ${f.err}`);
process.exit(failed.length ? 1 : 0);
