# FREEVERSE — Stage 2

A trust-first, modular web platform for adults aged 18–24. Stage 2 turns the Stage 1 prototype into a real client–server application: accounts and age gate, expressive profiles, anonymous and non-anonymous posting with server-side identity protection, moderation, messaging, Nova (the companion) and the nine-specialist **AI Council**, a large Learn / Opportunities / Mentors / Events catalogue, fifteen **identities** with adaptive homes and spaces, a Founder Console with a governed **Founder AI**, and honest status for fifteen **Universes**.

> **Be clear about what is real.** The server, database, authorization, privacy rules, moderation, governance workflow and client are real and tested. The following need **your** external configuration before they are live, and are labelled as demo until then: managed sign-in (Supabase Auth), a production PostgreSQL database, an AI model provider, and cloud media storage. Seeded Learn/Opportunity/Mentor/Event/community/member content is **fictional demo content and is labelled as such** in the app. See *Known limitations* below and `docs/IMPLEMENTATION_REPORT.md`.

## Quick start (local, no external services)

Requires Node 22+.

```bash
npm install
npm start            # builds the client, starts the server at http://127.0.0.1:5173
```

With no configuration the app runs in an honest **local demo mode**: a development sign-in (passwords are **not** checked, and a banner says so), SQLite in `.data/`, files on local disk, and Nova/Council answering with clearly labelled scripted demo replies. SQLite is for development and tests only; the server refuses to start in production without PostgreSQL.

To try the Founder Console locally, set `FOUNDER_EMAIL=you@example.com` and sign up with that email. In dev mode, step-up confirmations ask you to type your account email.

## Deploying (Vercel + Node backend)

Vercel serves the client and a same-origin proxy (`api/[...path].mjs`); the Node backend runs on Render (`render.yaml`) or Docker, with PostgreSQL, Supabase Auth and Supabase Storage. **Follow `docs/DEPLOYMENT.md`**, then run `node scripts/check-deploy.mjs <site-url> <backend-url>`. A summary of the repair and what is verified is in `docs/DEPLOYMENT_REPORT.md`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Server with reload (`tsx watch`). Run `npm run build` once for the client. |
| `npm run build` | Bundles the client to `dist/` (esbuild). |
| `npm start` | Build, then start the server. |
| `npm run typecheck` | `tsc --noEmit` over server, client, shared and tests. |
| `npm test` | Whole test suite (`node:test`), SQLite **and** real PostgreSQL (in-process PGlite). |
| `npm run e2e` | Browser checks with Playwright against a running server (phone/tablet/desktop, keyboard, console errors). |
| `npm run check` | typecheck + test + build. |
| `npm run db:render` | Renders `migrations/src/*.sql.tpl` into `migrations/{postgres,sqlite}`. |
| `npm run db:migrate` | Applies migrations to the configured database. |
| `node scripts/gen-docs.mjs` | Regenerates `docs/api/ROUTES.md` and `docs/SCHEMA.md`. |

Run the browser checks like this (fresh server, because sign-up is rate-limited per IP):

```bash
FOUNDER_EMAIL=tolu@example.test PORT=5199 SQLITE_PATH=/tmp/fv.sqlite npx tsx server/index.ts &
BASE=http://127.0.0.1:5199 npm run e2e
```

## Environment variables

Names and safe placeholders are in `.env.example`. Nothing secret is committed, and **no secret is ever sent to the browser**: the browser bundle contains no keys, and the server reads secrets from its own environment only.

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `HOST`, `PORT`, `PUBLIC_ORIGIN`, `LOG_LEVEL` | Basics. |
| `DATABASE_URL`, `DATABASE_SSL` | PostgreSQL connection. **Required in production.** |
| `SQLITE_PATH` | SQLite file (dev/test only). |
| `AUTH_PROVIDER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Managed auth. Service-role key is server-only. |
| `FOUNDER_EMAIL` | The account with this email receives the Founder role at sign-up. |
| `STORAGE_DRIVER`, `UPLOAD_DIR`, `SUPABASE_STORAGE_BUCKET`, `MEDIA_URL_SECRET` | Media storage. `MEDIA_URL_SECRET` is **required in production**. |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `NOVA_MODEL`, `AI_DAILY_MESSAGE_CAP`, `NOVA_FLAG_RETENTION_DAYS` | AI. With no key, AI runs in labelled demo mode. |
| `ANONYMOUS_POSTING_ENABLED`, `ENABLE_DEV_TOOLS`, `SEED_DEMO_DATA`, `STATIC_DIR` | Behaviour switches. Anonymous posting is **off by default**. |
| `TRUST_PROXY_HOPS`, `PROXY_SHARED_SECRET`, `ALLOW_EPHEMERAL_STORAGE` | Running behind the Vercel proxy. On Vercel also set `BACKEND_URL`. |

## Database setup

* **Development/tests:** nothing to do. SQLite is created and migrated on start.
* **Production:** create a PostgreSQL database (Supabase Postgres or any PostgreSQL 14+), set `DATABASE_URL` (and `DATABASE_SSL=true` if required), then run `npm run db:migrate` (the server also applies pending migrations on start). Row-level security is enabled on every table with no policies, so Supabase's public API roles can read nothing; only the server's role can. The audit log is append-only via triggers.
* Migrations are authored once as templates in `migrations/src/` and rendered per dialect. Add schema with a **new** numbered file; a test fails if rendered files are stale.

## Auth setup (Supabase)

1. Create a Supabase project. Under Authentication, set the site URL to `PUBLIC_ORIGIN` and decide whether email confirmation is required (the app handles both).
2. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` on the **server** only.
3. FREEVERSE never stores passwords and does not implement its own password system. The app maps a Supabase identity to its own user record, then applies the 18–24 gate, authorization and privacy itself.
4. **Not verified against a live Supabase project** in this build (none was available). The adapter is tested against a fake HTTP layer only. Treat first deployment as the verification step.

## Production configuration checklist

* `NODE_ENV=production`, PostgreSQL `DATABASE_URL`, `MEDIA_URL_SECRET` (long random), Supabase auth variables, `PUBLIC_ORIGIN` set to your HTTPS origin, behind a TLS-terminating proxy.
* Leave `SEED_DEMO_DATA` and `ENABLE_DEV_TOOLS` unset (they default to off in production), or the demo catalogue will not be present. Replace demo content with real content before launch.
* Set `FOUNDER_EMAIL` before the Founder signs up.
* Decide an AI provider and set `ANTHROPIC_API_KEY`, or leave Nova/Council clearly labelled as demo.
* Review `docs/IMPLEMENTATION_REPORT.md` → *Decisions for review* and *Not verified* before going live. **This build has not been security-audited or load-tested and is not claimed production-ready.**

## Project layout

```
shared/      constants and wire types used by both server and browser
server/      modular monolith: db, http, auth, authz, policy, modules/*, governance, ai, moderation, storage, seed, jobs
src/         React client (hash routes): app, shell, pages, features, ui, state, api, lib
migrations/  *.sql.tpl templates and rendered postgres/sqlite SQL
test/        server and client-logic tests
scripts/     build, e2e, render-migrations, gen-docs
docs/        architecture, ADRs, schema, API routes, implementation report
public/      brand assets (preserved from Stage 1)
```

## Documentation

* `docs/DEPLOYMENT.md` and `docs/DEPLOYMENT_REPORT.md` — deployment steps and the repair report. Legal drafts: `shared/legal/` (served at `/terms`, `/privacy`, `/rules`; **drafts, need legal review**).
* `docs/IMPLEMENTATION_REPORT.md` — what was built, tested, simulated; conflicts found; decisions for review; exact commands and results.
* `docs/architecture/` — architecture, governance & authorization, Founder Console & Founder AI, AI Council, identities & onboarding, privacy/security/data lifecycle, Universe expansion.
* `docs/adr/` — Stage 2 decisions. `docs/SCHEMA.md`, `docs/api/ROUTES.md` — generated.
* `docs/ENGINEERING_CONVENTIONS.md` — how to add a module.

## Known limitations

* Web only. There are no native apps and no public API.
* Age is **self-declared** (birth month and year, kept private, never called "verified"); 18–24 is enforced server-side. There is no document or third-party age verification.
* Live auth, PostgreSQL, Supabase storage and AI are implemented against their interfaces but **not verified against live services** here.
* Demo content is fictional. Mentor requests are recorded but no real person receives them. Calls, payments, multiplayer, video hosting and AI media generation are *not built*; all 15 Universes have working in-app experiences (see their pages for limits). Original note: their pages say so and offer a private "tell me when this exists" signal.
* No email or push notifications; notifications are in-app only.
* Hash-based URLs; no server-side rendering.
* Feed ordering is plain: recent, a transparent "relevant" (interest overlap, explained per item), and following. There is no engagement-maximising algorithm.
