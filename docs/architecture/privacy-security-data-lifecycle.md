# Privacy, security boundaries and data lifecycle

## What is enforced where
| Property | Mechanism | Verified by |
|---|---|---|
| 18–24 gate | `/api/me/eligibility` computes age from month+year server-side; `active` routes refuse until complete | foundation tests |
| Age is private, not "verified" | stored month+year; shown only via per-field audience (age range defaults Only me); copy says *self-declared* | tests, UI review |
| Per-field / per-feature audiences | `server/policy/visibility.ts`; omitted not masked | people/content tests (SQLite + PG) |
| Blocking | symmetric invisibility; DMs and follows refused | people tests |
| Anonymous identity protection | author id never serialised; aliases; reveal needs perm + reason + step-up + audit | content tests (incl. scanning responses for the author id) |
| Moderator least privilege | case snapshot only, reason per look, no reporter identity, no unrelated browsing | content tests |
| Journals / goals / habits / Nova chats private | no route returns another user's; no moderator permission reaches them | ai tests, governance tests |
| Step-up for sensitive actions | short-lived grant bound to the user | foundation/governance tests |
| Secrets | server env only; `.env.example` has names only; bundle scanned in review | build output inspection |
| Rate limits | per route, injected clock | tests |

## Not claimed
No penetration test, no formal threat model, no load test, and no verification against live Supabase/PostgreSQL/AI services. Treat these as required before launch.

## Data lifecycle
* **Collect** only what a feature needs. Birth month+year (not day). Email lives with the auth provider and a copy in `auth_identities`.
* **Export** `GET /api/account/export` (step-up): every module's exporter contributes.
* **Delete** `POST /api/account/delete` (typed confirmation + step-up): every module's eraser runs. Retained after deletion, shown to the user before they confirm (`RETAINED_AFTER_DELETION`): messages already sent stay under "Deleted account"; replies by others stay readable; safety reports/cases about others kept without your link; the append-only audit log (content-free); detached Nova safety excerpts until they expire (30 days by default); an anonymous deletion tally.
* **Retention** Nova history per person's choice (30/90/365 days or until deleted); safety-flagged excerpts 30 days (configurable `NOVA_FLAG_RETENTION_DAYS`, disclosed in-app); expired sessions purged.
* **Media** private bucket/dir; served only through signed, expiring `/api/media` URLs; deleted with the account.

## Moderation
Reports create or join a case (category, priority, internal target time: crisis/high/normal/low — goals, not guarantees). Moderators work from a queue showing no content or identities; viewing requires a recorded reason. Actions: dismiss, remove content, warn, suspend, send resources, escalate, resolve, reveal author (restricted). Affected members see what was done and can **appeal**; an appeal is decided by someone other than the moderator who acted, and an overturned action is reversed.
