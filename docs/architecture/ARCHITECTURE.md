# Architecture overview

## Shape
One Node 22 process serves both the JSON API (`/api/*`) and the built React client (`dist/`). It is a **modular monolith** (ADR-S2-01).

```
Browser (React, hash routes)  ──HTTP/JSON──▶  server/app.ts
                                              ├─ http/      router, validation (zod), errors, rate limits, step-up
                                              ├─ modules/*  feature routes (auth, profiles, posts, communities, messages, learn, …)
                                              ├─ policy/    visibility & block rules (single source)
                                              ├─ authz/     roles → permissions, principal, step-up
                                              ├─ governance/ action registry, proposal workflow, Founder AI analysis
                                              ├─ ai/        agent registry, provider interface, Nova safety
                                              ├─ moderation/ cases, snapshots, appeals
                                              ├─ services/  audit log, notifications, rate limiter, clock
                                              ├─ storage/   media (local | Supabase)
                                              └─ db/        Db interface → SQLite (dev/test) | PostgreSQL (prod, PGlite in tests)
```

## Separation of concerns
* **UI** (`src/ui`, `src/pages`, `src/features`) renders; it contains no authorization decisions that matter. Hiding a button is convenience; the server decides.
* **Logic** lives in modules and pure domain/policy code (testable without HTTP).
* **Data** is reached through the `Db` interface; SQL is parameterised; dialect differences are handled in templates and a few helpers.
* **Integrations** (auth, storage, AI) are interfaces with a real adapter and an honest demo/dev adapter. The service container (`config, db, log, auth, storage, ai, rate, now`) is injected, including the clock, so tests control time.

## Request lifecycle
1. Router matches method+path and the route's `auth` mode (`none | session | active | {perm}`).
2. Principal is resolved from the session; `active` additionally requires completed eligibility; `{perm}` checks the role→permission matrix.
3. zod validates path params, query and body. Malformed UUIDs are rejected before reaching PostgreSQL.
4. Rate limits apply per route (per user or per IP). Sensitive routes call `requireStepUp()`.
5. Handler runs; responses use explicit view types (`shared/api/*`), not raw rows, so private columns cannot leak by accident.
6. Errors are mapped to a stable `{ error: { code, message, details? } }` shape; unexpected errors are logged without content and return a generic message.

## Client
Hash routes (`#/path`) defined once in `src/lib/routes.ts` (with navigation groups, tab bar and permission hints). `guardRoute` (pure, unit-tested) decides render / redirect / forbidden; the server enforces independently. Page components are registered in `src/pages/index.tsx`; a test fails if a route has no page. Session, toasts, step-up dialogs and accessibility preferences are small React contexts. Layout: grouped sidebar on desktop, compact top bar plus five-slot tab bar and a "More" sheet on phones.

## Background work
`server/jobs.ts` runs light periodic tasks (expiring sessions and flagged Nova excerpts, purging old Nova history by each person's retention, closing stale grants). No external queue.

## Observability
Structured JSON logs (level via `LOG_LEVEL`); the audit log (append-only) records sensitive actions without message, post or journal content.

## Extending
See `docs/ENGINEERING_CONVENTIONS.md`. New schema = new numbered template. New module = file in `server/modules` listed in `index.ts`. New Universe or specialist = data entries (see their docs).
