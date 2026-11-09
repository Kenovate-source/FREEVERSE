# Phase 2C report: identity spaces as environments, pointer styles (v0.13.0)

## Implemented
- **Tab bar**: Feed replaces Learn on phones (as you decided).
- **Fifteen scenes**, one per identity (`src/environments/envs/spaces.ts`), each its own metaphor and motion: student (turning pages and a clock), graduate (staircase with a climbing marker), researcher (citation graph with travelling signals), creator (brush strokes drawing themselves), gamer (hex field with ripples), professional (working lanes), entrepreneur (growth line through stage markers), developer (restrained falling glyphs and a blinking cursor), teacher (chalk arcs and rising ideas), mentor (a spark handed along a path), employer (a hiring funnel), investor (portfolio orbits), organisation (reporting tree with pulses), volunteer (impact ripples), community leader (a gathering). Same engine, modes and fallbacks as Phase 2A: Off draws nothing, Less is calm, one frame when still.
- **Eight space layouts** (`src/features/space-stage.tsx`, `shared/space-design.ts`): studio (creator), pathway (student, graduate), lanes (professional, employer), console (developer, researcher), stages (entrepreneur, investor), arena (gamer), board (teacher, mentor), commons (organisation, volunteer, community leader). Each has its own tool-object form (tilted studio objects, hex tiles, `$` command lines, sticky notes, hub nodes…).
- **Tool objects**: real buttons. Selecting one reveals name, description, status and an Open action; planned tools say plainly "Not built yet". Works by mouse and keyboard.
- **Identity-specific navigation**: each space has its own sections (for example Studio / Tools / Showcase & projects / Milestones / Challenges & community). Identities with no milestones or only a few sections show only those. The `Tools` section is always a plain accessible list of the same tools.
- **Pointer styles** in Settings > Accessibility & appearance: Standard (default), graduate cap, creator pen, creator brush, developer code, entrepreneur arrow. Only the plain arrow is replaced; links, buttons and text fields keep their normal cursors; fine pointers only (no touch), off in forced-colours mode; 32px with a white outline. Saved to the account setting and applied everywhere.
- **Bug fixed along the way**: the settings loader discarded non-boolean accessibility values, so the saved Decorative-motion choice (Phase 7) was lost on reload from the server (only local storage kept it). Fixed for both.

## Tests actually run (sandbox)
- `npm test`: 466 passed (new `test/spaces.test.ts`: all 15 designs valid, at least 7 distinct layouts, each identity has its scene, cursor setting saves/persists/rejects bad values/leaves other settings alone, on sqlite and PGlite).
- `scripts/e2e.mjs`: 241/241 on phone, tablet, desktop (new check: scene mounts, tool objects by mouse and keyboard, planned wording, the plain list matches the objects, section switching, pointer style persists across reload and returns to standard). `e2e-immersive`: 55/55.
- Screenshots reviewed: eight spaces at 1366 wide, four at 390, and the five cursors rendered.

## Not done / limits
- Eight layouts cover fifteen identities, so some identities share a layout family (listed above). Their scenes, palettes, vocabulary, tool objects and sections still differ; further splitting is possible.
- Scenes were reviewed by screenshot for eight of fifteen spaces (the rest share the same engine and are mounted by tests).
- Actual cursor rendering in a real OS pointer was not seen (headless); the cursor images themselves were rendered and inspected.
- Not tested on real devices or live Vercel/Render. No database changes.
- Tools are still the identity definitions; planned ones remain planned.

## Needs your approval
- Whether to split the shared layouts further (for example give mentor and researcher their own).
