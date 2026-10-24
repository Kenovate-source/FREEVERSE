# FREEVERSE deployment guide

> **Status:** written from the code and tested locally and against fakes. A live Vercel + Render + Supabase deployment was **not** performed from the build environment (it could not reach those services). Treat the first deployment as the verification, using `scripts/check-deploy.mjs` and the manual run-through at the end.

## 1. Architecture

```
Browser ──HTTPS──▶ Vercel  (static client from dist/)
                     │  /api/*  ──▶ api/[...path].mjs  (same-origin proxy function)
                     ▼
                  Render web service  (Node 22 backend: API, rules, media routes)
                     ├──▶ PostgreSQL        (Render managed, or Supabase Postgres)
                     ├──▶ Supabase Auth     (sign-up, sign-in, confirmation, recovery)
                     └──▶ Supabase Storage  (private bucket, served via signed /api/media links)
```

* The browser only ever talks to **its own origin** (Vercel). The proxy forwards `/api/*` to `BACKEND_URL`. So there is **no CORS** to configure and the Content-Security-Policy stays `connect-src 'self'`.
* Private keys (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `MEDIA_URL_SECRET`) exist only on the backend host. The browser bundle contains none.
* `PROXY_SHARED_SECRET` lets the backend trust the visitor IP the proxy forwards, so rate limits are per visitor and not per proxy.

## 2. Why the site said "We couldn't reach the FREEVERSE server"

Vercel was hosting only static files. Nothing answered `/api/*`, so every call (config, sign-up, sign-in) failed and the client showed that banner. Stage 2 fixes the cause, not the banner:

| Cause | Fix |
|---|---|
| No backend and no route for `/api/*` on Vercel | `api/[...path].mjs` proxy + `vercel.json`; backend deployable via `render.yaml` or `Dockerfile` |
| Backend bound to loopback only | `HOST` defaults to `0.0.0.0` in production |
| `tsx`/`esbuild` were dev-only, so a production install could not start | moved to `dependencies`; `engines.node >= 22` |
| All visitors shared the proxy's IP in rate limits | `PROXY_SHARED_SECRET` + `TRUST_PROXY_HOPS` client-IP handling |
| A non-401 error left the client stuck on "loading" | the client now shows the banner with a working **Try again** and recovers |
| A 200 HTML page from a mis-routed `/api` looked like success | the client treats non-JSON 2xx as `bad_gateway` |

## 3. Prerequisites

* GitHub repo containing this project (the zip's contents).
* Accounts: Vercel, Render (or any Docker host), Supabase.
* Node 22 locally if you want to run `npm run check`.

## 4. Supabase (auth + optional Postgres + storage)

1. Create a project. Note **Project URL**, **anon key** and **service_role key** (Settings → API).
2. **Authentication → URL configuration:** Site URL = your Vercel URL (e.g. `https://freeverse-weld.vercel.app`). Add Redirect URL `https://freeverse-weld.vercel.app/**`.
3. **Authentication → Providers → Email:** enabled. Leave "Confirm email" **on** for production (the app handles confirmation: the link returns to the site and signs the member in; recovery links open the "Choose a new password" page).
4. **Storage:** create a **private** bucket named `freeverse-media` (or set `SUPABASE_STORAGE_BUCKET`). Do not make it public: the backend serves files through signed, expiring links.
5. Database: either Render's managed Postgres (`render.yaml` creates it) or Supabase's. If Supabase, copy the **connection string** (use the pooled/transaction string if you see connection limits) into `DATABASE_URL`.

## 5. Backend on Render

1. Render → **New → Blueprint**, pick the repo. It reads `render.yaml` and creates `freeverse-api` and `freeverse-db`.
2. Fill the `sync: false` variables:

| Variable | Value |
|---|---|
| `PUBLIC_ORIGIN` | Your Vercel origin, `https://…` (https is required in production) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from step 4 |
| `FOUNDER_EMAIL` | the email the Founder will sign up with |
| `PROXY_SHARED_SECRET` | a long random string (e.g. `openssl rand -hex 32`); reuse it on Vercel |
| `ANTHROPIC_API_KEY` | optional. Without it Nova and the Council run in clearly labelled demo mode |

   Already set by the blueprint: `NODE_ENV=production`, `DATABASE_URL`, `AUTH_PROVIDER=supabase`, `STORAGE_DRIVER=supabase`, `MEDIA_URL_SECRET` (generated), `TRUST_PROXY_HOPS=1`, `ANONYMOUS_POSTING_ENABLED=false`, `SEED_DEMO_DATA=true`.
3. Deploy. **Migrations run automatically on start**; you can also run `npm run db:migrate`.
4. The server **refuses to start** with a clear message if production config is unsafe (SQLite, missing `DATABASE_URL` or `MEDIA_URL_SECRET`, non-https `PUBLIC_ORIGIN`, dev auth, local disk storage without `ALLOW_EPHEMERAL_STORAGE`). Read the Render log first if a deploy fails.
5. Check `https://YOUR-BACKEND.onrender.com/api/health` → `{"ok":true,…}` and `/api/health/ready` → database `ok`.

**Any other host** (Fly, Railway, a VM): use the `Dockerfile` (`docker build -t freeverse . && docker run -p 8080:8080 --env-file …`) with the same variables, a PostgreSQL database and TLS in front.

## 6. Frontend on Vercel

1. Import the same repo as a **Vercel project**. Framework preset **Other**. `vercel.json` sets: install `npm ci`, build `npm run build:web`, output `dist`, and the `api/` function.
2. Environment variables (Production, and Preview if you use previews):

| Variable | Value |
|---|---|
| `BACKEND_URL` | `https://YOUR-BACKEND.onrender.com` (no trailing slash) |
| `PROXY_SHARED_SECRET` | the same value as on Render |

3. Redeploy so the variables apply. Never add Supabase service-role, database or AI keys on Vercel.

## 7. Verify

```bash
node scripts/check-deploy.mjs https://YOUR-SITE.vercel.app https://YOUR-BACKEND.onrender.com
```

It checks: site serves the app, security headers, site→backend health, database readiness, `/api/config` returns JSON, managed Supabase auth (not the dev provider), `NODE_ENV=production`, PostgreSQL, dev tools off, anonymous posting off, 18–24 self-declared. Then do this once by hand:

1. Sign up with a new email → "check your email" → open the link → you land signed in on **Confirm eligibility**.
2. Enter a date of birth; tick the draft terms; continue → onboarding → Home.
3. Sign out, sign in again; try a wrong password (you should see "Email or password isn't right"); open Home after the session is cleared (you should be sent to sign-in with a "session expired" notice).
4. Sign up with `FOUNDER_EMAIL`; the Founder Console appears under Stewardship.
5. Upload an image in a post; it should preview (confirms Supabase Storage).

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Banner "couldn't reach the server" | `BACKEND_URL` missing/wrong on Vercel, or backend asleep (Render free plan). Open `YOUR-SITE/api/health`. A JSON error naming `backend_unreachable` or `proxy_not_configured` says which. |
| `/api/health` works on Render but not on Vercel | Vercel env vars not applied: redeploy. |
| Backend won't start | Read the log line; it names the missing/unsafe variable. |
| Sign-up says it worked but no email | Supabase email rate limit or SMTP not configured; configure a custom SMTP in Supabase for real use. |
| Confirmation link goes to the wrong site | Supabase Site URL / Redirect URLs not set to the Vercel origin. |
| "Too many attempts" for everyone | `PROXY_SHARED_SECRET` differs between Vercel and Render, so all visitors share one IP. |
| Images vanish after redeploy | Local storage in use; set `STORAGE_DRIVER=supabase` and the Supabase variables. |
| 503 on `/api/health/ready` | `DATABASE_URL` wrong or `DATABASE_SSL` needed. |

## 9. Redeploy and rollback

* Push to the main branch: both Vercel and Render auto-deploy. Migrations are forward-only and run on start. Add schema with a **new** numbered migration template.
* Roll back a bad deploy from each dashboard. A schema change cannot be undone by rolling back code, so back up the database first.

## 10. Launch decisions still open

See `docs/DEPLOYMENT_REPORT.md` → *Outstanding legal placeholders* before turning legal acceptance to "approved", and the anonymous-posting default (off). 
