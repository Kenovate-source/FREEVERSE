// Browser verification: drives the real server + built client with Playwright at phone, tablet and desktop sizes.
// Usage: BASE=http://127.0.0.1:5199 node scripts/e2e.mjs   (server must be running with the local dev sign-in)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const OUT = process.env.SHOTS || 'screenshots/stage2'; mkdirSync(OUT, { recursive: true });
const SIZES = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1100 }, desktop: { width: 1366, height: 900 } };
const FOUNDER_ROUTES = ['/founder', '/founder/ai', '/founder/decisions', '/founder/governance', '/founder/access', '/founder/communities', '/founder/universes', '/founder/council', '/founder/audit', '/founder/constitution', '/founder/priorities', '/governance', '/moderation'];
const ROUTES = ['/home', '/explore', '/search?q=study', '/communities', '/learn', '/opportunities', '/mentors', '/events', '/messages', '/notifications', '/saved', '/ai', '/ai/council', '/identities', '/me/profile', '/settings', '/settings/privacy', '/settings/accessibility', '/universes', '/soon/calls', '/help', '/governance', '/founder', '/founder/ai', '/founder/decisions', '/founder/governance', '/founder/audit', '/moderation'];
const results = []; const problems = [];
const stamp = Date.now();

async function run(size, who = 'member') {
  const email = who === 'founder' ? 'tolu@example.test' : `e2e${stamp}${size}@example.test`; const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: SIZES[size] }); const page = await ctx.newPage();
  page.setDefaultTimeout(6000); const errs = []; page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`console: ${m.text()}`); }); page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.status() !== 404 && r.status() !== 401) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  const step = async (name, fn) => { try { await fn(); results.push({ size, name, ok: true }); } catch (e) { results.push({ size, name, ok: false, err: String(e.message).split('\n')[0] }); console.log('FAIL', size, name, String(e.message).split('\n')[0]); } };
  await page.goto(`${BASE}/#/`); await page.waitForSelector('h1');
  await page.screenshot({ path: `${OUT}/${size}-landing.png` });
  await step('sign up', async () => { await page.goto(`${BASE}/#/signup`); await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill('correct horse 12'); await page.getByLabel(/I’m an adult/).check(); await page.getByRole('button', { name: 'Create account' }).click(); await page.waitForURL(/#\/eligibility/); });
  await step('eligibility', async () => { await page.getByLabel('Month').selectOption('6'); await page.getByLabel('Day').selectOption('15'); await page.getByLabel('Year').selectOption(String(new Date().getFullYear() - 21)); await page.getByLabel(/accept the/).check(); await page.getByLabel(/date I entered/).check(); await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForURL(/#\/onboarding/); await page.screenshot({ path: `${OUT}/${size}-onboarding.png` }); });
  await step('onboarding skip', async () => { await page.getByRole('button', { name: 'Skip setup for now' }).click(); await page.waitForURL(/#\/home/); });
  if (who === 'member') await step('post (text)', async () => { await page.getByRole('button', { name: /Share something/ }).click(); await page.getByLabel('What would you like to say?').fill(`Hello from e2e ${size}`); await page.locator('section[aria-label="New post"]').getByRole('button', { name: 'Post', exact: true }).last().click(); await page.getByText(`Hello from e2e ${size}`).first().waitFor(); });
  for (const r of (who === 'founder' ? FOUNDER_ROUTES : ROUTES)) {
    await step(`route ${r}`, async () => {
      await page.goto(`${BASE}/#${r}`); await page.waitForSelector('main h1, main h2, [role="alert"]', { timeout: 8000 }); await page.waitForTimeout(250);
      const bad = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (bad) throw new Error('horizontal overflow');
      if (who === 'founder' && /isn’t open to your account/.test(await page.locator('main').innerText())) throw new Error('founder route forbidden');
      if (['/home', '/settings/privacy', '/learn', '/founder'].includes(r) ) await page.screenshot({ path: `${OUT}/${size}-${r.replace(/\W+/g, '_')}.png` });
    });
  }
  await step('keyboard: skip link is first tab stop', async () => { const p2 = await ctx.newPage(); await p2.goto(`${BASE}/#/home`); await p2.waitForSelector('main'); await p2.waitForTimeout(500); await p2.keyboard.press('Tab'); const t = await p2.evaluate(() => document.activeElement?.textContent ?? ''); await p2.close(); if (!/skip/i.test(t)) throw new Error(`first tab stop was "${t.slice(0, 40)}"`); });
  await step('no dead buttons on nav', async () => { await page.goto(`${BASE}/#/universes`); await page.waitForSelector('main h1'); await page.waitForTimeout(600); const n = await page.locator('main a, main button').count(); if (n < 5) throw new Error('too few controls'); });
  if (errs.length) problems.push(...errs.map((e) => `[${size}] ${e}`));
  await browser.close();
}
for (const s of Object.keys(SIZES)) await run(s);
await run('desktop', 'founder');
const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ base: BASE, results, problems }, null, 2));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`FAIL [${f.size}] ${f.name}: ${f.err}`);
for (const p of problems) console.log('PROBLEM', p);
process.exit(failed.length || problems.length ? 1 : 0);
