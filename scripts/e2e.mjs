// Browser verification: drives the real server + built client with Playwright at phone, tablet and desktop sizes.
// Usage: BASE=http://127.0.0.1:5199 node scripts/e2e.mjs   (server must be running with the local dev sign-in)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const OUT = process.env.SHOTS || 'screenshots/stage2'; mkdirSync(OUT, { recursive: true });
const SIZES = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1100 }, desktop: { width: 1366, height: 900 } };
const FOUNDER_ROUTES = ['/founder', '/founder/ai', '/founder/decisions', '/founder/suggestions', '/founder/appointments', '/founder/polls', '/founder/governance', '/founder/access', '/founder/communities', '/founder/universes', '/founder/council', '/founder/audit', '/founder/constitution', '/founder/priorities', '/governance', '/moderation'];
const ROUTES = ['/suggestions', '/polls', '/home', '/universes/freeconnect', '/universes/freelearn', '/universes/freework', '/universes/freebuild', '/universes/freemarket', '/universes/freeai', '/universes/freeresearch', '/universes/freehealth', '/universes/freefinance', '/universes/freemedia', '/universes/freeevents', '/universes/freevolunteer', '/universes/freelabs', '/universes/freeplay', '/universes/freeentertainment', '/universes/freeplay/games', '/universes/freefinance/tools', '/terms', '/privacy', '/rules', '/explore', '/search?q=study', '/communities', '/learn', '/opportunities', '/mentors', '/events', '/messages', '/notifications', '/saved', '/ai', '/ai/council', '/identities', '/me/profile', '/settings', '/settings/privacy', '/settings/accessibility', '/universes', '/soon/calls', '/help', '/governance', '/founder', '/founder/ai', '/founder/decisions', '/founder/governance', '/founder/audit', '/moderation'];
const results = []; const problems = [];
const stamp = Date.now();

async function run(size, who = 'member') {
  const email = who === 'founder' ? 'tolu@example.test' : `e2e${stamp}${size}@example.test`; const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: SIZES[size] }); const page = await ctx.newPage();
  page.setDefaultTimeout(6000); const errs = []; const expected = { on: false }; page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`console: ${m.text()}`); }); page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.status() !== 404 && r.status() !== 401 && !expected.on) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  const step = async (name, fn) => { try { await fn(); results.push({ size, name, ok: true }); } catch (e) { results.push({ size, name, ok: false, err: String(e.message).split('\n')[0] }); await page.screenshot({ path: `${OUT}/FAIL-${size}-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined); console.log('FAIL', size, name, String(e.message).split('\n')[0]); } };
  await page.goto(`${BASE}/#/`); await page.waitForSelector('h1');
  await page.screenshot({ path: `${OUT}/${size}-landing.png` });
  for (const lp of ['/terms', '/privacy', '/rules']) await step(`public ${lp}`, async () => { await page.goto(`${BASE}/#${lp}`); await page.waitForSelector('main h2'); if (!/Draft for legal review/.test(await page.locator('main').innerText())) throw new Error('draft notice missing'); if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('horizontal overflow'); });
  await page.goto(`${BASE}/#/`); await page.waitForSelector('h1');
  await step('sign up', async () => { await page.goto(`${BASE}/#/signup`); await page.getByLabel('Email').fill(email); await page.getByLabel('Password', { exact: true }).fill('correct horse 12'); await page.getByLabel('Confirm password').fill('correct horse 12'); await page.getByLabel(/I’m an adult/).check(); await page.getByRole('button', { name: 'Create account' }).click(); await page.waitForURL(/#\/eligibility/); });
  await step('eligibility', async () => { await page.getByLabel('Month').selectOption('6'); await page.getByLabel('Day').selectOption('15'); await page.getByLabel('Year').selectOption(String(new Date().getFullYear() - 21)); await page.getByLabel(/accept the/).check(); await page.getByLabel(/date I entered/).check(); await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForURL(/#\/onboarding/); await page.screenshot({ path: `${OUT}/${size}-onboarding.png` }); });
  await step('onboarding skip', async () => { await page.getByRole('button', { name: 'Skip setup for now' }).click(); await page.waitForURL(/#\/home/); });
  if (who === 'member') await step('page environments: mount per page, none on Home, calm on focus pages, never block clicks', async () => {
    const want = [['/communities', 'communities', 'full'], ['/notifications', 'notifications', 'full'], ['/saved', 'saved', 'full'], ['/messages', 'messages', 'calm'], ['/settings/privacy', 'settings', 'calm']];
    for (const [path, env, mode] of want) {
      await page.goto(`${BASE}/#${path}`); await page.waitForSelector('main h1'); await page.waitForSelector('canvas[data-env-canvas]', { timeout: 8000 });
      const got = await page.evaluate(() => { const c = document.querySelector('canvas[data-env-canvas]'); return { env: c.dataset.envCanvas, mode: c.dataset.envMode, pe: getComputedStyle(c).pointerEvents, hidden: c.getAttribute('aria-hidden') }; });
      if (got.env !== env) throw new Error(`${path}: expected environment ${env}, got ${got.env}`);
      if (got.mode !== mode) throw new Error(`${path}: expected mode ${mode}, got ${got.mode}`);
      if (got.pe !== 'none' || got.hidden !== 'true') throw new Error(`${path}: backdrop must be inert and hidden from assistive tech`);
    }
    await page.goto(`${BASE}/#/home`); await page.waitForSelector('main h1'); await page.waitForTimeout(400);
    if (await page.locator('canvas[data-env-canvas]').count()) throw new Error('Home must not have a page environment');
    await page.goto(`${BASE}/#/communities`); await page.waitForSelector('canvas[data-env-canvas]');
    const live = await page.evaluate(() => window.FreeverseEnvironments.liveCount()); if (live !== 1) throw new Error(`expected exactly 1 live environment, got ${live}`);
    await page.goto(`${BASE}/#/home`); await page.waitForTimeout(500);
    const after = await page.evaluate(() => window.FreeverseEnvironments.liveCount()); if (after !== 0) throw new Error(`environment leaked after leaving the page (${after})`);
  });
  if (who === 'member') await step('dashboard is a command centre, not a feed', async () => {
    await page.evaluate(async () => { await fetch('/api/identities', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('fv.session')}` }, body: JSON.stringify({ archetype: 'creator', answers: {} }) }); });
    await page.goto(`${BASE}/#/home`); await page.reload(); await page.waitForSelector('.dmap-svg', { timeout: 8000 });
    if (await page.locator('[aria-label="Feed order"], section[aria-label="New post"]').count()) throw new Error('the Dashboard must not contain the feed or composer');
    for (const h of ['Recommended for you', 'Recent messages', 'Quick access', 'Continue where you left off']) await page.getByRole('heading', { name: h }).waitFor();
    const unis = await page.locator('.dmap-uni').count(); if (unis < 1) throw new Error('ecosystem map shows no Universes for a chosen identity');
    const hrefs = await page.locator('.dmap-node').evaluateAll((a) => a.map((x) => x.getAttribute('href'))); if (hrefs.some((h) => !h || h === '#')) throw new Error('a map node has no destination');
    await page.locator('.dmap-uni').first().focus(); await page.keyboard.press('Enter'); await page.waitForURL(/#\/universes\//);
    await page.goto(`${BASE}/#/home`); await page.getByRole('link', { name: 'Open the Feed' }).click(); await page.waitForURL(/#\/feed/); await page.getByRole('heading', { name: 'Feed', level: 1 }).waitFor();
  });
  if (who === 'member') await step('post (text) on the Feed page', async () => { await page.goto(`${BASE}/#/feed`); await page.getByRole('heading', { name: 'Feed', level: 1 }).waitFor(); await page.getByRole('button', { name: /Share something/ }).click(); await page.getByLabel('What would you like to say?').fill(`Hello from e2e ${size}`); await page.locator('section[aria-label="New post"]').getByRole('button', { name: 'Post', exact: true }).last().click(); await page.getByText(`Hello from e2e ${size}`).first().waitFor(); });
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
  if (who === 'member') await step('entertainment: add a title, filter it, host a watch-along that shows as upcoming', async () => {
    await page.goto(`${BASE}/#/universes/freeentertainment/recommendations`); await page.waitForSelector('main h1');
    const nm = `Moonlit Tale ${stamp}${size}`.slice(0, 60);
    await page.getByRole('button', { name: 'Add a title' }).click();
    const f = page.getByRole('region', { name: 'Add a title' });
    await f.getByLabel('Title', { exact: true }).fill(nm); await f.getByLabel('Why do you recommend it?').fill('A gentle story worth the evening.');
    await f.getByLabel('Format').selectOption('Anime'); await f.getByLabel('Genre').selectOption('Fantasy'); await f.getByLabel('Original language').selectOption('Japanese');
    await f.getByLabel('Release year').fill('2001'); await f.getByLabel('How can people watch it?').selectOption('Information only');
    await f.getByLabel('Your rating').selectOption({ index: 1 }); await f.getByLabel('Spoilers').selectOption({ index: 1 });
    await f.getByRole('button', { name: 'Post', exact: true }).last().click();
    await page.getByText(nm).first().waitFor({ timeout: 8000 });
    await page.getByLabel('Genre').selectOption('Horror'); await page.waitForFunction((n) => !document.body.innerText.includes(n), nm, { timeout: 8000 });
    await page.getByLabel('Genre').selectOption('Fantasy'); await page.getByText(nm).first().waitFor({ timeout: 8000 });
    await page.goto(`${BASE}/#/universes/freeentertainment/watch-alongs`); await page.waitForSelector('main h1');
    await page.getByRole('button', { name: 'Host a watch-along' }).click();
    const w = page.getByRole('region', { name: 'Host a watch-along' });
    await w.getByLabel('What are you watching?').fill(`Night viewing ${stamp}${size}`.slice(0, 60)); await w.getByLabel('Starts').fill('2031-05-01T19:00');
    await w.getByLabel('Format').selectOption('Series'); await w.getByLabel('Where will everyone watch?').selectOption('External destination');
    await w.getByRole('button', { name: 'Post', exact: true }).last().click();
    await page.getByText('Upcoming').first().waitFor({ timeout: 8000 });
    await page.getByRole('button', { name: 'Live now' }).click(); await page.getByText(/Night viewing/).first().waitFor({ state: 'detached', timeout: 8000 });
  });
  if (who === 'member') await step('AI preferences: save a style, see honest capabilities, switch Nova to Creative mode', async () => {
    await page.goto(`${BASE}/#/ai/preferences`); await page.getByRole('heading', { name: 'How should assistants talk to you?' }).waitFor({ timeout: 8000 });
    await page.getByLabel('Tone').selectOption('direct'); const saved = page.waitForResponse((r) => r.url().includes('/api/settings') && r.request().method() === 'PATCH', { timeout: 8000 }); await page.getByRole('button', { name: 'Save style' }).click(); if (!(await saved).ok()) throw new Error('save failed');
    await page.reload(); await page.getByRole('heading', { name: 'How should assistants talk to you?' }).waitFor({ timeout: 8000 });
    if ((await page.getByLabel('Tone').inputValue()) !== 'direct') throw new Error('style did not persist');
    await page.getByText('Image input', { exact: true }).waitFor(); await page.getByText('Not available yet').first().waitFor();
    await page.goto(`${BASE}/#/ai/chat/temporary`); await page.getByRole('group', { name: 'Nova mode' }).getByRole('button', { name: 'Creative' }).click();
    await page.getByText(/Creative mode: ideas/).waitFor();
  });
  if (who === 'member') await step('suggestions: send a private suggestion and see it with its status', async () => {
    await page.goto(`${BASE}/#/suggestions`); await page.getByRole('heading', { name: 'Suggest an improvement' }).waitFor({ timeout: 8000 });
    const t = `Browser test idea ${stamp}${size}`.slice(0, 60);
    await page.getByLabel('Title').fill(t); await page.getByLabel('What would you like, and why?').fill('It would help to have this because it makes daily use easier for me.');
    await page.getByLabel('What is it about?').selectOption('usability'); await page.getByRole('button', { name: 'Send suggestion' }).click();
    await page.getByRole('heading', { name: t }).waitFor({ timeout: 8000 }); await page.getByText('Submitted').first().waitFor();
  });
  if (who === 'member') await step('identity labels: search the list, add one as "becoming", add own words, see them on the profile; authority words refused', async () => {
    await page.goto(`${BASE}/#/identities`); await page.getByRole('heading', { name: 'How you describe yourself' }).waitFor({ timeout: 10000 });
    await page.getByLabel('This is…').selectOption('aspiring');
    await page.getByLabel('Search the list').fill('podcast');
    await page.getByRole('group', { name: 'Matching labels' }).getByRole('button', { name: 'Podcaster' }).click();
    await page.getByRole('region', { name: /I’m becoming/ }).getByText('Podcaster').waitFor({ timeout: 8000 });
    await page.getByLabel('Or describe yourself in your own words').fill('Night-shift poet'); await page.getByRole('button', { name: 'Add in my own words' }).click();
    await page.getByText('Night-shift poet').waitFor({ timeout: 8000 });
    expected.on = true; await page.getByLabel('Or describe yourself in your own words').fill('FREEVERSE Admin'); await page.getByRole('button', { name: 'Add in my own words' }).click();
    await page.getByText(/can’t claim a FREEVERSE role/).waitFor({ timeout: 8000 }); expected.on = false;
    await page.screenshot({ path: `${OUT}/${size}-identity-labels.png` });
    await page.goto(`${BASE}/#/me/profile`); await page.waitForSelector('main h1');
    const own = await page.evaluate(async () => { const k = Object.keys(localStorage).find((x) => x.includes('fv.session')); const tok = k ? localStorage.getItem(k) : null; if (!tok) return null; const r = await fetch('/api/me', { headers: { authorization: `Bearer ${String(tok).replace(/^"|"$/g, '')}` } }); const j = await r.json(); return j.user?.handle ? `#/u/${j.user.handle}` : null; });
    if (!own) throw new Error('could not work out the own handle');
    await page.goto(`${BASE}/${own}`); await page.getByRole('heading', { name: 'In their own words' }).waitFor({ timeout: 8000 });
    await page.getByText('Night-shift poet').waitFor();
  });
  if (who === 'founder') await step('console: ecosystem map opens a context layer; command bar navigates; suggestions queue lists items', async () => {
    await page.goto(`${BASE}/#/founder`); await page.getByRole('heading', { name: 'The ecosystem' }).waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${OUT}/${size}-founder-console.png` });
    await page.getByRole('button', { name: /^Safety:/ }).click(); await page.screenshot({ path: `${OUT}/${size}-founder-console-open.png` }); await page.getByRole('heading', { name: 'Safety', exact: true }).waitFor({ timeout: 5000 }); await page.getByText(/How this level is decided/).waitFor();
    await page.keyboard.press('Control+k'); await page.getByRole('dialog', { name: 'Command bar' }).waitFor(); await page.getByRole('combobox', { name: 'Go to a workspace' }).fill('suggest'); await page.keyboard.press('Enter');
    await page.waitForURL(/#\/founder\/suggestions/, { timeout: 5000 }); await page.getByRole('heading', { name: 'Suggestions from citizens' }).waitFor({ timeout: 8000 });
    await page.getByText(/Browser test idea/).first().waitFor({ timeout: 8000 });
  });
  if (who === 'founder') await step('founder AI: tabbed workspace; prepared change shows its lifecycle at Decide; Mode lives under its own tab', async () => {
    await page.goto(`${BASE}/#/founder/ai`); await page.getByRole('tab', { name: 'Ask' }).waitFor({ timeout: 10000 });
    if ((await page.getByRole('tab').count()) !== 6) throw new Error('expected 6 workspace tabs');
    if (await page.getByRole('heading', { name: /^Mode:/ }).count()) throw new Error('mode card should not be on the Ask tab');
    await page.getByRole('tab', { name: 'Mode and boundaries' }).click(); await page.getByRole('heading', { name: /^Mode:/ }).waitFor({ timeout: 5000 });
    await page.getByRole('tab', { name: 'Prepare a change' }).click();
    await page.getByLabel('Title').fill('Move FreePlay back to concept'); await page.getByLabel('Why').fill('E2E: checking the lifecycle display');
    await page.getByRole('button', { name: 'Prepare proposal' }).click();
    await page.getByRole('heading', { name: 'Work', exact: true }).waitFor({ timeout: 8000 });
    const item = page.locator('li.card', { hasText: 'Move FreePlay back to concept' }).first(); await item.waitFor({ timeout: 8000 });
    await item.getByRole('list', { name: /Progress for/ }).waitFor();
    if (!(await item.locator('.stage.st-current', { hasText: 'Decide' }).count())) throw new Error('Decide should be the current stage while waiting');
    if (await item.locator('.stage.st-done', { hasText: 'Execute' }).count()) throw new Error('Execute must not show done before approval');
    await page.screenshot({ path: `${OUT}/${size}-founder-ai-work.png` });
  });
  if (who === 'founder') await step('universes admin: preview shows what members will see before saving; history is listed', async () => {
    await page.goto(`${BASE}/#/founder/universes`); await page.getByRole('heading', { name: 'Universes', exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Change' }).first().click();
    await page.getByRole('heading', { name: /What members will see/ }).waitFor({ timeout: 8000 });
    await page.getByLabel('Status').selectOption('concept'); await page.getByLabel('Note shown to members').fill('E2E preview note');
    await page.locator('[aria-label="Preview of what members will see"]').getByText('E2E preview note').waitFor({ timeout: 8000 });
    await page.getByRole('heading', { name: 'Change history' }).waitFor();
    await page.screenshot({ path: `${OUT}/${size}-founder-universes-preview.png` });
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
  if (who === 'founder') await step('governance: draft and publish a poll, vote in it; appointments and community oversight screens load', async () => {
    await page.goto(`${BASE}/#/founder/polls`); await page.getByRole('heading', { name: 'Draft a poll' }).waitFor({ timeout: 10000 });
    const q = `Browser poll ${stamp}`.slice(0, 60);
    await page.getByLabel('Question').fill(q); await page.getByLabel('Background for voters').fill('This is a poll created by the browser test to check the flow.');
    await page.getByLabel('Option 1').fill('Yes'); await page.getByLabel('Option 2').fill('No'); await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByRole('heading', { name: q }).waitFor({ timeout: 8000 });
    const d = new Date(Date.now() + 26 * 3600_000); const pad = (n) => String(n).padStart(2, '0'); await page.getByLabel('Voting closes').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    await page.getByRole('button', { name: 'Publish poll' }).click(); await page.getByText('Open for voting').first().waitFor({ timeout: 8000 });
    await page.goto(`${BASE}/#/polls`); await page.getByRole('heading', { name: q }).waitFor({ timeout: 8000 }); await page.getByLabel('Yes').check(); await page.getByRole('button', { name: 'Send my vote' }).click(); await page.getByText(/You voted/).waitFor({ timeout: 8000 });
    await page.goto(`${BASE}/#/founder/appointments`); await page.getByRole('heading', { name: 'Appointments and access' }).waitFor({ timeout: 8000 });
    await page.goto(`${BASE}/#/founder/communities`); await page.getByRole('button', { name: 'Restrict' }).first().waitFor({ timeout: 8000 });
  });
  if (who === 'member' && size === 'desktop') await step('motion: Full, Less and Off really differ in the app and on the landing page', async () => {
    const anim = (sel) => page.evaluate((q) => { const el = document.querySelector(q); return el ? getComputedStyle(el).animationName : 'missing'; }, sel);
    await page.goto(`${BASE}/#/settings/accessibility`); const sel = page.getByLabel('Decorative motion'); await sel.waitFor({ timeout: 8000 });
    const seen = {};
    for (const [value, key] of [['full', 'full'], ['reduced', 'less'], ['off', 'off']]) {
      await sel.selectOption(value); await page.waitForFunction((k) => document.documentElement.dataset.motionLevel === k, key, { timeout: 5000 });
      await page.goto(`${BASE}/#/home`); await page.waitForSelector('.env-page'); seen[key] = await anim('.env-page[data-env="home"]');
      await page.goto(`${BASE}/#/settings/accessibility`); await sel.waitFor();
    }
    if (seen.full !== 'env-rise' || seen.less !== 'env-fade' || seen.off !== 'none') throw new Error('app motion levels do not differ: ' + JSON.stringify(seen));
    // the landing page (signed out): chapter-specific entrance only under Full
    const landing = {};
    for (const [label, key] of [['Full', 'full'], ['Less', 'less'], ['Off', 'off']]) {
      const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p2 = await c2.newPage(); await p2.goto(`${BASE}/`); await p2.waitForSelector('.ch-identity .chip-cloud', { timeout: 15000 });
      await p2.locator('.j-actions').getByRole('button', { name: label, exact: true }).click(); await p2.waitForFunction((k) => document.documentElement.dataset.motionLevel === k, key, { timeout: 5000 });
      await p2.evaluate(() => document.querySelector('.ch-identity')?.scrollIntoView()); await p2.waitForFunction(() => document.querySelector('.chip-cloud')?.classList.contains('in'), null, { timeout: 8000 });
      landing[key] = await p2.evaluate(() => getComputedStyle(document.querySelector('.ch-identity .chip-cloud li')).animationName); await c2.close();
    }
    if (landing.full !== 'ch-assemble' || landing.less !== 'none' || landing.off !== 'none') throw new Error('landing motion levels do not differ: ' + JSON.stringify(landing));
    await sel.selectOption('auto');
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
// Founder console on a phone: sign the Founder back in on a phone-sized screen and check key screens for overflow and tap-size problems.
async function founderPhone() {
  const size = 'phone-founder'; const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: SIZES.phone }); const page = await ctx.newPage(); page.setDefaultTimeout(8000);
  const step = async (name, fn) => { try { await fn(); results.push({ size, name, ok: true }); } catch (e) { results.push({ size, name, ok: false, err: String(e.message).split('\n')[0] }); console.log('FAIL', size, name, String(e.message).split('\n')[0]); } };
  await step('founder signs in on a phone', async () => { await page.goto(`${BASE}/#/signin`); await page.getByLabel('Email').fill('tolu@example.test'); await page.getByLabel('Password', { exact: true }).fill('correct horse 12'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL(/#\/(home|founder)/, { timeout: 10000 }); });
  for (const r of ['/founder', '/founder/ai', '/founder/decisions', '/founder/suggestions', '/founder/polls', '/founder/governance', '/founder/communities', '/founder/appointments', '/founder/audit']) {
    await step(`phone founder ${r}`, async () => {
      await page.goto(`${BASE}/#${r}`); await page.waitForSelector('main h1, main h2', { timeout: 8000 }); await page.waitForTimeout(300);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('horizontal overflow');
      const small = await page.evaluate(() => [...document.querySelectorAll('main button, main a[href], main [role="tab"]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 32 && getComputedStyle(e).display !== 'inline'; }).map((e) => (e.textContent || '').trim().slice(0, 24)));
      if (small.length > 3) throw new Error('too many small tap targets: ' + small.slice(0, 5).join(' | '));
      await page.screenshot({ path: `${OUT}/phone-founder-${r.replace(/\W+/g, '_')}.png` });
    });
  }
  await step('phone founder: Founder AI tabs reachable and the lifecycle stacks', async () => {
    await page.goto(`${BASE}/#/founder/ai`); await page.getByRole('tab', { name: 'Work' }).click(); await page.getByRole('heading', { name: 'Work', exact: true }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('horizontal overflow on Work');
    await page.screenshot({ path: `${OUT}/phone-founder-ai-work.png` });
  });
  await browser.close();
}
await founderPhone();
const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ base: BASE, results, problems }, null, 2));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`FAIL [${f.size}] ${f.name}: ${f.err}`);
for (const p of problems) console.log('PROBLEM', p);
process.exit(failed.length || problems.length ? 1 : 0);
