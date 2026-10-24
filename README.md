# Stage 2 Architecture Decision Records

Stage 2 decisions, numbered after the project's original ADR set (ADR-001…ADR-009 in the source documentation). Each is short: context, decision, consequences. Status is *Accepted* unless noted. Open items are listed in `docs/IMPLEMENTATION_REPORT.md`.

## ADR-S2-01 — Modular monolith, one deployable
**Context.** A solo-founder team needs one thing to run, test and secure. **Decision.** One Node process; feature modules (`server/modules/*`) registered on a small router; shared policy code. **Consequences.** Simple operations; module boundaries are conventions enforced by review and tests, not by the network.

## ADR-S2-02 — PostgreSQL in production, SQLite for development and tests only
**Decision.** A persistence abstraction (`server/db`) with two adapters. Schema is written once as `.sql.tpl` templates and rendered per dialect. Tests run on SQLite **and** on real PostgreSQL in-process (PGlite) so dialect differences are caught. The server refuses to start in production without `DATABASE_URL`. **Consequences.** Templates must avoid dialect-specific features outside the marked blocks; known traps (uuid vs text comparisons, JSON columns and LIKE) are covered by tests.

## ADR-S2-03 — Managed authentication; no homemade passwords
**Decision.** Supabase Auth is the production identity provider; FREEVERSE keeps its own `users` row, eligibility, roles and privacy. A local development provider exists for honest demo mode, is labelled in the UI, and is refused in production. **Consequences.** Live auth is unverified until credentials exist (see report).

## ADR-S2-04 — Age: self-attested month and year, 18–24 enforced on the server
**Decision.** Store birth month and year only; the day is used for the check and discarded. Enforce 18–24 server-side. Never call it "verified"; age range is private by default. The Founder account has a recorded exemption from the upper bound. **Consequences.** Determined under-age or over-age users can lie; this is disclosed.

## ADR-S2-05 — Authorization is permission-based and server-side; titles are not data access
**Decision.** Roles map to named permissions (`server/authz`). Governance rank, operations, moderation and private-content access are separate. No role can read private messages, journals or Nova conversations. Sensitive actions require a short-lived step-up grant and are audited. **Consequences.** The UI hides what you can't do, but the server decides.

## ADR-S2-06 — Visibility enforced in one policy module
**Decision.** Audiences (Everyone / Members / Connections / Only me) per field and per feature are resolved by `server/policy/visibility.ts` (SQL fragments and helpers). Fields a viewer may not see are **omitted**, never sent as placeholders. Blocks make both parties invisible to each other.

## ADR-S2-07 — Anonymous posting: alias to everyone, author stored but never serialised
**Decision.** Anonymous content is allowed only in communities that enable it. The real author id is stored for safety and never leaves the server in any response, notification or search result. Reveal requires `moderation.reveal_anonymous`, a written reason, step-up, and writes an audit entry; the Founder does not hold it by default. Authors of anonymous posts reply anonymously. **Consequences.** The platform can identify authors under process; this is disclosed in the UI and Help.

## ADR-S2-08 — Governance changes go through a proposal workflow
**Decision.** Every governance, role, privacy, constitutional and AI-boundary change is a *proposal* with registry-defined risk, impact, events, execution, verification and (where defined) rollback. High-risk actions always need explicit approval and fresh confirmation. The AI cannot declare its own risk level.

## ADR-S2-09 — Founder AI is separate from the nine specialists, with three modes
**Decision.** Advisory (no execution), Approval Required (default), Bounded Autonomy (only founder-configured, routine, low-risk actions with daily caps). High-impact actions need explicit approval in **every** mode. Mode and rule changes are authenticated, recorded and themselves high-risk. Findings are labelled verified fact / observation / assumption / forecast / suggestion. With no model connected it computes answers from aggregate facts and says so.

## ADR-S2-10 — AI Council as a registry with honest capability states
**Decision.** Nine specialists defined as data (name, responsibilities, tool permissions, capability list) behind a provider interface. States are `unavailable`, `available`, `configured`, `operational`, `demo`; the UI shows exactly the state. Routing is rule-based and explainable. Specialists advise; they never take actions on a person's behalf.

## ADR-S2-11 — Nova data: opt-in private tools, retention, safety flags
**Decision.** Journal, goals and habits are off by default, private, never auto-published, and not readable by moderators or governance. Conversation history is optional and retention-bound. Safety-flagged excerpts are kept 30 days by default (configurable, disclosed) and detached from identity; the UI does not promise complete deletion of those excerpts inside that window.

## ADR-S2-12 — Account deletion and what remains
**Decision.** Every module registers an eraser and an exporter. Deleting an account removes personal content; messages sent to others stay under a neutral "Deleted account" identity; closed moderation cases lose copied content; the append-only audit log keeps content-free records. The list shown to the user is generated from the same source as the behaviour.

## ADR-S2-13 — Honest catalogue: demo content is flagged in data and in the UI
**Decision.** All seeded Learn, Opportunity, Mentor, Event, community and member rows carry `is_demo`; pages show a notice. Mentor requests are recorded without pretending a real person was contacted. Unbuilt features say so and offer a private interest signal, not a pre-order.

## ADR-S2-14 — Identities: many per account, self-declared unless the platform recorded it
**Decision.** Fifteen archetypes; any number may be active per account and can be paused or removed without affecting the account or entries. Entries are `self_declared` unless created from platform records; suggestions come only from platform records, are never auto-applied, and start `only_me`. Onboarding answers are never shown to other viewers.

## ADR-S2-15 — Web client: React, hash routes, no client-side secrets
**Decision.** React 19 bundled by esbuild into one script; hash URLs (retained from Stage 1) so static hosting and file previews work; all data via `/api`; session token in browser storage only; accessibility preferences applied as data attributes.
