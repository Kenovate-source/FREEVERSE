# FREEVERSE Stage 2 — Deployment Repair Report (v0.2.1)

Date: 2026-10-24. Read with `docs/DEPLOYMENT.md` (the step-by-step guide).

## 1. Root cause
Vercel served only the static client. There was no backend and no route for `/api/*`, so `/api/config`, sign-up and sign-in never reached a server, and the client showed "We couldn't reach the FREEVERSE server." The banner was telling the truth. Compounding problems found in code: the server bound to loopback only, `tsx`/`esbuild` were dev-only dependencies, rate limits would have been shared by every visitor behind a proxy, and a non-401 error left the client stuck loading. All fixed (the banner is kept, with a working retry).

## 2. How the frontend reaches the backend
Vercel serves `dist/` and a same-origin function (`api/proxy.mjs`) that forwards `/api/*` to `BACKEND_URL`, passing the visitor IP and `PROXY_SHARED_SECRET`. The browser only talks to its own origin, so there is no CORS, and CSP stays `connect-src 'self'`. Media is served by the backend through signed `/api/media` links, also via the proxy. The proxy returns JSON errors (`backend_not_configured`, `backend_unreachable`) so failures are diagnosable.

## 3. Hosting, database, auth, storage
* Backend: Render web service (`render.yaml`) or any Docker host (`Dockerfile`). Node 22.
* Database: PostgreSQL (Render managed, or Supabase). Migrations run on start.
* Auth: Supabase Auth. The dev provider is refused when `NODE_ENV=production`; passwords are never accepted without real validation.
* Storage: private Supabase Storage bucket; local disk refused in production unless `ALLOW_EPHEMERAL_STORAGE`.

## 4. Files and config changed (deployment)
`server/config.ts`, `server/http/client-ip.ts` (new), `server/http/router.ts`, `server/app.ts` (health endpoints), `package.json` (0.2.1), `api/_proxy.mjs`, `api/proxy.mjs`, `vercel.json`, `render.yaml`, `Dockerfile`, `.dockerignore`, `.gitignore`, `.env.example`, `scripts/check-deploy.mjs`, `src/api/client.ts`, `src/state/session.tsx`, `src/app/App.tsx`, `src/lib/auth-return.ts`, `src/main.tsx`, `src/pages/auth.tsx` (password reset page and notices), `test/deploy.test.ts`.

## 5. What you must do (only you can)
1. Create the Supabase project, bucket, and URL configuration (guide §4).
2. Deploy the backend on Render via the blueprint and fill the secrets (guide §5).
3. Add `BACKEND_URL` and `PROXY_SHARED_SECRET` on Vercel and redeploy (guide §6).
4. Run `node scripts/check-deploy.mjs <site> <backend>` and the manual run-through (guide §7).
5. Fill the legal placeholders (below) with counsel before enabling "approved" status.

## 6. Current auth state
Implemented and tested against fakes and local runs: sign-up, eligibility (18 and over, self-declared, month+year only), email confirmation return, onboarding, Home, sign-out, sign-in, invalid-credential handling, expired-session handling, password recovery. **Not verified against live Supabase.**

## 7. Universes
All 15 are in the sidebar and `/universes`, each with an overview, spaces, templates or tools, sample content labelled Demo, and limits stated on the page.

| Works today (in-app, real backend) | Needs an integration or is not built |
|---|---|
| Posting by template with validation, browse/filter, "I'm in" participation, saves, reports, uploads with previews (when storage is configured), in-browser finance calculators, four single-player games with server-stored scores and an opt-in leaderboard, Learn, Opportunities, Mentors, Events with RSVP, Nova and the AI Council | Real AI replies need `ANTHROPIC_API_KEY` (otherwise labelled demo). **Not built:** payments/escrow, multiplayer, video calls, AI video or image generation, video hosting (links only) |

FreePlay stays visible. Status labels distinguish available / partial / planned.

## 8. Governance and anonymity decisions
* Default structure, editable by the Founder (high-risk, step-up, audited), all seats vacant, no invented names: 7 High Council seats, 12 Directors, 24 Guardians (8 areas × 3). Definitions in `shared/governance-defaults.ts`.
* Anonymous posting is **on by default** (Founder decision, Oct 2026) and can be switched off globally or per community; the UI reflects availability.
* Identity reveal: only `moderation.reveal_anonymous`, documented case reviewed first, reason ≥ 20 characters, step-up, conflict checks (reporter, author, assigned elsewhere), daily limit of 5, full audit, oversight review. The Founder does **not** automatically get reveal.

## 9. Legal drafts
`/terms`, `/privacy`, `/rules` (source in `shared/legal/`), labelled **DRAFT — requires legal review**, linked from the landing page, sign-up, eligibility, and Settings. Acceptance version + timestamp per document is stored in `legal_acceptances` when eligibility is confirmed. `/api/config` exposes `legal.status = "draft"`.

Outstanding placeholders and decisions before production acceptance is enabled:
* Legal entity name, registered address, legal / privacy / safety / appeals / copyright contacts.
* Governing law, venue, limitation of liability, consumer-rights wording.
* Appeal response times and oversight body.
* AI provider name, region, retention, and training-use position.
* Hosting providers and regions; international transfer safeguards.
* Data retention periods and backup retention window.
* Jurisdiction-specific rights and legal bases; regulator for complaints.
* Legal-process disclosure wording for anonymous-author requests.
Then set `LEGAL_STATUS` to `approved` in `shared/constants.ts` and bump `LEGAL_VERSION`.

## 10. Test results (this build environment)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | no errors |
| Full suite, SQLite and PostgreSQL (PGlite) | **246 tests, 246 pass, 0 fail** |
| `npm run build` | success; secret-name scan of `dist/app.js` finds none |
| Browser e2e (Playwright, fresh server) at phone/tablet/desktop | **192/192 checks passed**: sign-up → eligibility → onboarding → Home, all 15 Universes, games and tools pages, legal pages, Founder routes, overflow checks, keyboard skip link, nav controls |

## 11. Limitations (stated plainly)
* The live Vercel site, Render, Supabase Auth/Storage, a real PostgreSQL server and a real AI provider were **not reachable or tested** from the build environment. The Vercel URL returned a proxy 403 to the sandbox. Behaviour there is verified only by local runs, PGlite, and fake HTTP layers.
* No security audit, load test, or legal review has been done.
* Legal documents are drafts.
