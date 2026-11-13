# Phase 2E report: Messaging settings and the wider settings audit (v0.15.0)

## Implemented
**Part 7, messaging settings** (`src/pages/settings-messaging.tsx`, `server/modules/messages.ts`, `shared/api/settings.ts`)
- One Messaging settings page with a search box and six groups: Privacy & presence, Message behaviour, Notifications, Appearance, Calls, Security.
- 44 rows. **33 work today and are enforced**; **11 are listed as "In development" with no control** (typing indicator, group adds, forwarding, link previews, media, group notifications, sound and vibration, reminders, calls). The directive listed 49 items; the ones that overlap or can't exist yet are merged or labelled rather than faked.
- Enforced on the server: who can send you requests (everyone / people you follow / nobody), request handling (Allow / Filter / Restrict), Filtered inbox with "not spam", last-active and online visibility, read receipts, default disappearing time, archive behaviour, delete-for-everyone window, replies on/off, reactions on/off, quiet hours (hold back message notifications; messages still wait in Messages), per-conversation mute and archive.
- Client behaviour: reply quoting, reaction picker and chips, link-warning dialog (shortened links, look-alike letters, numbered addresses, no HTTPS), conversation theme, bubble shape, background, text size, spacing, ordering, default view.
- The page states plainly that messages are **not end-to-end encrypted**. No false claims.

**Part 8, wider settings audit**
- Notifications rebuilt on your three decisions:
  - **Safety notices stay on by default, with an on/off control.** Turning it off asks for confirmation and explains that the decision still applies and every action stays listed under Help & safety, where appeals are filed. It covers moderation, report updates and appeal outcomes.
  - **New categories are real, each with its own switch:** Event reminders (yes/maybe RSVP, starts within a day), Opportunity deadlines (marked interested, closes within three days), Learning (finished an item), Achievements (newly earned), AI activity (only when Nova's automatic cleanup removes saved chats), Product announcements (the Founder writes them; Founder AI > Reports > Product announcements; audited with the exact words). Each one-off notice is sent once (new `notice_log` table).
  - Still "In development": **Mentorship** (mentors are demo profiles; no real person can answer, so nothing can honestly be sent) and **Projects** (no Projects feature to notify about yet).
  - Message toggles live only under Messaging; Notifications links there.
- **Scheduled cleanup job:** the existing 10-minute maintenance job now also removes expired disappearing messages for everyone (not only when someone opens a chat), runs each person's chosen Nova history cleanup and tells them, and sends the event and deadline reminders.
- Security: added recovery and age-declaration pointers and an honest "Not available yet" card (device list, two-step verification, Google/Apple/phone sign-in).
- Nova & AI data: added an honest "Not available yet" card (voice, per-topic data permissions, AI notifications).
- Bug found and fixed: the Notifications toggles never worked. The settings stored plural keys (`comments`) and notifications used singular types (`comment`), so switching a toggle off did nothing. `notify.ts` now maps both. The dead "Event updates" toggle was removed from the page (nothing emits it).

## Changed files
`migrations/src/0015_messaging_controls.sql.tpl` (+ rendered sqlite/postgres), `shared/api/settings.ts`, `shared/api/messages.ts`, `server/modules/messages.ts`, `server/modules/privacy.ts`, `server/services/notify.ts`, `src/lib/links.ts`, `src/pages/messages.tsx` (new), `src/pages/inbox.tsx`, `src/pages/settings-messaging.tsx` (new), `src/pages/settings.tsx`, `src/styles.css`, `test/messaging-controls.test.ts`, `test/links.test.ts`, `scripts/e2e.mjs`, `package.json`.

## DB changes
Migration `0016_notice_log` (new table `notice_log`, one row per one-off notice already sent). Migration `0015_messaging_controls`: `messages.reply_to_id`, `messages.expires_at`; `conversation_members.archived_at`, `muted`, `filtered`; new table `message_reactions`. Backward compatible. **Apply 0007 to 0016 to Supabase.**

## Tests actually run
- `npm test`: **515/515 pass** (sqlite and PostgreSQL), including 14 messaging-controls tests, 2 link tests and 15 notification-category tests (reminders sent once and only to the right people, safety off/on, announcements founder-only and audited, expired messages and Nova history cleaned by the job).
- Playwright e2e on phone, tablet and desktop, including a new step covering messaging search, tab switching, a setting that persists after reload, and honest labels on Notifications and Security. **254/254 pass**, including safety-toggle confirmation and a founder announcement arriving in Notifications.

## Limitations
- Presence is coarse ("Active today") by design.
- Quiet hours use the device time zone saved when you set them.
- Disappearing messages are removed when a conversation is next opened or listed, not by a background job.
- Link warnings are heuristics; they never say a link is safe.
- Calls, groups, typing indicators, forwarding, previews and media are not built, so they have no controls.
- The wider audit relabelled and regrouped Notifications, Security and AI; Privacy and Accessibility were reviewed and left as they are because their controls are real.

## Decisions needing your approval
1. Achievement notices: people who already earned achievements will each get one notice the next time they do something that can earn one. Fine, or should existing ones be marked as already seen?
2. Mentorship notifications need real mentors who can answer requests. Do you want a mentor onboarding flow before that category is built?
3. Projects notifications need a Projects feature first. Which Universe should own it?

## Known limits
- Reminders arrive within about 10 minutes of the scheduled run, not to the minute.
- The Nova cleanup scan reads every member's settings each run; fine at this size, to be indexed when membership grows.
