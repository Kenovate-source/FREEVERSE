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

## Follow-up requested after review (also in this delivery)
1. **Achievements:** you're notified when you earn one *and* when new ones become available to you (a single notice, with its own switch). Anything that already existed is recorded silently the first time, so nobody is flooded; the first identity is a quiet baseline.
2. **Mentor onboarding (real mentors):** apply with a headline, about text, topics, availability and capacity, and agree to the ground rules. Every text field is screened. A reviewer (Founder or Council, permission `mentors.review`) approves or declines, with a required reason on decline, and **cannot review their own application**. Approved mentors appear in the directory as "Community mentor" next to the clearly labelled demo ones. Requests now reach the mentor (notified), who accepts or declines with a reply; the requester is notified and, on acceptance, gets a link to the mentor's profile to message them under the usual messaging rules. Capacity limits, blocks, duplicate and self-requests are enforced. Editing the headline, about text or topics sends the profile back to review (hidden meanwhile); pausing, availability and capacity are immediate; stepping down closes open requests with a note. All decisions are audited. The directory says FREEVERSE does not verify credentials.
3. **Projects in every Universe (all 15):** a Projects space in each Universe where members start a project (name, summary, who they're looking for, team limit), others ask to join, and the owner accepts or declines. Team members post updates and the team is notified. Owners can set status (looking for people / in progress / completed / archived), remove members or delete; members can leave. Limits: five active projects per owner, team size 2 to 12. Blocks hide projects both ways. Moderators can hide a project with a recorded reason (audited, the owner is told), and members can Report the owner through the existing report flow. FreeBuild's older "Projects" tab of showcase posts is now called "Project showcase"; nothing was removed. Mentorship and Projects notifications are now real, so they've left the "In development" list.

## Changed files (follow-up)
`migrations/src/0017_mentoring.sql.tpl`, `migrations/src/0018_projects.sql.tpl` (+ rendered), `server/modules/mentoring.ts`, `server/modules/projects.ts`, `server/modules/opportunities.ts`, `server/modules/identities.ts`, `server/modules/index.ts`, `server/authz/permissions.ts`, `server/services/alerts.ts`, `server/services/notify.ts`, `server/modules/notifications.ts`, `shared/api/projects.ts`, `shared/api/catalog.ts`, `shared/api/settings.ts`, `shared/universe-spaces.ts`, `src/pages/mentoring.tsx`, `src/pages/projects.tsx`, `src/pages/grow.tsx`, `src/pages/index.tsx`, `src/pages/settings.tsx`, `src/features/universe/tools.tsx`, `src/lib/routes.ts`, `test/mentoring.test.ts`, `test/projects.test.ts`, `test/notification-categories.test.ts`, `scripts/e2e.mjs`.

## DB changes (follow-up)
`0017_mentoring`: mentors gain `user_id`, `review_status`, review fields, `capacity`; mentor requests gain `reply`, `responded_at`. `0018_projects`: `projects`, `project_members`, `project_updates`. **Apply 0007 to 0019 to Supabase.** (0019 edits the allowed report types. On Postgres it replaces two CHECK constraints; on SQLite it edits the schema text.)

## Tests (final)
`npm test`: **544/544** (sqlite and PostgreSQL). e2e: **258/258** on phone, tablet and desktop, including starting a project and posting an update, the mentor application going to review, and the reviewer queue opening.

## Your answers to the last decisions (implemented)
- **Project reports:** a project can now be reported directly (migration `0019_report_projects`). The report opens a moderation case with a snapshot of the project page only, moderators can remove it from the case (the project is hidden and the owner is told), and the owner can appeal; an overturned appeal restores it.
- **Moderators reviewing mentor applications:** Founder and Council always review. The Founder has a switch on the Mentor applications page ("Let moderators review mentor applications"), off by default. Turning it on or off is audited, applies immediately, and nobody else can change it.
- **Existing achievements:** members who already earned some get a notice on their next qualifying action, as you decided. Nothing is marked as seen.

## Limits
- Mentors and project owners are not identity-verified; the pages say so.
- Mentors reply with text only; there is no scheduling or video.
- Hiding a project from a case hides it for everyone except the owner and moderators.

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

## Earlier decisions (now answered)
1. Achievement notices: people who already earned achievements will each get one notice the next time they do something that can earn one. Fine, or should existing ones be marked as already seen?
2. Mentorship notifications need real mentors who can answer requests. Do you want a mentor onboarding flow before that category is built?
3. Projects notifications need a Projects feature first. Which Universe should own it?

## Known limits
- Reminders arrive within about 10 minutes of the scheduled run, not to the minute.
- The Nova cleanup scan reads every member's settings each run; fine at this size, to be indexed when membership grows.
