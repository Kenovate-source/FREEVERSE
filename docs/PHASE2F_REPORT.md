# Phase 2F report: quality assurance (v0.15.0)

## 1. What was done
- A repeatable browser QA script, `scripts/qa2f.mjs`, visits 12 representative pages (Dashboard, Messages, Calls, Profile, Settings, Graduate, Creator and Developer Spaces, FreeConnect, FreePlay, Founder ecosystem, Founder AI) on **phone (390 px) and desktop (1366 px)** in **five conditions**: Full, Less, Off, the operating system's reduced-motion setting, and Full with **WebGL disabled**. That is 120 real page visits. For each it records the active environment, whether pixels actually change between two frames, running animations, console errors, horizontal overflow, whether the heading is in view, and timing.
- It then asserts 26 things (13 per screen size) and saves `screenshots/stage2f/qa-results.json`.
- Comparison sheets of the 12 pages: `screenshots/stage2f/comparison-desktop.png` and `comparison-phone.png`, plus all 24 individual screenshots.

## 2. What QA found and what was fixed
- **Real gap found:** the 15 Universe pages (FreeConnect and FreePlay among them) had no animated environment, only a static hero. Fixed: each Universe now has its own motion scene (`src/environments/envs/universes.ts`): a conversation network, a constellation forming, matching pairs, orbits of thought, a gathering calendar, stacking blocks, a trade exchange, a survey sweep, growing sprouts, a slow breathing circle, compounding bars, a film strip, stage lights, a reaction vessel, and a pixel grid. They are quiet backdrops, and all respect Full, Less and Off.
- Two earlier tests were mis-specified and corrected (the Messages page empty state, a mislabelled tab) in 2E.
- A projects bug class was prevented by tests (non-UUID ids return 404, not a server error).

## 3. Results (actual)
| Check | Result |
|---|---|
| Unit and API tests (`npm test`, SQLite and PostgreSQL) | **544 / 544 pass** |
| Playwright end-to-end (phone, tablet, desktop) | **258 / 258 pass** |
| QA script, 12 pages × 5 conditions × 2 sizes | **26 / 26 pass** |
- Off stops all visible movement on every page, in both sizes. OS reduced-motion behaves like Less. No WebGL: every page still renders with its heading.
- All 12 pages produce a visibly different screen. Every page except the Dashboard and the two Founder pages has its own environment, and no two pages share one (9 of 9 distinct among the pages that have a backdrop; the Dashboard and Founder pages have their own purpose-built animation instead).
- No console errors and no horizontal overflow in any condition.
- Timing, measured in the browser against the local server: the slowest of the 120 page visits was **58 ms** to render after navigation, at most 2 long tasks per page, JavaScript heap about 10 MB. These are client-side figures on a development machine, **not** a deployed or mobile-network measurement.
- Persistence and permissions are covered by the API tests (settings, reminders, mentor review policy, project ownership, moderator-only actions, founder-only announcements) and by e2e steps that reload and check state.

## 4. Implementation matrix (Part 9.1, summarised)
| Area | Existing | Delivered | Notes |
|---|---|---|---|
| Motion architecture | central store, modes | 2A | Full / Less / Off plus OS reduced-motion, WebGL fallback |
| Landing | static | 2A | scene-based storytelling |
| Dashboard and Feed | social feed home | 2B | ecosystem command centre, separate Feed |
| Identity spaces | one template | 2C | 15 distinct layouts and environments |
| Founder ecosystem and AI | tables | 2D | live map, five views, agent console, real meetings and reports |
| Messaging and settings | basic | 2E | 44 settings rows (33 enforced), real notifications, mentoring, projects |
| Universe pages | static hero | 2F | per-Universe motion environments |

## 5. Known limitations (honest)
- **Settings** and the idle **Founder AI** page are deliberately still: Settings is a focus page, and the agent map only animates while a real task is in progress.
- On a phone the Founder ecosystem map is wider than the screen and scrolls sideways; its particles are animated but may be off-screen at rest.
- **Calls** still plays a demonstration lifecycle backdrop although calls are not built (you asked to keep it); the page says plainly that calls are not available.
- No test was run on a real phone, a real GPU, or a deployed site. Nothing here claims the live deployment is verified.
- Timing figures are local only. A real performance budget on Vercel and Render still needs measuring after you deploy.

## 6. Files changed in 2F
`src/environments/envs/universes.ts`, `src/environments/index.ts`, `src/lib/env-map.ts`, `scripts/qa2f.mjs`, `docs/PHASE2F_REPORT.md`, `screenshots/stage2f/*`.

## 7. Database changes
None in 2F. Overall for Phase 2 the new migrations are 0007 to 0019; they still need applying to Supabase.

## 8. Decisions for you
1. Should the Founder AI page have a gentle idle animation, or stay still until real work is happening (current, honest choice)?
2. Do you want a real-device and deployed-site performance pass once the app is live?
