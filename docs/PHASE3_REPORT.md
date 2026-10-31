# Phase 3 report: Communities and publishing (v0.5.0)

## Changed
- Community settings: join policy (open / approval), who may post, who may comment, links allowed, discoverable, pinned note. Migration 0009 (additive).
- Join requests for approval communities: request, withdraw, moderator approve/decline (decline is final). Leaving withdraws a pending request; erasure deletes requests.
- Discovery filters and sorting (members / active / new, anonymous, open, size). Unlisted communities are hidden from non-members.
- Community health indicators (30-day posts, comments, active posters, new members; moderators also see open reports and pending requests), with the basis stated.
- Publishing: up to 8 images with upload progress, reorder and remove; up to 5 links per post (deduped, host shown). Server enforces policies (`posting_restricted`, `commenting_restricted`, `links_not_allowed`).

## Tested (actually run)
- `npm test`: 342/342 (SQLite and PGlite/Postgres dialects), incl. new `test/communities.test.ts`.
- Playwright `scripts/e2e.mjs`: 195/195 (phone, tablet, desktop), incl. community creation and the image + links composer.
- Playwright `scripts/e2e-immersive.mjs`: 55/55 on rerun (one unrelated desktop Universe-hub navigation timeout on the first run).
- Build and structure guard pass.

## Not done / limits
- Editing a post does not change its attachments.
- No link previews (deliberate: avoids server-side fetching).
- Documents and video are not uploadable; link out instead.
- Not verified on live Vercel/Render/Supabase, real mobile hardware, or with axe/Lighthouse/screen readers.
- Migrations are additive. Apply 0007, 0008, 0009 in order.
