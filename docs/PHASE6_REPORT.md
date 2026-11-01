# Phase 6 report: Founder's Console and suggestions (v0.8.0)

## Audit (from the code)
- Console = a row of section chips over cards of metrics and buttons (the model the owner rejected). Real data underneath: overview metrics, findings, proposals/decisions, access reviews (fixed in Phase 1), audit log, communities, Universe overrides, delegation.
- Suggestions (§18): **did not exist** (only unrelated profile/identity suggestions).

## Changed
- **Suggestions system** (migration 0010, additive): citizens submit title, description, topic, optional area and extra detail; private to the author; statuses submitted / under review / planned / in progress / completed / declined / merged with a plain explanation of each; reviewers add a public note (shown to the author, with a notification) and a separate internal note; decline requires a public reason; merge validates its target; every change audited; author can withdraw; included in data export and erased with the account; 10 per day limit.
  - Access: authors see only their own. New permission `suggestions.view` (directors and above; read-only, **no author identity, no internal notes**) and `suggestions.review` (Founder only). Possible duplicates are hinted by shared words and labelled as not AI.
- **Console home redesigned** (`src/pages/founder-console.tsx`): an interactive ecosystem map (Citizens, Communities, Universes, Safety, Governance, Founder AI, Suggestions) where each part shows a live figure and a level (Calm / Worth a look / Needs you) that always has text, a dashed/solid border and a stated rule, a context layer that opens on selection with real figures and the next actions, a "Needs you" queue, a real activity timeline from the audit log, and a persistent command bar (Ctrl/⌘+K, "/" outside fields). Motion only under full decorative motion; none under reduced/off. Existing workspaces are unchanged and reachable from the map and the command bar.
- Founder suggestions workspace (`/founder/suggestions`).
- Member page `/suggestions`, linked from the sidebar and More menu.

## Tested (actually run)
- `npm test` 367/367 (SQLite and Postgres), incl. `test/suggestions.test.ts` (validation, privacy, view-only vs review, internal notes never reach the author, decline reason, merge rules, audit, notification, rate limit).
- Playwright `e2e.mjs` 209/209: member sends a suggestion; Founder opens the map, selects Safety, uses Ctrl+K, reaches the queue. `e2e-immersive.mjs` 55/55. Build and structure guard pass. Desktop screenshot reviewed.

## Not done in this phase (honest)
- Founder AI workspace redesign, findings detail/investigation view and the ask/plan/propose/execute/complete separation: **not changed** (existing Founder AI cards remain; no new numbers or codes were introduced).
- Governance workspace (restrict/restore access without removing an appointment, appointment history view, polls and voting with eligibility rules): **not built**. Existing appointment/removal/proposal flows are unchanged and server-authorised.
- Universe administration beyond the existing status overrides, and community oversight actions (restrict, suspend, moderator appointment from the console): **not built**; the Communities workspace is unchanged.
- Directors can read the suggestions queue through the API but there is no director-facing screen (the console is Founder-only).
- Phone layout of the Founder console was not visually checked (the e2e Founder run is desktop only); the grid is written to collapse under 900px.
- Not verified on live infrastructure, real devices, axe or screen readers.
