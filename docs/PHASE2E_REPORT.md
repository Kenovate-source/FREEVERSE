# Phase 2E report: Messaging settings and the wider settings audit (v0.15.0)

## Implemented
**Part 7, messaging settings** (`src/pages/settings-messaging.tsx`, `server/modules/messages.ts`, `shared/api/settings.ts`)
- One Messaging settings page with a search box and six groups: Privacy & presence, Message behaviour, Notifications, Appearance, Calls, Security.
- 44 rows. **33 work today and are enforced**; **11 are listed as "In development" with no control** (typing indicator, group adds, forwarding, link previews, media, group notifications, sound and vibration, reminders, calls). The directive listed 49 items; the ones that overlap or can't exist yet are merged or labelled rather than faked.
- Enforced on the server: who can send you requests (everyone / people you follow / nobody), request handling (Allow / Filter / Restrict), Filtered inbox with "not spam", last-active and online visibility, read receipts, default disappearing time, archive behaviour, delete-for-everyone window, replies on/off, reactions on/off, quiet hours (hold back message notifications; messages still wait in Messages), per-conversation mute and archive.
- Client behaviour: reply quoting, reaction picker and chips, link-warning dialog (shortened links, look-alike letters, numbered addresses, no HTTPS), conversation theme, bubble shape, background, text size, spacing, ordering, default view.
- The page states plainly that messages are **not end-to-end encrypted**. No false claims.

**Part 8, wider settings audit**
- Notifications regrouped: Community activity, Announcements and updates, a pointer to Messaging for message notifications (no duplicate toggles), "Always on" safety notices, and a "Not available yet" list (Mentorship, Learning, Opportunities, Events, Projects, Achievements, AI activity, Product announcements) because nothing sends those yet.
- Security: added recovery and age-declaration pointers and an honest "Not available yet" card (device list, two-step verification, Google/Apple/phone sign-in).
- Nova & AI data: added an honest "Not available yet" card (voice, per-topic data permissions, AI notifications).
- Bug found and fixed: the Notifications toggles never worked. The settings stored plural keys (`comments`) and notifications used singular types (`comment`), so switching a toggle off did nothing. `notify.ts` now maps both. The dead "Event updates" toggle was removed from the page (nothing emits it).

## Changed files
`migrations/src/0015_messaging_controls.sql.tpl` (+ rendered sqlite/postgres), `shared/api/settings.ts`, `shared/api/messages.ts`, `server/modules/messages.ts`, `server/modules/privacy.ts`, `server/services/notify.ts`, `src/lib/links.ts`, `src/pages/messages.tsx` (new), `src/pages/inbox.tsx`, `src/pages/settings-messaging.tsx` (new), `src/pages/settings.tsx`, `src/styles.css`, `test/messaging-controls.test.ts`, `test/links.test.ts`, `scripts/e2e.mjs`, `package.json`.

## DB changes
Migration `0015_messaging_controls`: `messages.reply_to_id`, `messages.expires_at`; `conversation_members.archived_at`, `muted`, `filtered`; new table `message_reactions`. Backward compatible. **Apply 0007 to 0015 to Supabase.**

## Tests actually run
- `npm test`: **500/500 pass** (sqlite and PostgreSQL), including 14 new messaging-controls tests and 2 link tests.
- Playwright e2e on phone, tablet and desktop, including a new step covering messaging search, tab switching, a setting that persists after reload, and honest labels on Notifications and Security. Result is in the delivery message.

## Limitations
- Presence is coarse ("Active today") by design.
- Quiet hours use the device time zone saved when you set them.
- Disappearing messages are removed when a conversation is next opened or listed, not by a background job.
- Link warnings are heuristics; they never say a link is safe.
- Calls, groups, typing indicators, forwarding, previews and media are not built, so they have no controls.
- The wider audit relabelled and regrouped Notifications, Security and AI; Privacy and Accessibility were reviewed and left as they are because their controls are real.

## Decisions needing your approval
1. Should safety notices stay permanently on (current), or may members mute them?
2. Do you want Notifications categories for Mentorship, Learning, Opportunities, Events and Projects built next, or kept as labelled placeholders until those areas send alerts?
3. Should disappearing-message cleanup get a scheduled job later?
