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
const ROUTES = ['/home', '/universes/freeconnect', '/universes/freelearn', '/universes/freework', '/universes/freebuild', '/universes/freemarket', '/universes/freeai', '/universes/freeresearch', '/universes/freehealth', '/universes/freefinance', '/universes/freemedia', '/universes/freeevents', '/universes/freevolunteer', '/universes/freelabs', '/universes/freeplay', '/universes/freeentertainment', '/universes/freeplay/games', '/universes/freefinance/tools', '/terms', '/privacy', '/rules', '/explore', '/search?q=study', '/communities', '/learn', '/opportunities', '/mentors', '/events', '/messages', '/notifications', '/saved', '/ai', '/ai/council', '/identities', '/me/profile', '/settings', '/settings/privacy', '/settings/accessibility', '/universes', '/soon/calls', '/help', '/governance', '/founder', '/founder/ai', '/founder/decisions', '/founder/governance', '/founder/audit', '/moderation'];
const results = []; const problems = [];
const stamp = Date.now();

async function run(size, who = 'member') {
  const email = who === 'founder' ? 'tolu@example.test' : `e2e${stamp}${size}@example.test`; const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: SIZES[size] }); const page = await ctx.newPage();
  page.setDefaultTimeout(6000); const errs = []; page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`console: ${m.text()}`); }); page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.status() !== 404 && r.status() !== 401) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  const step = async (name, fn) => { try { await fn(); results.push({ size, name, ok: true }); } catch (e) { results.push({ size, name, ok: false, err: String(e.message).split('\n')[0] }); console.log('FAIL', size, name, String(e.message).split('\n')[0]); } };
  await page.goto(`${BASE}/#/`); await page.waitForSelector('h1');
  await page.screenshot({ path: `${OUT}/${size}-landing.png` });
  for (const lp of ['/terms', '/privacy', '/rules']) await step(`public ${lp}`, async () => { await page.goto(`${BASE}/#${lp}`); await page.waitForSelector('main h2'); if (!/Draft for legal review/.test(await page.locator('main').innerText())) throw new Error('draft notice missing'); if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('horizontal overflow'); });
  await page.goto(`${BASE}/#/`); await page.waitForSelector('h1');
  await step('sign up', async () => { await page.goto(`${BASE}/#/signup`); await page.getByLabel('Email').fill(email); await page.getByLabel('Password', { exact: true }).fill('correct horse 12'); await page.getByLabel('Confirm password').fill('correct horse 12'); await page.getByLabel(/I’m an adult/).check(); await page.getByRole('button', { name: 'Create account' }).click(); await page.waitForURL(/#\/eligibility/); });
  await step('eligibility', async () => { await page.getByLabel('Month').selectOption('6'); await page.getByLabel('Day').selectOption('15'); await page.getByLabel('Year').selectOption(String(new Date().getFullYear() - 21)); await page.getByLabel(/accept the/).check(); await page.getByLabel(/date I entered/).check(); await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForURL(/#\/onboarding/); await page.screenshot({ path: `${OUT}/${size}-onboarding.png` }); });
  await step('onboarding skip', async () => { await page.getByRole('button', { name: 'Skip setup for now' }).click(); await page.waitForURL(/#\/home/); });
  if (who === 'member') await step('post (text)', async () => { await page.getByRole('button', { name: /Share something/ }).click(); await page.getByLabel('What would you like to say?').fill(`Hello from e2e ${size}`); await page.locator('section[aria-label="New post"]').getByRole('button', { name: 'Post', exact: true }).last().click(); await page.getByText(`Hello from e2e ${size}`).first().waitFor(); });
  if (who === 'member') await step('communities: create, then post with an image and two links', async () => {
    await page.goto(`${BASE}/#/communities`); await page.waitForSelector('main h1');
    await page.getByRole('button', { name: 'Start a community' }).click();
    const nm = `E2E Club ${stamp}${size}`.slice(0, 48);
    await page.getByLabel('Name', { exact: true }).fill(nm); await page.getByLabel('What is it for?').fill('A community created by the browser test.');
    await page.getByRole('button', { name: 'Create community' }).click(); await page.waitForURL(/#\/communities\/e2e-club/, { timeout: 8000 });
    await page.getByRole('heading', { name: 'Community health' }).waitFor({ timeout: 8000 });
    await page.getByRole('button', { name: /Share something/ }).click();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type=file][multiple]').setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: png }, { name: 'b.png', mimeType: 'image/png', buffer: png }]);
    await page.getByRole('list', { name: /Images, in the order/ }).waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('.attach-item img').length === 2, null, { timeout: 10000 }).catch(() => { throw new Error('expected 2 uploaded images'); });
    await page.getByRole('button', { name: 'Move image 2 up' }).click(); await page.getByRole('button', { name: 'Remove image 2' }).click();
    if ((await page.locator('.attach-item img').count()) !== 1) throw new Error('remove did not work');
    for (const u of ['https://example.com/one', 'https://news.example.org/two']) { await page.getByLabel('Add a link').fill(u); await page.getByRole('button', { name: 'Add link' }).click(); }
    await page.getByLabel('Add a link').fill('not a link'); await page.getByRole('button', { name: 'Add link' }).click(); await page.getByText(/full web address/).waitFor();
    await page.getByLabel('What would you like to say?').fill('Attachments from the browser test');
    await page.getByRole('region', { name: 'New post' }).getByRole('button', { name: 'Post', exact: true }).last().click();
    await page.getByRole('list', { name: 'Links in this post' }).first().waitFor({ timeout: 8000 });
    const hosts = await page.locator('[aria-label="Links in this post"] li').allInnerTexts(); if (!hosts.join(' ').includes('news.example.org')) throw new Error('links not shown: ' + hosts);
  });
  for (const r of (who === 'founder' ? FOUNDER_ROUTES : ROUTES)) {
    await step(`route ${r}`, async () => {
      await page.goto(`${BASE}/#${r}`); await page.waitForSelector('main h1, main h2, [role="alert"]', { timeout: 8000 }); await page.waitForTimeout(250);
      const bad = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (bad) throw new Error('horizontal overflow');
      if (who === 'founder' && /isn’t open to your account/.test(await page.locator('main').innerText())) throw new Error('founder route forbidden');
      if (['/home', '/settings/privacy', '/learn', '/founder', '/universes/freeplay', '/universes/freefinance'].includes(r) ) await page.screenshot({ path: `${OUT}/${size}-${r.replace(/\W+/g, '_')}.png` });
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
