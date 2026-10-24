# Engineering conventions (Stage 2)

Read this before touching server code. It is the contract between modules.

## Layout
- `shared/` constants and types used by both server and browser (no server imports).
- `server/db` persistence abstraction (SQLite stand-in, PostgreSQL production, PGlite = real Postgres for tests).
- `server/modules/<name>.ts` one file (or folder) per feature area; exports `<name>Module: ModuleDef` and is listed in `server/modules/index.ts`.
- `server/policy/visibility.ts` THE place for visibility/block/connection rules. Use its SQL fragments and helpers; never re-implement.
- `server/authz` permissions (`Permission`, role matrix), `principal`, `step-up`.
- `server/services` audit, notify, rate limit. `server/domain` pure logic. `server/seed` idempotent seed data.
- `migrations/src/*.sql.tpl` is the schema source; `npm run db:render` writes `migrations/{postgres,sqlite}`; a test fails if they are stale.
  To add schema: add a NEW numbered template (e.g. `0004_<topic>.sql.tpl`), never edit a shipped one after release. During Stage 2 build, workers may append tables to a NEW file they own.

## Writing routes
```ts
router.get('/api/things/:id', { auth: 'active', query: z.object({...}) }, async (c) => { ... return {...} });
```
- `auth`: `'none' | 'session' | 'active' | {perm}`. Default is `'active'` (signed in AND eligible). Use `{perm:'...'}` for staff routes.
- Validate every body/query with zod (`body:`/`query:`). IDs from the URL must be validated (`z.string().uuid()`): PostgreSQL rejects malformed uuids.
- Return plain objects (200), `created(obj)` (201), `noContent()`, `binary(buf, mime)`. Throw `HttpError` helpers from `server/http/errors` (`notFound`, `forbidden`, `badRequest`, `conflict`).
- Use `c.now()` for time, never `new Date()` / `Date.now()`. Use `uuid()` from `server/db`.
- Rate-limit anything a person can spam (`rate: {key, limit, windowMs}`).
- 404 (not 403) when revealing that something exists would itself leak (blocked users, private posts, other people's private records).

## SQL rules (must run on SQLite AND PostgreSQL)
- Placeholders `$1,$2…`. Booleans: pass JS booleans, read with `bool()`. JSON columns: pass objects (auto-stringified), read with `json(v, fallback)`. Timestamps: pass ISO strings (`c.now().toISOString()`), they come back as ISO strings.
- No `ILIKE`, no `RETURNING *` assumptions across dialects beyond `RETURNING id` (both support it), no `ON CONFLICT` differences: `INSERT ... ON CONFLICT (cols) DO NOTHING` / `DO UPDATE SET x = excluded.x` works on both. No `LIMIT` placeholders with expressions; `LIMIT $n` is fine with a number.
- Search: `lower(col) LIKE $n ESCAPE '\'` with `contains()` from `server/db`.
- `COUNT(*)` returns number. Don't select `*` into API responses: project explicit fields.
- Multi-row dynamic `IN (...)`: build with `placeholders(start, n)`.
- Wrap multi-statement writes in `db.tx(async (t) => ...)` and use `t` inside.

## Privacy rules (non-negotiable)
- Every query returning another person's data must respect blocks, `profile_visibility`, per-field audiences and `users.status = 'active'`.
- Anonymous content (`is_anonymous`): API responses NEVER include `author_id`, handle, name, avatar, or anything derived from them (including media owner, mention targets, notification actor). Author may see `mine: true`. Reveal only via the audited moderation path.
- Private records (journal, goals, habits, Nova conversations, DMs, private settings) are readable ONLY by their owner (or DM participants). No staff role reads them except through a case-bound, reason-recorded, audited workflow.
- Never log or audit-record message bodies, journal text, birth dates, tokens, or passwords.
- Never echo birth data. Eligibility stores month+year only.

## Tests
- `test/helpers/app.ts`: `startTestApp(dialect)` boots the real HTTP app on a free port with a fake clock and memory storage; `DIALECTS` = `['sqlite','postgres']`. Write integration tests as `for (const dialect of DIALECTS) describe(...)` so every behaviour is verified on both.
- `t.member(email)` creates an eligible member quickly; `t.grantRole(userId, 'moderator')` grants roles.
- Tests must assert privacy properties directly (e.g. JSON-scan responses for a hidden user's id/handle).
- Run your tests with `node --import tsx --test test/<yourfile>.test.ts`. Don't run the full suite concurrently with others.

## Honesty
- Demo/seeded data carries `is_demo = true` and the UI must label it.
- Provider-dependent things (AI, Supabase, storage) report their true state; "demo"/"unavailable" is never presented as working AI.
