# Incomplete, external and unverified items

## Could not be verified from the build sandbox (needs you)
* **Live Vercel deploy**, **Render backend**, **Supabase auth/storage**, **a real PostgreSQL server** and **a live AI provider**. The code paths are tested against their interfaces (SQLite, in-process PostgreSQL via PGlite, a real local backend behind the proxy, and the Vercel CLI's own `vercel build`), not against your accounts. After deploying, check `/api/health` on the Vercel domain, then sign up and post.
* **Real mobile hardware and real GPUs.** Browser checks ran in headless Chromium with software WebGL at 390, 820 and 1366 px. Frame rates on real phones are untested; the *low* mode exists for that reason.
* **Lighthouse / axe / screen-reader audits were not run.** What was checked: keyboard order, visible focus, reduced-motion emulation, overflow, contrast unit tests, console errors. Run an audit and a screen-reader pass before launch.
* **Real age verification** does not exist. Age is self-declared, month and year only, and is never called verified.

## Product items not built (stated, not hidden)
* Community-moderator **toggle UI** for anonymous posting: the API and permission exist (`allow_anonymous`), the settings screen for moderators is not yet built.
* Anonymous posting is mentioned in Terms, Rules, Privacy, Trust and Settings, but there is no onboarding step dedicated to it.
* Route transitions between application pages are not animated (hover/press/focus responses and Universe identities are). Pages keep native navigation, scroll position and form state.
* Calls, payments, multiplayer, video hosting and AI video/media generation are not built.
* Legal documents are **drafts needing legal review**; entity and jurisdiction details remain placeholders.
