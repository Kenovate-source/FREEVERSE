# Phase 2 report: registration and personal experience (v0.4.3, complete)

Run in the build sandbox: `npm test` 329/329; `scripts/e2e.mjs` 192/192; `check:structure` OK; build OK. Live Vercel/Render/Supabase untested here.

## Done
- **Registration**: Show/Hide password, live requirement checklist (only the rule that is really enforced: 8+ characters), confirm-password field on sign-up only, correct `autocomplete` values.
- **Onboarding**: new "What should we call you?" step (display name, handle with live availability check, optional one-line bio). Photo/avatar and the rest stay finishable later from the profile. `GET /api/handles/check` is rate-limited.
- **Messaging settings**: Enter-to-send (off by default), conversation density; both take effect in conversations. Who can message you stays in Privacy (already server-enforced).
- **Habits**: weekdays, time (stored 24-hour HH:MM, shown AM/PM), time zone, reminders, edit, delete with confirmation. "Today" and "due" are computed on the server in the habit's own time zone. Reminders appear inside FREEVERSE only; push/email is not built. Migration `0007` (adds columns, no data change).
- **Home**: a "Today" card with unread messages, unread notifications and due habits (only for tools switched on).

- **Achievements**: each earned milestone can be shown or hidden on your profile (`PUT /api/me/achievements/:id/display`; migration `0008`). Hiding never deletes the record; unearned ones can't be shown; they are labelled "Recorded by FREEVERSE", not verified credentials. Tests: `npm test` now 331/331.

- **Identity labels**: custom interests/aspirations, headlines (profile and identity) and display names/handles are screened server-side for clear abuse (`shared/label-screen.ts`: handles spacing, leetspeak, repeated letters; whole-word matching so words like "retardant" or "Scunthorpe" pass). The person is told why. It is a conservative first line, not full moderation; reports and moderator hiding still apply. Identity is descriptive only and grants no authority.
- **Avatars**: two new layers (Brows, Pattern) on top of palette/shape/eyes/mouth/extra. Existing avatars are unchanged (new layers default to none). Photo / avatar / both is honoured everywhere (see Phase 1).
- **Sign-in methods**: the sign-in and sign-up pages say plainly that email and password is the only method today; Google, Apple and phone are not available (no dead buttons).
- **Milestones on profiles**: a member's chosen milestones appear on their profile, labelled recorded-by-FREEVERSE.

Tests: `npm test` 334/334; browser checks 192/192; build and structure check OK.

## Still open (not Phase 2 blockers)
- Google/Apple/phone sign-in: need external credentials; phone also needs paid SMS.
- Real age verification does not exist; age remains self-declared and is labelled so.
- Password reset keeps a single new-password field (confirm is registration only, as specified).
