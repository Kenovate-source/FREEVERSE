# Phase 2D report: Founder ecosystem and Founder AI visual console (v0.14.0)

## Implemented
**Part 5, Founder ecosystem overview** (`src/pages/founder-ecosystem.tsx`, `src/lib/ecosystem.ts`)
- A living map: you-and-platform core, seven operating areas (Citizens, Communities, Universes, Safety, Governance, Founder AI, Suggestions) on the middle ring, and all 15 Universes as identifiable named nodes on the outer ring.
- Five connection types, each with its own colour and a plain-words meaning in the legend: Citizen activity, Safety and oversight, Decisions and proposals, Universe to Universe, Part of. The legend entries are buttons that show or hide a kind.
- Several moving particles per active link, in different directions (arrows each way where two Universes point to each other), different speeds per kind, pulses on areas that need you, ripples on active Universes. Active and not-available-yet states are drawn differently (filled vs dashed) and spoken in each node's label.
- Hover, keyboard focus and selection dim everything unrelated and brighten the node's own links. Selecting a Universe opens a panel: its status, which Universes it points its members to, which point to it, and what that means if you pause or change it. Zoom in/out/reset, drag to pan when zoomed, selection zooms in. On phones the map scrolls sideways so labels stay readable.
- Beneath it: A) Universe relationship matrix; B) activity and information flow; C) citizen journey funnel; D) shared resources and most-pointed-to Universes; E) ecosystem health with the reason for each state.

**Part 6, Founder AI as a visual console** (`src/pages/founder-agents.tsx`)
- New default tab "Agent map": you in the middle, Founder AI beside you with the "your approval" gate, the Council's specialists around the edge. Select an agent to enter its workspace: role, responsibilities, status in words, assignments with their results, and a form to assign it a task.
- An areas strip with real counts: Findings, Approval requests, Tasks and delegation, Agent activity, Prepare a change, Mode and boundaries. Meetings and Reports are shown as "Not built yet".
- Findings rebuilt as an inbox with a full review page: What happened, Severity, Confidence, Why it matters (with limits), Evidence, Recommended next steps, Other ways to handle it, Expected impact. Accept (records it, changes nothing), Modify (opens a prepared proposal pre-filled from the finding and linked to it) and Reject. Reopen where relevant.
- New "Agent activity" tab reading the append-only audit log.
- Bounded autonomy is structural: nothing here executes anything. Proposals still wait in Decisions.

## Changed
- `server/modules/founder.ts`: overview gains `journey` (real counts); audit filter no longer drops `_` (it was silently turning `founder_ai` into a pattern that matched nothing) and escapes LIKE characters properly.
- `server/modules/founder-ai.ts`: accepting, rejecting or reopening a finding is now written to the audit log.
- `steward.tsx`: eight Founder AI tabs; Proposer accepts a seed from a finding.

## Honest data notes
- Particles prove a relationship exists, and only citizen-link particle count scales with real data (posts and comments in the last 7 days). The map says so on screen. No per-Universe usage is tracked, so none is shown.
- Universe-to-Universe links are each Universe's own "related Universes" list: where members are pointed next, not traffic.
- Finding Confidence is derived from how it was produced (counted fact = High, observation/suggestion = Medium, assumption/forecast = Low) and says so. "Other ways" and "Expected impact" are fixed text written by the team for each finding type, labelled as not model-generated. Findings without guidance show only what exists.
- Demo mode is still stated: no model is connected.

## DB changes
None.

## Tests actually run (sandbox)
- `npm test`: 478 passed (new `test/founder-visual.test.ts`: links match each Universe's related list, one per pair; particle counts follow real activity and are zero with none; inactive Universes have inactive links; matrix equals impact; only citizen links claim to be measured; every finding type has guidance; journey counts never grow down the funnel; finding review audited and members refused; modify path creates a proposal that still waits for approval; sqlite and PGlite).
- `scripts/e2e.mjs` on phone, tablet, desktop, with two new steps (15 Universe nodes, particles present, select a Universe and read its impact, legend hides links, five views present; agent map, assign a task, finding review, accept, activity entry). Results at the foot of this file.
- Screenshots reviewed: Founder overview desktop (full page), selection state, phone map, Founder AI agent map and findings.

## Not done / limits
- Not seen on real devices or live Vercel/Render. Software WebGL only; this phase is SVG.
- SVG particle motion uses SMIL; it is hidden entirely when Motion is Off and slowed with fewer particles at Less.
- Meetings and Reports have no backing feature; shown honestly as not built.
- Specialist workspaces show Council data; Nova appears as one of them because the Council lists it.

## Needs your approval
- None blocking. Optional: whether "Meetings" and "Reports" should become real features later.

## Final results
- `npm test`: 478/478. `scripts/e2e.mjs`: 246/246 across phone, tablet, desktop (including the Founder pages at phone width: no horizontal overflow, tap targets 44px).
- `e2e-immersive` not re-run (landing code untouched this phase).
- Test note: a mouse-coordinate click aimed at an SVG node was flaky inside the browser test, so that step activates the node with a click event. I separately confirmed real mouse down/up on the Universe dots selects them (FreeLearn, FreeWork); a node that is off-screen below the fold naturally can’t be clicked until scrolled into view.
