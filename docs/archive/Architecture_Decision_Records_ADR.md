# Architecture Decision Records (ADR)

Project: FREEVERSE

## Purpose

Each ADR records a significant technical decision, the alternatives considered, and why the chosen option won. New ADRs are added, not edited retroactively.

## Included ADRs

* ADR-001 Modular Monolith over Microservices
* ADR-002 PostgreSQL as Primary Datastore
* ADR-003 Managed Authentication Provider
* ADR-004 Third-Party SDK for Voice/Video Calling
* ADR-005 Transport + At-Rest Encryption for v1 Messaging
* ADR-006 API-Based LLM for Nova
* ADR-007 Chronological Feed
* ADR-008 Search as a Platform Capability
* ADR-009 Frontend Stack: TypeScript, React 19, esbuild

Refer to the detailed project documentation for the complete text of each ADR.

# Architecture Decision Records (ADR)

Project: FREEVERSE

Document: Architecture Decision Records

Version: 1.2

Status: Active — ADR-009 added.

Owner: Toluwanimi John

Last Updated: October 17, 2026

## Purpose

Each ADR records a significant technical decision, the alternatives considered, and why the chosen option won. New ADRs are added, not edited retroactively — if a decision changes later, that's a new ADR that supersedes an old one, so the history of *why* stays intact.

---

### ADR-001: Modular Monolith over Microservices

**Context:** The original Universe concept implies independently deployable modules. Microservices are the "obvious" technical mapping.

**Decision:** Single deployable backend, internally modularized to match the Universes, not physically separated services.

**Alternatives considered:** Full microservices per Universe — rejected. Microservices solve problems FREEVERSE doesn't have yet (independent team ownership at scale, independent scaling needs per module) and introduce problems it can't afford yet (distributed system complexity, inter-service auth, operational overhead for a small team).

**Consequences:** Faster to build and operate now; migration path to extract a module later exists but isn't free — acceptable trade given current stage.

---

### ADR-002: PostgreSQL as Primary Datastore

**Context:** Need a primary database for relational data spanning users, content, messaging metadata, and moderation records.

**Decision:** PostgreSQL.

**Alternatives considered:** MongoDB/document store — rejected; most of FREEVERSE's data (users, relationships, reports tied to specific content) is genuinely relational, and Postgres's JSON column support covers the cases that aren't, without giving up relational integrity elsewhere. A multi-database-per-module approach (matching "don't depend on one database technology" from the original Technical Architecture doc) was also rejected as premature — one well-understood database is easier for a small team to operate correctly than several.

**Consequences:** Strong consistency guarantees where they matter (financial/moderation records, later payments); a single operational skill set for the team to maintain.

---

### ADR-003: Managed Authentication Provider

**Context:** Authentication is security-critical and easy to get subtly wrong.

**Decision:** Use a managed auth provider rather than building authentication in-house.

**Alternatives considered:** Custom auth — rejected. This is a solved problem where the cost of a mistake (a security breach) vastly outweighs the cost of a subscription fee, and building it well (password hashing, session management, MFA, breach detection) is real, ongoing security work that distracts from what's actually differentiated about FREEVERSE.

**Consequences:** Small recurring cost and a dependency on a third party for a critical path; judged worth it given the risk reduction.

---

### ADR-004: Third-Party SDK for Voice/Video Calling

**Context:** v1 requires voice and video calls (founder decision, see PRD).

**Decision:** Use a mature third-party communications SDK rather than building calling infrastructure in-house.

**Alternatives considered:** Custom WebRTC infrastructure — rejected outright; this is a multi-month-minimum undertaking (TURN/STUN infra, signaling, call quality adaptation) that no comparable-stage company builds from scratch. Specific vendor selection (e.g., Agora, Twilio Video, Daily, LiveKit) is a follow-up decision for the engineering team based on cost, reliability, and how cleanly it can sit behind FREEVERSE's own interfaces — not resolved in this ADR, deliberately, since it should be evaluated closer to implementation with current vendor pricing/terms.

**Consequences:** Fast to implement; ongoing vendor cost that scales with call volume/minutes — needs its own cost model before launch, similar to Nova's.

---

### ADR-005: Transport + At-Rest Encryption over End-to-End Encryption for v1 Messaging

**Context:** Founder initially requested E2E encryption for messaging; revised after discussion of true cost and its conflict with content moderation.

**Decision:** v1 uses TLS in transit and encryption at rest. True E2E is deferred, with the data model designed to allow it later without a schema rewrite.

**Alternatives considered:** True E2E now — rejected for v1 given the realistic engineering timeline (this alone could push launch by many months) and because it would remove FREEVERSE's ability to review reported message content, directly undermining the Trust & Safety Policy's message-reporting mechanism at a stage when the platform most needs that capability (small, unproven user base, unproven moderation processes).

**Consequences:** FREEVERSE can act on reported message content in v1 (a real safety benefit); the platform holds a higher trust obligation around message confidentiality than a fully E2E product would, and must be honest about this distinction with users rather than overclaiming "end-to-end encrypted" marketing language it doesn't yet deliver.

---

### ADR-006: API-Based LLM over Self-Hosted Model for Nova

**Context:** Nova needs a capable, safety-aware conversational model.

**Decision:** Use an external LLM API rather than hosting/fine-tuning a model in-house.

**Alternatives considered:** Self-hosted open-source model — rejected for v1; requires ML infrastructure and safety-tuning expertise that would be a significant, ongoing hire/build investment better spent on what's differentiated about FREEVERSE itself. Revisit if usage scale and cost economics justify it later.

**Consequences:** Usage-based cost that scales with adoption (needs monitoring, per AI Architecture); dependency on a third-party provider's uptime and pricing.

---

### ADR-007: Chronological Feed over Algorithmic Ranking (v1)

**Context:** Community feed ordering is a foundational product decision with real trust implications.

**Decision:** Chronological ordering for v1, no engagement-optimized ranking algorithm.

**Alternatives considered:** Algorithmic/engagement-based ranking — rejected for v1, both because it's real additional engineering work with unclear payoff pre-launch, and because it more directly conflicts with the Constitution's explicit rejection of engagement-maximizing design than most other features on the roadmap. Worth revisiting deliberately later, but as a conscious trade-off discussion, not a default.

**Consequences:** Simpler to build and fully transparent to users; may reduce content discovery efficiency compared to competitors — an acceptable trade given FREEVERSE's positioning.

---

### ADR-008: Search as a Platform Capability, PostgreSQL-Backed Behind a Provider Interface

**Status:** Accepted. Placement of search in Platform Core was directed by the founder; the v1 implementation choice (PostgreSQL full-text search) is the CTO recommendation and remains open to challenge. This ADR supersedes no earlier ADR. It corrects the placement of search in System Architecture v1.0, which had implied search belonged to individual modules.

**Context:** The PRD already requires search in three places: Community (users, posts, hashtags), the Learning Hub, and Admin user management. The roadmap adds Opportunities, the Mentor Directory, Events, and later Universes, all of which will need to be searchable, and the founder's intent is cross-Universe search. Search is also a safety-relevant surface, not just a convenience. Done carelessly it can show people to users who have blocked them, resurface content a moderator removed, make bulk enumeration or stalking of users easier, or index content the platform has committed never to read (messages, Nova conversations). Those risks are only manageable if the rules live in one place rather than being re-implemented by every module.

**Decision:**

1. Search is a Platform Core capability, owned by no single Universe. Modules never query each other's tables in order to search. They publish searchable documents to Search through an interface, and Search owns the index and the query layer.
2. The v1 implementation is PostgreSQL full-text search (tsvector with GIN indexes), plus trigram matching (pg_trgm) for typo-tolerant people and hashtag lookup, in the same database as everything else per ADR-002. It is reached only through a `SearchProvider` interface, so a dedicated engine can replace it later without any module changing.
3. Modules take part through a `Searchable` contract. On create, update, removal, or any moderation-state change, a module publishes a normalized search document: document type, searchable text, tags, owner, visibility, moderation state, and timestamps. Where possible the index write happens in the same database transaction as the change to the source record, so a removal or suspension can never leave a stale searchable copy behind.
4. Indexable document types are an explicit allowlist. Only registered types can be indexed. Messaging content, Nova conversations, crisis and escalation records, and moderation reports are not registered and must never be. This is a hard constraint, enforced by an automated test that fails the build if a prohibited type is ever registered.
5. Visibility is enforced at query time as well as index time, using current state. Results exclude content from users who have blocked or been blocked by the searcher, from suspended, banned, or deactivated accounts, content that has been removed or is pending deletion, and anything outside the searcher's permitted visibility.
6. Ranking uses text relevance and recency only. No engagement signals (likes, follower counts, click-throughs) are used in v1. This follows ADR-007 and the Constitution. Introducing engagement-based ranking into search requires a new ADR that supersedes this one. Global search returns results grouped by type (people, posts, learning, opportunities, mentors, events) rather than one blended list, because relevance scores from different content types are not comparable, and grouped results are easier for users to understand.
7. Admin search is a separate, role-gated scope on the same capability. It can see suspended accounts, and staff searches over user records are audit-logged.
8. People search matches display name and handle only, never email, date of birth, or other contact details, and is rate-limited to make bulk enumeration and targeted look-ups harder.
9. The index is a derived store, rebuildable from the source modules, and is never a system of record. A periodic reconciliation job compares the index to its sources and corrects drift. Search query logs, if kept at all, are treated as personal data and governed by the Retention Policy Engine under their own content type, with minimal retention as the default and the actual duration set by Legal.

**Alternatives considered:**

- Per-module search (the original shape): rejected. Cross-Universe search later would mean retrofitting a federation layer across several independently built implementations, and every module would have to remember the exclusion and visibility rules on its own.
- Dedicated search engine now (Elasticsearch/OpenSearch, Typesense, Meilisearch): rejected for v1. It adds a second datastore for a small team to operate, and, more importantly, it introduces sync lag. A post a moderator has removed could stay searchable until the sync catches up, which is a safety problem and not just an inconvenience. Revisit when the triggers below are met.
- Hosted search service (e.g., Algolia): rejected for v1. It sends user-generated content to another data processor, widening the privacy and compliance surface in a way that sits badly with the Constitution's trust posture, and it has the same sync-lag problem.
- Federated query over the modules' own tables (search reads each module's tables directly): rejected. This is the cross-module table reach-through that ADR-001's boundary discipline prohibits, and it would couple every module's schema changes to search.

**Consequences:** There is one place to enforce exclusions, visibility rules, and ranking policy, and adding a new Universe to search means implementing the `Searchable` contract, not building a sixth search system. Because the index lives in the primary database, moderation actions take effect in search immediately, and no new infrastructure is needed at launch. The trade-offs are real: PostgreSQL full-text search has weaker relevance tuning, typo tolerance, and faceting than a dedicated engine; index writes add load to the primary database; a single unified index can grow large (plan to partition by document type and move reads to a replica when needed); and every module carries a small mandatory obligation to publish its changes correctly, mitigated by contract tests and the reconciliation job.

**Revisit triggers (event-based, not date-based):** sustained search latency above target, relevance problems that tuning cannot fix, index size or write load that degrades primary database performance, or a need for languages or features that PostgreSQL text search handles poorly. Moving to a dedicated engine would be a new ADR that supersedes the implementation choice only. Placement in Platform Core and rules 3 to 9 above would carry over unchanged.

**Open question for the AI Architecture document:** the Nova Safety Specification says Nova helps users discover opportunities on the platform. Recommendation: Nova may query Search only for admin-curated document types (Learning, Opportunities, Events, Mentor Directory) and never for user-generated or private content. This is flagged here and should be decided formally in the AI Architecture document, not assumed.

---

### ADR-009: Frontend Stack: TypeScript, React 19, esbuild, Mock-First Data Boundary

**Status:** Accepted (founder directed TypeScript, React 19 and esbuild for Stage 1; the remaining choices below are CTO decisions open to challenge).

**Context:** Stage 1 must produce a locally launchable app with no backend, in an environment where only package registries are reachable. The UI must later swap mock data for the real modular-monolith API (ADR-001) without being rewritten.

**Decision:**

1. TypeScript (strict, noUncheckedIndexedAccess) and React 19, bundled by esbuild into a single script that also runs from a `file://` URL. No framework with a server runtime in Stage 1.
2. Hash-based routing (`#/home`), because it works from `file://` and any static host with no server rewrite rules. Revisit when real deployment (Stage 7) needs clean URLs or server-rendered pages.
3. All data access goes through one `Api` interface (`src/data/api.ts`). Stage 1 implements it with fictional mock data and browser storage. Later stages implement the same interface over HTTP; components never import mock data directly.
4. Authentication, age attestation and storage sit behind small boundaries (`mockAuth`, a guarded `KV`). The attestation is stored as `{method, status, attestedAt}` so stronger verification can replace self-attestation later without a data-shape change. Passwords are never stored. Real authentication remains ADR-003.
5. Every mocked surface is visibly labelled in the UI, and a Demo controls panel can force loading, empty and error states so those states are testable.
6. Verification: `tsc --noEmit`, `node --test` unit tests, and Playwright end-to-end tests with screenshots against the production build.

**Alternatives considered:** Next.js or Remix (rejected for Stage 1: server runtime and routing conventions we do not need yet, and no `file://` launch). Vite (reasonable; esbuild was the founder's direction and is sufficient). Client-side state libraries (rejected: React context plus a small async hook covers Stage 1).

**Consequences:** Very small toolchain, fast builds, and offline-launchable output. Costs: no SSR or SEO (acceptable for a signed-in product, not for public marketing pages), hash URLs, and hand-rolled routing and design-system code that must stay tested. Real accessibility auditing is still required beyond the automated checks.

---

## Related Documents

- System Architecture (v1.1 updated to place Search in Platform Core), Database Schema, API Specification, AI Architecture (the documents these decisions produced)
- PRD, Constitution (the requirements and values these decisions were evaluated against)

## Changelog

| Version | Date | Change | Owner |
|---|---|---|---|
| 1.0 | August 5, 2026 | Initial ADR set covering the seven major decisions made across the Architecture documentation phase. | Toluwanimi John / Claude |
| 1.1 | October 15, 2026 | Added ADR-008 (Search as a Platform Capability). No change to ADR-001 through ADR-007 wording; formatting-only cleanup of export artifacts (escaped characters, spacing, table rendering). | Toluwanimi John / Claude |
| 1.2 | October 17, 2026 | Added ADR-009 (Frontend stack for Stage 1). No change to ADR-001 through ADR-008. | Toluwanimi John / Claude |

## Status

Active — new ADRs should be appended here as future significant decisions are made, not folded into existing entries
