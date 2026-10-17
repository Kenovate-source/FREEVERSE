// End-to-end smoke + visual capture. Launches dist/ through the local static server in Chromium (Playwright).
// Every check prints PASS/FAIL; the process exits non-zero if any check fails. Nothing here talks to the internet.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright')); }

const PORT = 5199;
const BASE = `http://localhost:${PORT}/index.html`;
const results = [];
const consoleErrors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

await mkdir('screenshots', { recursive: true });
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const shot = (name) => page.screenshot({ path: `screenshots/${name}.png`, fullPage: false });
const go = async (hash) => { await page.evaluate((h) => { window.location.hash = h; }, hash); await page.waitForTimeout(120); };
const settle = (ms = 700) => page.waitForTimeout(ms);
const h1 = async () => (await page.locator('h1').first().innerText()).trim();
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

try {
  // ---------- Welcome ----------
  await page.goto(BASE); await settle(300);
  check('welcome: headline renders', (await h1()).includes('trusted place'));
  check('welcome: states mock clearly', await page.getByText('Stage 1 prototype').first().isVisible());
  await shot('01-welcome-desktop');

  // ---------- Sign up: 18+ attestation is required ----------
  await go('/signup'); await settle(200);
  await page.getByLabel('Display name').fill('Test Person');
  await page.getByLabel('Email').fill('test.person@example.com');
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  check('signup: blocked without 18+ confirmation', (await page.locator('#adult-err').count()) === 1 && page.url().endsWith('#/signup'));
  check('signup: focus moves to the first invalid field', await page.evaluate(() => document.activeElement?.id === 'adult-attest'));
  await shot('02-signup-error-desktop');
  await page.getByLabel('I confirm that I am 18 or older.').check();
  await page.getByRole('button', { name: 'Create account' }).click(); await settle(200);
  check('signup: proceeds to onboarding after attestation', page.url().endsWith('#/onboarding'));
  const stored = await page.evaluate(() => localStorage.getItem('fv.mock.accounts') ?? '');
  check('signup: password is never stored', !stored.includes('correct-horse-battery'));
  check('signup: attestation recorded as self_attestation', stored.includes('self_attestation') && stored.includes('attested'));

  // ---------- Onboarding ----------
  check('onboarding: welcome step', (await h1()).startsWith('Welcome'));
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByLabel('Display name').fill('');
  await page.getByRole('button', { name: 'Next' }).click();
  check('onboarding: validates display name', await page.getByText('Display name must be at least 2 characters.').isVisible());
  await page.getByLabel('Display name').fill('Test Person');
  await page.getByLabel('Short bio').fill('Testing the prototype.');
  await shot('03-onboarding-profile-desktop');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  check('onboarding: interest chip toggles', (await page.getByRole('button', { name: 'Design', exact: true }).getAttribute('aria-pressed')) === 'true');
  await page.getByRole('button', { name: 'Continue' }).click();
  check('onboarding: Nova step shows non-therapist framing', await page.getByText('Nova is not a therapist, counsellor or crisis service').isVisible());
  await shot('04-onboarding-nova-desktop');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Enter FREEVERSE' }).click(); await settle(900);
  check('onboarding: lands on Home', page.url().endsWith('#/home'));

  // ---------- Home / feed ----------
  const posts = page.locator('article[aria-label^="Post by"]');
  check('home: feed renders seeded posts', (await posts.count()) === 8, `count=${await posts.count()}`);
  const times = await page.locator('article[aria-label^="Post by"] time').evaluateAll((els) => els.map((e) => new Date(e.getAttribute('datetime')).getTime()));
  check('home: feed is strictly newest-first', times.every((t, i) => i === 0 || times[i - 1] >= t));
  await shot('05-home-desktop');
  await page.getByLabel('Share something with the community').fill('Hello from the Stage 1 test run #testing');
  await page.getByRole('button', { name: 'Post', exact: true }).click(); await settle(700);
  check('home: new post appears first', (await posts.first().innerText()).includes('Hello from the Stage 1 test run'));
  const heart = posts.nth(1).getByRole('button', { name: /React/ });
  const before = await heart.getAttribute('aria-pressed');
  await heart.click(); await settle(600);
  check('home: reaction toggles', (await posts.nth(1).getByRole('button', { name: /reaction|React/i }).first().getAttribute('aria-pressed')) !== before);
  await posts.nth(1).getByRole('button', { name: /Report post/ }).click();
  check('home: report dialog is honest that nothing was sent', await page.getByRole('dialog').getByText('Nothing was sent.').isVisible());
  await page.keyboard.press('Escape');
  await page.getByLabel('Share something with the community').fill('   ');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  check('home: empty post is rejected with a message', await page.getByText('Write something before posting.').isVisible());

  // ---------- Every principal nav item leads somewhere meaningful ----------
  const nav = [['Home', 'home'], ['Learn', 'learn'], ['Opportunities', 'opportunities'], ['Events', 'events'], ['Nova', 'nova'], ['Messages', 'messages']];
  for (const [label, slug] of nav) {
    await page.locator('aside.sidebar').getByRole('link', { name: label, exact: true }).click(); await settle(900);
    const t = await h1();
    check(`nav: ${label} → screen with heading`, t.length > 0 && page.url().includes(`#/${slug}`), `h1="${t}"`);
    check(`nav: ${label} marked aria-current`, (await page.locator('aside.sidebar').getByRole('link', { name: label, exact: true }).getAttribute('aria-current')) === 'page');
    if (slug !== 'home') check(`nav: ${label} focus moved to main`, await page.evaluate(() => document.activeElement?.id === 'main'));  // Home is already the current page on the first click, so no navigation occurs
    await shot(`06-${slug}-desktop`);
  }
  await page.locator('aside.sidebar').getByRole('link', { name: 'Profile', exact: true }).click(); await settle(900);
  check('nav: Profile screen', (await h1()) === 'Your profile'); await shot('06-profile-desktop');

  // ---------- Learn detail, Mentors, Events, Nova ----------
  await go('/learn'); await settle(700);
  await page.getByRole('link', { name: 'Your first CV when you have no “experience”' }).click(); await settle(700);
  check('learn: article detail renders body', await page.getByText('Keep it to one page.').isVisible()); await shot('07-learn-article-desktop');
  await go('/learn/l-path-portfolio'); await settle(700);
  check('learn: path shows ordered steps', (await page.locator('ol.steps li').count()) === 4); await shot('07-learn-path-desktop');
  await go('/learn/does-not-exist'); await settle(700);
  check('learn: unknown lesson shows a not-found state', await page.getByText('Lesson not found').first().isVisible());
  await go('/opportunities'); await settle(700);
  check('opportunities: apply controls are disabled and explained', (await page.getByRole('button', { name: /Apply on organisation/ }).first().isDisabled()));
  await page.getByRole('button', { name: 'Scholarships' }).click(); await settle(700);
  check('opportunities: filter narrows list', (await page.locator('ul.grid-cards > li').count()) === 2, `count=${await page.locator('ul.grid-cards > li').count()}`);
  await go('/opportunities/mentors'); await settle(700);
  await page.getByRole('button', { name: 'Request introduction' }).first().click(); await settle(700);
  check('mentors: request recorded with honest wording', await page.getByText('No one has been contacted.').first().isVisible()); await shot('07-mentors-desktop');
  await go('/events'); await settle(700);
  await page.getByRole('group', { name: /RSVP for Portfolio Clinic/ }).getByRole('button', { name: 'Going' }).click(); await settle(700);
  check('events: RSVP toggles and persists in view', (await page.getByRole('group', { name: /RSVP for Portfolio Clinic/ }).getByRole('button', { name: 'Going' }).getAttribute('aria-pressed')) === 'true');
  await go('/nova'); await settle(500);
  await page.getByLabel('Message Nova').fill('I want to learn a new skill'); await page.getByRole('button', { name: 'Send' }).click(); await settle(1000);
  check('nova: scripted reply is labelled as mock', (await page.getByText('Scripted mock reply').count()) >= 2); await shot('07-nova-chat-desktop');

  // ---------- Simulated failure states ----------
  await page.evaluate(() => sessionStorage.setItem('fv.mock.simmode', 'error')); await page.reload(); await go('/home'); await settle(1200);
  check('error mode: feed shows error with retry', await page.getByText('We couldn’t load your feed').isVisible() && await page.getByRole('button', { name: 'Try again' }).first().isVisible()); await shot('08-home-error-desktop');
  await page.evaluate(() => sessionStorage.setItem('fv.mock.simmode', 'empty')); await page.reload(); await go('/learn'); await settle(1200);
  check('empty mode: Learn shows empty state', await page.getByText('No lessons here yet').isVisible()); await shot('08-learn-empty-desktop');
  await page.evaluate(() => sessionStorage.setItem('fv.mock.simmode', 'slow')); await page.reload(); await go('/events'); await page.waitForTimeout(900);
  check('slow mode: loading skeleton is announced', (await page.locator('[role="status"][aria-busy="true"]').count()) >= 1); await shot('08-events-loading-desktop');
  await page.evaluate(() => sessionStorage.setItem('fv.mock.simmode', 'normal')); await page.reload(); await settle(800);

  // ---------- Not found + guards ----------
  await go('/no/such/page'); await settle(400);
  check('router: unknown route shows not-found with a way back', await page.getByText('We can’t find that page').isVisible());
  await page.locator('aside.sidebar').getByRole('button', { name: 'Sign out' }).click(); await settle(300);
  await go('/home'); await settle(300);
  check('guard: signed-out user is redirected from /home', page.url().endsWith('#/'));
  await page.getByRole('button', { name: 'Explore with the demo account' }).click(); await settle(900);
  check('demo account: lands on Home with the demo profile', page.url().endsWith('#/home') && await page.getByText('Good', { exact: false }).first().isVisible());

  // ---------- Keyboard ----------
  await page.reload(); await settle(500);
  await page.keyboard.press('Tab');
  check('keyboard: first Tab stop is the skip link', await page.evaluate(() => document.activeElement?.classList.contains('skip-link')));
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow);
  check('keyboard: focus is visibly styled', ring && ring !== 'none', ring.slice(0, 60));

  // ---------- Responsive: overflow + screenshots at phone widths ----------
  const widths = [360, 390, 768, 1280];
  const screens = ['/home', '/learn', '/opportunities', '/opportunities/mentors', '/events', '/nova', '/messages', '/profile'];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 844 });
    const bad = [];
    for (const s of screens) { await go(s); await settle(850); const o = await overflow(); if (o > 0) bad.push(`${s}(+${o}px)`); }
    check(`responsive ${w}px: no horizontal overflow on any signed-in screen`, bad.length === 0, bad.join(', '));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [s, n] of [['/home', 'home'], ['/learn', 'learn'], ['/opportunities', 'opportunities'], ['/events', 'events'], ['/nova', 'nova'], ['/messages', 'messages'], ['/profile', 'profile']]) {
    await go(s); await settle(900); await shot(`09-${n}-phone`);
  }
  const tabbarOk = await page.evaluate(() => { const t = document.querySelector('.tabbar'); return !!t && getComputedStyle(t).display !== 'none'; });
  check('responsive: mobile tab bar visible at phone width', tabbarOk);
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('button, a[href], input, textarea, select')].filter((el) => { const n = (el.getAttribute('aria-label') || el.textContent || '').trim(); const labelled = el.labels && el.labels.length > 0; return !n && !labelled && !el.getAttribute('aria-labelledby'); }).map((e) => e.outerHTML.slice(0, 80)));
  check('a11y: every interactive control has an accessible name (Profile screen, phone)', unnamed.length === 0, unnamed.join(' | '));

  // Signed-out phone screenshots
  await page.evaluate(() => { localStorage.clear(); }); await page.reload(); await go('/'); await settle(500); await shot('09-welcome-phone');
  await go('/signup'); await settle(300); await shot('09-signup-phone');

  // ---------- file:// launch (open dist/index.html directly) ----------
  const filePage = await ctx.newPage();
  const fileErrors = [];
  filePage.on('pageerror', (e) => fileErrors.push(e.message));
  await filePage.goto('file://' + process.cwd() + '/dist/index.html'); await filePage.waitForTimeout(600);
  check('file://: dist/index.html launches directly from disk', (await filePage.locator('h1').first().innerText()).includes('trusted place') && fileErrors.length === 0, fileErrors.join(' | '));
  await filePage.close();

  check('console: no errors or page exceptions during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('e2e run completed without a crash', false, String(e).slice(0, 300));
} finally {
  await browser.close(); server.kill();
  const failed = results.filter((r) => !r.ok).length;
  await writeFile('screenshots/e2e-report.json', JSON.stringify({ ran: new Date().toISOString(), total: results.length, failed, results }, null, 2));
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
