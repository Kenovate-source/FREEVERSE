# Phase 5 report: AI architecture (v0.7.0)

See `docs/AI_ROLES.md` for the audit and decision record.

## Changed
- `shared/ai-style.ts`, `shared/ai-capabilities.ts` (new); `NovaSettings` gains tone, formality, humour, detail, coaching, styleNote (stored in the existing `user_settings.nova` JSON; **no migration**).
- Nova modes (Everyday / Creative) on stored and temporary chats; style and mode added to the system prompt after safety.
- `/api/ai/info`: default assistant, honest input capability list, last-24h usage and daily cap, access statement, per-assistant can/can't access.
- New **AI preferences** page (`/ai/preferences`): style choices with a labelled fixed example, read-aloud voice (device voices, speed, preview, stored on the device), capability list, access and limits, "who does what".
- Read-aloud button on assistant replies (hidden where the browser has no speech support).

## Tested (actually run)
- `npm test` 358/358 (SQLite + Postgres), incl. `test/ai-preferences.test.ts` (validation, persistence, prompt contents, crisis reply unaffected by style/mode, honest capability states, no private-access permission on any assistant).
- Playwright `e2e.mjs` 201/201 (phone, tablet, desktop) incl. saving a style, persistence after reload, capability list, Creative mode toggle; `e2e-immersive.mjs` 55/55; build and structure guard pass.

## Not verified / limits
- Live Anthropic provider, real devices' voices, screen readers, Lighthouse/axe, and live infrastructure.
- Voice/image/video/document/link input are intentionally not built.
