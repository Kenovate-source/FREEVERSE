# Phase 2B report: Dashboard as command centre, separate Feed (v0.12.0)

## Implemented
- **Feed is its own destination** at `/feed` (nav item "Feed"; composer, Recent/Relevant/Following). Post back-links now go to the Feed.
- **Home is now the Dashboard** (`src/pages/dashboard.tsx`), no feed or composer on it:
  - Welcome area with identities and links to the Feed and identity choice.
  - **Ecosystem map**: You, your identities, and the Universes those identities are really defined to connect to (`ARCHETYPE_DEFS[].universes`). Lines are those real relationships. Every node is a link, keyboard-focusable, with an accessible label; hover/focus highlights related paths. Flow animation follows the motion level (full fast, less slow, off none). Empty state when no identity is chosen.
  - Panels: Today and Right now (counts only), Continue where you left off, Progress and milestones, Goals and projects, Coming up (events, mentor requests), Recommended (catalogue items not yet started or tracked, labelled Sample where demo, and stated as not personalised), Recent messages (names and unread counts only, never text), Quick access, Next steps, plus the remaining identity widgets. Panels expand/collapse.
  - **Continue** uses real in-progress learning; "last visited" and **Quick access** use per-device visit memory in localStorage only (`src/lib/visits.ts`), never sent anywhere.
- API: `/api/home` gains `ecosystem` and `recommended` (read-only queries). No migration.

## Tests actually run (sandbox)
- `npm test`: 445 passed before the new test file; new `test/dashboard.test.ts` 8 passed (sqlite and PGlite): empty map for no identity, map equals the defined Universes, `via` correct, started items excluded, sample labelling.
- `scripts/e2e.mjs`: 238/238 on phone, tablet, desktop (new check: no feed/composer on Dashboard, sections present, map nodes have destinations, keyboard Enter opens a Universe, Open the Feed works; the post test now uses the Feed page).
- Screenshots reviewed at 1366 and 390 wide.

## Not done / limits
- Recommendations are "not yet started" items, not personalised ranking. No fake progress is shown.
- Events and mentorship appear only when the person has RSVPs or requests. Projects appear only via the existing widgets.
- On phone the Feed is reached from the Dashboard button or More menu, not the 4-item tab bar.
- Tested at three widths with one to three identities; not on live Vercel/Render.
- Renamed my map CSS to `dmap-*` after a collision with the existing Universe map `.eco-*` styles.

## Needs your approval
- Whether Feed should replace a tab-bar slot on phones.
