# Phase 2 report: registration and personal experience (v0.4.1, partial)

Run in the build sandbox: `npm test` 329/329; `scripts/e2e.mjs` 192/192; `check:structure` OK; build OK. Live Vercel/Render/Supabase untested here.

## Done
- **Registration**: Show/Hide password, live requirement checklist (only the rule that is really enforced: 8+ characters), confirm-password field on sign-up only, correct `autocomplete` values.
- **Onboarding**: new "What should we call you?" step (display name, handle with live availability check, optional one-line bio). Photo/avatar and the rest stay finishable later from the profile. `GET /api/handles/check` is rate-limited.
- **Messaging settings**: Enter-to-send (off by default), conversation density; both take effect in conversations. Who can message you stays in Privacy (already server-enforced).
- **Habits**: weekdays, time (stored 24-hour HH:MM, shown AM/PM), time zone, reminders, edit, delete with confirmation. "Today" and "due" are computed on the server in the habit's own time zone. Reminders appear inside FREEVERSE only; push/email is not built. Migration `0007` (adds columns, no data change).
- **Home**: a "Today" card with unread messages, unread notifications and due habits (only for tools switched on).

## Not done yet
Flexible identity taxonomy (custom descriptions, moderation of labels), richer layered avatars, achievements display controls, external sign-in providers (Google/Apple/phone need credentials; shown honestly as unavailable), password-reset UX review, a distinct Home vs Profile split beyond the Today card.
