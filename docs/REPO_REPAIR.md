# Repairing the GitHub repository (flattened upload)

Repository inspected: `https://github.com/Kenovate-source/FREEVERSE`, branch `main`, head `8311020` (25 Oct 2026 01:47 Lagos), 11 commits, 550 tracked files.

## Root cause

**The files from the verified zip were uploaded to GitHub without their folders.** GitHub's "Add files via upload" keeps folder paths only when whole folders are dragged in; selecting the files *inside* a folder, or dragging them out of an extracted zip, puts every file in the repository root.

| Commits | Date | What they contain |
|---|---|---|
| `bd2f362`, `933acab`, `d61e374`, `7a18a8f` | 17 and 22 Oct | Uploads **with** folders: the Stage 1 app and the first Stage 2 files (`server/`, `src/`, `shared/`, `migrations/`...) |
| `bd82643`, `6325fab`, `a9fda46`, `a21693f`, `f9dd8d3`, `4f7103c`, `8311020` | 24 Oct 07:54 → 25 Oct 01:47 | Uploads with **no folders at all** (0 of 358 paths contain a `/`): the fixed and the immersive releases, dumped into the root |

Consequences, all measured by comparing the repository with the verified package:

1. **There is no `api/` directory.** `proxy.mjs`, `_proxy.mjs`, `_proxy.d.mts` and `proxy.d.mts` sit in the root. `vercel.json` rewrites `/api/*` to `/api/proxy`, but no such function exists, so Vercel never runs the proxy. The browser gets the frontend or a 404 instead of JSON, and the app shows "We couldn't reach the FREEVERSE server". This is the cause of the live failure. (The earlier `functions` glob error was a *different*, real bug, fixed in `docs/VERCEL_FIX.md`; this one is the upload.)
2. **The application is a mixture of old and new files.** 65 files that are in the right folder are older versions (for example `shared/constants.ts` still says `MAX_AGE = 24`, `src/pages/landing.tsx` is the Stage 1 landing, `scripts/build.mjs` does not build the 3D bundle). Meanwhile their newer versions sit in the root next to 264 other flattened files. Nothing the live site runs matches what was tested.
3. **Stage 1 leftovers** remain next to the new code: 23 files such as `src/components/*`, `src/data/mock.ts`, `src/auth/mockAuth.ts`, `src/pages/Home.tsx`, `test/api.test.ts`, `test/auth.test.ts`, `scripts/serve.mjs`. `npm test` would run the two obsolete tests.
4. **18 browser-renamed duplicates** (`0001_identity_social (1).sql`, `index (7).ts`, `types (9).ts`, `download (1)`...), all byte-identical copies of files that belong elsewhere. Three of the root files are dotfiles saved without their leading dot: `download` is `.dockerignore`, `download (1)` is `.gitignore` and `env.example` is `.env.example`. So the repository has **no `.gitignore`, `.dockerignore` or `.env.example`**, which is also why `dist/` was committed.
5. `server/modules/universe-spaces.ts` and several migrations (`migrations/*/0004`, `0005`) exist only as flat copies.

Not a cause: the Vercel config, the proxy code and the tests are correct (verified from a clean checkout, below). A static build succeeding proves nothing here: the static site builds fine with no `api/` folder.

## What the corrected tree does with every file

| Group | Count | Action | Why |
|---|---|---|---|
| Files already in the right place and identical | 141 | kept | |
| Files in the right place but older | 65 | **replaced** by the verified versions | stale Stage 1/early Stage 2 code |
| Flattened copies of files that belong in folders | 262 | **moved** to their real paths (content verified identical by hash) | restores `api/`, `server/`, `src/`, `shared/`, `docs/`, `test/`, `scripts/`, `migrations/`, `public/` |
| `[...path].mjs` in the root | 1 | removed | old proxy name; its design cannot work (see VERCEL_FIX.md) |
| Browser-renamed duplicates `name (N).ext` | 17 | removed | byte-identical copies; real versions are kept at their paths. Migrations are kept at `migrations/src`, `migrations/postgres`, `migrations/sqlite` |
| Dotfiles saved without the dot (`download`, `download (1)`, `env.example`) | 3 | **restored** as `.dockerignore`, `.gitignore`, `.env.example` | |
| `dist/` (build output) | 10 | removed from git (now ignored) | Vercel and Render build it; committing it hides real build failures |
| Stage 1 application code | 23 | removed | not used by the app, breaks `npm test`; still in git history (`bd2f362`) |
| Stage 1 screenshots and report (`screenshots/` outside `stage2/` and `immersive/`) | 29 | **kept** | historical assets |
| `Architecture_Decision_Records_ADR.md` (root) | 1 | **moved** to `docs/archive/` | Stage 1 document, preserved |
| SQL migrations | all | **kept**, no migration deleted | history of the schema; the five `.sql.tpl` templates render the two dialect folders (`npm run db:render`) |

## Safeguard added

`scripts/check-structure.mjs` runs at the start of every build (`npm run build`, `build:web`, `start`, and the Docker/Render build) and fails with a plain message when: required files such as `api/proxy.mjs` or `api/_proxy.mjs` are missing; a `vercel.json` rewrite points at an `api/` function that does not exist; the proxy imports something not beside it; a rendered migration is missing; a source file sits in the repository root; or a `name (1).ext` duplicate exists. Nine tests cover each case (`test/structure.test.ts`). A broken upload can no longer deploy silently: the Vercel build fails and says why.

## Updating GitHub without losing folders

**Do not use "Add files via upload" with extracted files.** Use git (works the same from Terminal, GitHub Desktop or VS Code):

```bash
git clone https://github.com/Kenovate-source/FREEVERSE.git
cd FREEVERSE
# remove everything tracked EXCEPT .git (history stays in git)
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
# unzip FREEVERSE-Stage-2-IMMERSIVE-FIXED.zip somewhere, then copy ITS CONTENTS (including dotfiles)
cp -a /path/to/unzipped/freeverse-app/. .
node scripts/check-structure.mjs      # should print: structure OK
git add -A
git status --short | head             # api/proxy.mjs and api/_proxy.mjs should appear as new files
git commit -m "Restore folder structure; Stage 2 immersive release"
git push origin main
```

With GitHub Desktop: clone the repository, delete everything except the hidden `.git` folder, copy the contents of the unzipped `freeverse-app` folder (show hidden files so `.gitignore` and `.env.example` come too), commit, push. Browser-only fallback: on github.com press `.` to open the web editor, or drag the **folders themselves** (`api`, `server`, `src`, ...) rather than their contents; GitHub's web upload accepts at most 100 files at a time, so git is much easier.

Check on GitHub afterwards: `api/proxy.mjs` opens, the root contains only `README.md`, `package.json`, `package-lock.json`, `tsconfig.json`, `vercel.json`, `render.yaml`, `Dockerfile`, dotfiles and folders.

## What still has to be configured by you (never commit these values)

**Vercel** (Project → Settings → Environment Variables, then redeploy). *Root Directory must be the repository root; Framework Preset: Other.*

| Variable | Value |
|---|---|
| `BACKEND_URL` | the Render service origin, e.g. `https://freeverse-api.onrender.com` (https, no path) |
| `PROXY_SHARED_SECRET` | random string, at least 24 characters. **Identical on Render.** |

**Render** (blueprint `render.yaml`; secrets are typed in the dashboard): `DATABASE_URL` (from the blueprint's database, or your own), `PUBLIC_ORIGIN=https://freeverse-weld.vercel.app` (no path), `PROXY_SHARED_SECRET` (same value), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `FOUNDER_EMAIL`, `MEDIA_URL_SECRET` (generated), `AUTH_PROVIDER=supabase`, `STORAGE_DRIVER=supabase`, `SUPABASE_STORAGE_BUCKET=freeverse-media`, `TRUST_PROXY_HOPS=1`, `ANONYMOUS_POSTING_ENABLED=true`, optional `ANTHROPIC_API_KEY`. In production the backend refuses unsafe settings and names the missing variable in its log.

**Supabase**: Authentication → URL configuration → Site URL `https://freeverse-weld.vercel.app`, Redirect URL `https://freeverse-weld.vercel.app/**`; Storage → a **private** bucket `freeverse-media`; Auth email/SMTP as in `docs/DEPLOYMENT.md`.

**Has a Render backend been deployed?** I cannot tell from here: the sandbox cannot reach `*.vercel.app` or `*.onrender.com`. Nothing in the repository proves one exists. If you have no Render service yet, `/api/health` can only ever return `backend_not_configured` (503, JSON) from the Vercel proxy; follow section 5 of `docs/DEPLOYMENT.md`.

## First live check, and how to read it

`https://freeverse-weld.vercel.app/api/health`

| You see | Meaning |
|---|---|
| `{"ok":true,"service":"freeverse-api","env":"production"}` | the proxy reached the real backend. Next: `/api/config`, then register and sign in |
| HTML (the website) or Vercel's 404 page | the function is not deployed: structure or project root is wrong (this incident) |
| `{"error":{"code":"backend_not_configured"...}}` (503) | proxy works; `BACKEND_URL` missing or invalid on Vercel |
| `backend_unreachable` (502) / `backend_timeout` (504) | proxy works; Render is down, asleep (free plan cold start) or the URL is wrong |
| JSON from the backend with 403/401 | the backend answered; read its message (for example secret mismatch) |

Then run `node scripts/check-deploy.mjs https://freeverse-weld.vercel.app https://YOUR-BACKEND.onrender.com`.
