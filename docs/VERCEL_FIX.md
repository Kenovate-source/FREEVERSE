# The Vercel build error — cause and fix

**Error:** `[unused_function] The pattern "api/[...path].mjs" defined in functions doesn't match any Serverless Functions inside the api directory.`

## Root cause (reproduced locally with the Vercel CLI)

`vercel.json` had a `functions` entry keyed `api/[...path].mjs`. Keys in `functions` are **glob patterns**, so `[...path]` is parsed as a character class, not a file name, and matches nothing. The file itself was fine; the *configuration* pointing at it was the problem.

A second, quieter problem: Vercel's generated route for a `[...path]` catch-all matched only **single-segment** paths in this setup, so `/api/a/b` could miss the function.

## Fix

* The proxy is now a plain file, **`api/proxy.mjs`**, with its function settings in the file (`export const config = { maxDuration: 30 }`). The `functions` key is gone from `vercel.json`.
* A rewrite sends *every* `/api/*` path to it: `{"source": "/api/:__fvp*", "destination": "/api/proxy"}`. Vercel adds the captured path as `?__fvp=<path>`; `resolveTarget()` in `api/_proxy.mjs` rebuilds the real backend path (rejecting `..`, a leading `/` and backslashes) and keeps the original query string.
* Behaviour is unchanged otherwise: method, body, query, status, headers, `x-fv-proxy-secret` and client IP forwarding, no redirect following, no `set-cookie`, 25 s timeout, JSON errors (`backend_not_configured` 503, `backend_unreachable` 502, `backend_timeout` 504). The proxy never fabricates success. The visible connection banner stays; its retry performs a real health check.

## Verified

* `npm run check:vercel` copies the project to a temp dir, installs the Vercel CLI and runs a real **`vercel build`**: output `PASS vercel build; functions: proxy.func; /api rewrite routed: true`.
* `test/deploy.test.ts` (14 tests): config sanity (no bracketed names or glob brackets, rewrite destination exists, method exports, `maxDuration`), `resolveTarget`, query preservation, status propagation (400–503), 302 passthrough, and an end-to-end proxy test against the real backend.

## Not verified here

A live deploy on your Vercel project, your Render service and Supabase could not be reached from the build sandbox. Follow `docs/DEPLOYMENT.md` to deploy, then open `/api/health` on the Vercel domain: it should return `{"ok":true,...}` from Render.
