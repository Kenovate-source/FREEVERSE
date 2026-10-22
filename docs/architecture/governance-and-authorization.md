# Governance and authorization model

## Hierarchy
**Founder → 1 → 3 → 7 → 12 → 24 → Citizens.** Seats are rows (`governance_seats`) with level, number, title, responsibilities and an optional holder. Citizens are every member.

> **Documentation conflict (reported, not silently resolved):** `Governance.md` v2.0 does not define titles or responsibilities for the 7, 12 and 24 levels. They are created as **vacant, generically named seats**; the Founder names them through the governed *seat update* action.

## The core rule
**A governance title is not access to private data.** Four authorities are separate:

| Authority | Examples | Reaches private messages / journals / Nova chats? |
|---|---|---|
| Governance rank | propose appointments, view structure | **Never** |
| Operational | dashboards, community health (counts only) | **Never** |
| Moderation | review a reported item's snapshot, act on cases | Only the reported material of a case, with a written reason, audited |
| Sensitive content | reveal an anonymous author | Only `moderation.reveal_anonymous`, with reason + step-up + audit |

## Roles → permissions
Defined in `server/authz/permissions.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`). Roles: `moderator`, `admin`, `guardian`, `director`, `high_council`, `council`, `founder`. Examples: the Council can *propose* appointments and view audit/security; only the Founder decides proposals, manages governance, runs access reviews and uses Founder AI. The Founder may act as final reviewer on a case but does **not** hold anonymous-author reveal by default.

## Enforcement
* Every route declares its auth mode; permission routes are checked on the server.
* The client mirrors permissions only to decide what to offer (`visibleNav`, `guardRoute`).
* Authorization is validated independently of anything an AI claims: Founder AI's authority is checked by the workflow, not by its request.

## Proposal workflow (`server/governance`)
1. A **proposal** is created from a registered *action type* (`actions.ts`) with a zod-validated payload. The registry fixes the action's risk (`low | medium | high`), whether it is eligible for autonomy, how to execute, how to verify and (if possible) roll back. A requester can't set the risk.
2. **Impact** and **evidence** are recorded. Source: `founder`, `council`, or `founder_ai`.
3. **Decision**: approve / reject / revise with a note. High-risk approvals require a fresh step-up.
4. **Execution** runs in a transaction; **verification** re-reads state and records whether it matches; **rollback** exists for actions that can be undone.
5. Everything is written to `proposal_events` and the append-only audit log.

Registered actions include: appoint / remove / update seat; grant / revoke moderator; revoke grant in access review; flag-retention change; community anonymous allow/forbid; Universe status; constitutional amendment; Founder AI mode and rules; specialist enable/disable; plus low-risk Founder-AI-eligible actions (acknowledge a finding, notify the Founder, run an AI health check).

## Appointments and removals
Council members may **propose** appointments (to seats below the Council); the Founder decides. Appointing grants the seat's role; removing revokes it. A person holding a seat cannot delete their account until they step down (so the structure is never unclear). The Founder account cannot be deleted while it holds the role.

## Access reviews
The Founder starts a review, which snapshots every live grant (except the Founder's own). Each item is marked *keep* or *revoke*; completing the review executes revocations through the workflow and audit log. The overview shows when the last review completed.

## Audit
`audit_events` is append-only (database triggers on PostgreSQL; checked in tests). Entries record who, role, action, target, outcome and reason, **never content**. Readable with `audit.view`.
