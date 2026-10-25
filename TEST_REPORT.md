# Test report — immersive release (v0.3.0)

All numbers below come from a **clean extraction of the delivered zip** (Node 22.22, Linux, headless Chromium with software WebGL). Nothing here was run against live Vercel, Render, Supabase, a real PostgreSQL server or a live AI provider.

| # | Check | Result |
|---|---|---|
| 1 | Install from lockfile (`npm ci`) | OK, 0 vulnerabilities reported |
| 2 | `tsc --noEmit` | clean |
| 3 | Production build | OK. `app.js` ≈ 613 kB (178 kB gzip), `immersive.js` ≈ 672 kB (187 kB gzip, loaded lazily), `app.css` ≈ 50 kB (11 kB gzip) |
| 4 | Unit and integration tests (`npm test`) | **296 / 296 pass**, 0 fail |
| 5 | SQLite | covered by the suite (every database test runs on it) |
| 6 | PostgreSQL | covered by the same suite on **in-process PGlite** (real Postgres engine). Not a networked PostgreSQL server |
| 7 | Playwright, existing journeys (`npm run e2e`) | **192 / 192** at phone, tablet, desktop, plus Founder routes |
| 8 | Playwright, immersive (`npm run e2e:immersive`) | **54 / 54**, run twice from the clean copy |
| 9 | Registration and sign-in | in the suites above (API tests and browser sign-up through eligibility and onboarding, with a 37-year-old in the immersive run) |
| 10 | Age tests | `test/policy.test.ts`: an adult over 24 registers and enters, stored as self-declared month and year, never "verified"; under 18 is rejected server-side and nothing about the date is stored; implausible birth years are rejected as typos, not as an age rule. Earlier suites cover the 18 boundary |
| 11 | Anonymous-posting tests | same file: available by default in config and demo communities; an anonymous post with an image is not publicly tied to its author; posts are rate limited and error messages do not leak; new communities allow it and only their moderators can switch it off; the Founder role cannot reveal, reveal needs the moderator permission; the global switch off refuses and creates nothing |
| 12 | All 15 Universe routes | unit test (routes resolve, statuses honest) and browser test (each renders its own hero, distinct artwork, no overflow) |
| 13 | Horizontal and vertical interaction | wheel scroll not default-prevented, `scrollX` stays 0, chapters advance; landing strip scrolls by arrow keys and mouse drag; orbit map scrolls by button, keyboard and drag, a drag does not navigate, a click does |
| 14 | Reduced motion | OS emulation: mode `reduced`, no canvas, `immersive.js` never requested, static SVG art, all reveal elements visible; Settings "Off" disposes a live scene and persists across reload |
| 15 | Keyboard and focus | skip link first and moves focus; 25 consecutive tab stops all show a focus indicator; rail buttons jump; horizontal region does not trap Tab |
| 16 | Mobile / tablet / desktop | no horizontal overflow on landing (all chapters), hub and the fifteen Universes; screenshots in `screenshots/immersive/` |
| 17 | WebGL fallback | `getContext('webgl')` blocked: mode `fallback`, SVG scene follows the chapter, no console errors |
| 18 | Performance and cleanup | resources exist while mounted; hidden tab pauses the loop; leaving the page leaves 0 canvases and no live scene; three remounts do not grow geometry count. **No frame-rate measurement on real hardware** |
| 19 | Vercel function discovery, proxy and health | `npm run check:vercel` runs a real `vercel build`: `functions: proxy.func; /api rewrite routed: true`. 14 deploy/proxy tests incl. end-to-end through the proxy to the real backend |

## Defects found by these tests and fixed
* Phone: the Trust chapter's promise grid made the page 552 px wide in a 390 px viewport (flex item shrink-to-fit).
* Orbit map: native link-drag cancelled mouse dragging when the drag began on a card (now prevented).
* Stale copy: FreeConnect still said anonymous posting was off by default.
* A first version of the pause test read stale state under slow software rendering; it now waits for the loop to notice.

## Not run
Lighthouse, axe or other automated accessibility audits; screen-reader testing; real-device performance; load testing; live-service tests. See `docs/INCOMPLETE_AND_EXTERNAL.md`.
