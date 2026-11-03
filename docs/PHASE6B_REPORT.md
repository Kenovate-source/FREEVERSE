# Phase 6b report: governance workspace, community oversight, polls, findings (v0.8.1)

## Changed (migration 0011, additive)
- **Position vs access.** A role grant can be *paused* (appointment kept, permissions off immediately) and *restored*, each needing a recorded reason, notifying the holder and written to the audit log. The Founder grant cannot be paused. The permission loader and the moderation reveal-approval checks ignore paused grants. New **Appointments & access** workspace lists every appointment with state (active / paused / removed), who appointed, reasons, and a history of pauses and restores. Appointing/removing seats still goes through the existing approval workflow.
- **Community oversight** (Founder, `config.manage`): restrict (posting and commenting limited to moderators, hidden from discovery; previous settings saved and restored on lift), close (hidden, content kept) and reopen. Reason required, confirmation dialog explains the effect, audited. The communities workspace now also lists closed communities so they can be reopened. A community's own moderator cannot use these.
- **Polls** (tables `gov_polls`, `gov_poll_options`, `gov_poll_votes`): Founder drafts, then publishes with a deadline (1 hour to 60 days); rules can't be edited after publishing. Eligibility is explicit: all citizens, governance members (Council to Guardian roles with access not paused; moderators are not governance), or one community's members. One final vote per person; totals hidden until close; no endpoint reveals individual votes; Founder records the decision and reasons after close; cancel needs a reason. Polls are labelled advisory. Ineligible people get "not found". Member page `/polls`; Founder workspace under the console. Votes are erased/exported with the account.
- **Founder AI findings**: each known finding type now shows why it matters, its limits (including "a change is not a cause"), what evidence it rests on, and concrete next steps that link to the right workspace. Buttons say what they do ("Mark as reviewed (keeps it on record)", "Dismiss (not relevant)"). Findings of unknown type simply show without this block.
- Command bar gained Appointments & access and Polls.

## Tested (actually run)
- `npm test` 375/375 on SQLite and Postgres, incl. `test/oversight-polls.test.ts` (pause takes effect at once, restore, history, Founder grant protected, community restrict/lift restores previous settings, close/reopen, audit, poll drafts invisible, deadline bounds, final votes, hidden tallies, no voter identity in responses, governance-only and community-only eligibility, decision only after close).
- Playwright `e2e.mjs` 215/215 (phone/tablet/desktop members + desktop Founder), including drafting, publishing and voting in a poll, and the appointments and oversight screens; `e2e-immersive.mjs` 55/55; build and structure guard pass.
- Caught and fixed: my first migration reused the table name `poll_votes` (already used by post polls); renamed with a `gov_` prefix before anything shipped.

## Not done (honest)
- Founder AI **workspace redesign** and the ask / plan / propose / execute / complete stage display: not built. Existing Founder AI chat, proposals and delegation are unchanged. No model is connected, so AI-drafted polls and AI coordination remain unavailable.
- Universe administration beyond existing status overrides (preview as a user, rollback of configuration): not built.
- No separate "scheduling a meeting" capability (no calendar infrastructure).
- Poll participation does not notify people; they find polls on `/polls`.
- Founder screens were checked only at desktop width in the browser; not verified on live infrastructure, real devices, axe or screen readers.
