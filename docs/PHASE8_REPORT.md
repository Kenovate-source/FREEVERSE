# Phase 8 report: the carried-over items (v0.10.0)

Everything below was run in the sandbox on SQLite and PostgreSQL (PGlite). Nothing was run against live Vercel, Render or Supabase.

## Done
1. **Founder AI workspace.** Tabs: Ask, Findings, Work, Delegate, Prepare a change, Mode and boundaries. *Work* shows every proposal moving through Ask, Plan, Propose, Decide, Execute, Complete. A stage is "done" only when a record backs it (`shared/proposal-lifecycle.ts`, `GET /api/founder-ai/work`). Rejected work shows later stages as skipped, failed runs as failed, recommendations are never "executed".
2. **Poll scheduling and notifications.** Migration 0012. A poll can be scheduled up to 30 days ahead (min 5 minutes, open at least an hour). Scheduled polls are hidden and unvotable until they open. People are told when a poll opens, closes and when the decision is recorded: once each, respecting each person's own "system" notification setting. Small audiences (<=500) are told at once; larger ones and all scheduled/closing notices go out via the maintenance job (runs every 10 minutes, so up to ~10 minutes late). Notices are capped at 2000 recipients per poll.
3. **Founder AI drafts poll wording.** Real only when a model is connected; in demo mode it refuses and says why. Output is validated, never saved, and labelled as AI-written. Tests stub the model, so they prove parsing, refusal and never-saves, not model quality.
4. **Universe administration.** Live "what members will see" preview built from the same code members use; per-Universe change history; rollback. **Bug fixed:** rolling back one Universe change used to restore the whole previous map and could silently undo later changes to other Universes. It now restores only that Universe and refuses (409) if it was changed again since.
5. **Founder phone layout.** Section chips become one scrollable strip (they filled half the first screen), the Ctrl K hint is hidden on touch, and an e2e run signs the Founder in at phone size and checks nine screens for overflow and small tap targets.
6. **Identity labels (section 4.1).** Searchable catalogue (10 categories, 100+ labels, extensible in one file), your own words, three stages (I am / becoming / exploring) that can change with a recorded history, per-label audience, 24 per person. Abusive wording is screened; labels that claim a platform role or impersonate FREEVERSE are refused. Tests prove labels never change roles or open privileged routes.
7. **Home "Right now".** Unread conversations, message requests, unread notifications and earned achievements, computed from your own records. Counts only; never message text.
8. **Real bug fixed:** new members were auto-assigned handles like `member-1a2b3c4d`, which the handle rules reject, so their own profile page said "couldn't find that member". New handles use an underscore; existing hyphenated handles still resolve.

## Tests
- `npm test`: 435/435. `scripts/e2e.mjs`: 232/232 (includes the Founder at phone size). `scripts/e2e-immersive.mjs`: 55/55. Structure check and typecheck clean.

## Not done
- **Google, Apple and phone sign-in.** Needs your OAuth client IDs/secrets and an SMS provider, and cannot be verified without them. Building buttons that don't work would break the "no dead buttons" rule.
- Identity labels are not yet used by recommendations or the guided discovery questions; reporting a custom label goes through reporting the profile.
- No real-device, Lighthouse, axe or screen-reader testing. Nothing verified live.
- Home still has no user-chosen shortcuts (that would need a server-side preference).

## You must do
- Apply migrations 0007 to 0013 to Supabase (0012 and 0013 are new).
- Delete `env.example` (Phase 1 Vercel fix), if not already done.
