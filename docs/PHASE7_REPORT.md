# Phase 7 report: living landing and ecosystem motion (v0.9.0)

## Done
- Landing: each chapter has its own entrance (chips assemble, universe list slides, promises wipe, bento rises, bubbles ripple, path line draws), staggered with `--i`. All gated on `data-motion-level="full"`; Less/Off and prefers-reduced-motion show final state immediately.
- App: `src/envs.css` gives each section (`data-env`) its own page entrance; sign-out departs with a short fade (`depart()` in `src/motion/store.ts`).
- e2e step proves Full, Less and Off really differ (app: env-rise / env-fade / none; landing: ch-assemble / none / none).

## Verified (actually run, sandbox, SQLite + PGlite)
- `npm test`: 375/375 pass
- `scripts/e2e.mjs`: 216/216 pass
- `scripts/e2e-immersive.mjs`: 55/55 pass
- `check-structure`: OK; build OK; landing screenshots inspected (end states fully visible)

## Not done / not verified
- No live Vercel/Render/Supabase check; no real-device, GPU, Lighthouse, axe or screen-reader testing.
- No shared-element route transitions; calls/achievements/messaging arrivals have no bespoke motion.
- Scroll-driven path line uses `animation-timeline: view()` with an `@supports` fallback (not tested in all browsers).
- Earlier open items: Founder AI workspace redesign, Universe admin, scheduling, poll notifications, Founder phone layout, external sign-in providers.
- You still need to delete `env.example` and apply migrations 0007-0011.
