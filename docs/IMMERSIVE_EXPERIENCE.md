# Immersive experience (Stage 2 — immersive release)

> **Principle: FREEVERSE rewards exploration without punishing attention.** Atmosphere is optional and always yields to reading, writing, learning, forms, policies and accessibility.

## Concept — "the orbit"

FREEVERSE is drawn as one small solar system that you travel through as you scroll. A glowing core is **you**. Around it sit shells of **1 – 3 – 7 – 12 – 24** points, mirroring the governance hierarchy. The fifteen Universes are the nodes of the outer constellation, grouped by what they are for (learn & create, communities, work & enterprise, media & play), joined by the same "related" links the product already uses. Nothing is borrowed from another site; the motif comes from the product's own structure. Palette: deep ink background, cyan→blue core, each Universe in its own accent.

## The nine chapters (landing page)

| # | Chapter | What the scene does | Page treatment |
|---|---|---|---|
| 1 | Vision | Core and halo, orbit seen from slightly right | Headline, two CTAs, trust promise |
| 2 | Identities ("You arrive as one person…") | Identity rings tilt and glow | Chip list of identities |
| 3 | Universes ("Fifteen Universes, linked by what they share") | Camera pulls back; all fifteen nodes, links and labels appear | Searchable list of all fifteen with honest status labels |
| 4 | Learn & create | Knowledge cluster highlighted | Editorial split layout |
| 5 | Communities | Community cluster, denser links | Conversation-style layout |
| 6 | Work & enterprise | Work cluster, path lines | **Horizontal exploration** strip (native scroll, keyboard-operable, not a trap) |
| 7 | Media & play | Media cluster, pulses | Bento grid |
| 8 | Trust | Camera rises, nodes fade, shells show | Four promises; links to Terms / Privacy / Rules drafts |
| 9 | Join ("Step in") | Core and identities resolve for a full turn | Create account / sign in |

A chapter rail (right edge) and the sections themselves are real links/buttons; every chapter is reachable without animation.

## How the scene is driven

* **No pinning, no scroll hijacking.** The page scrolls natively. GSAP `ScrollTrigger` *scrubs a single number* (`t`, the chapter coordinate) between section centres; the camera, layers and labels are pure functions of `t` (`src/immersive/keyframes.ts`). Wheel, touch, keyboard and find-in-page behave normally; nothing calls `preventDefault`, and there is no diagonal scrolling (verified: `scrollX` stays 0).
* **Lazy.** The landing is readable HTML/CSS first (static SVG art shows until the scene draws). `immersive.js` (Three + GSAP, ≈187 kB gzip, separate from `app.js` ≈178 kB gzip) is injected at idle and only when the motion decision allows 3D.
* **Cleanup.** `dispose()` kills ScrollTriggers and tweens, removes listeners and observers, disposes geometries, materials and the renderer, forces context loss and removes the canvas. Verified by test: leaving the page leaves 0 canvases and `liveStats() === null`; three remount cycles do not grow geometry count.
* **Pauses.** The loop stops when the tab is hidden, the stage is off-screen, or the scene is paused/disposed. Quality is capped (pixel ratio, frame cap, object count) in the *low* mode.

## Motion modes (`src/motion/mode.ts`, one pure function)

Priority: **reduced > focus > fallback > low > exploration.**

| Mode | When | What changes |
|---|---|---|
| exploration | default | 3D scene, scroll-linked chapters, bounded pointer response, ambient decoration |
| focus | reading/writing/forms/policies/games (route list + `FocusZone`) | no 3D, no scroll-link, no pointer effects; decoration still |
| reduced | OS *prefers-reduced-motion*, Settings "Less/Off", or Settings "Reduce motion" | no 3D bundle fetched, static SVG art, reveals visible at once; "Off" hides decoration |
| low | few cores, ≤4 GB memory, data-saver, small screens | same story, lower quality |
| fallback | no WebGL / bundle fails | CSS/SVG `OrbitArt`, steered by the same chapter attribute |

User control: the **Motion** control on the landing (Full / Less / Off) and **Settings → Decorative motion**; stored locally and, when signed in, in privacy settings (`decorativeMotion`). The current reason is announced in a status region.

Focus routes include sign-up, sign-in, eligibility, onboarding, Terms/Privacy/Rules, Settings, post and lesson pages, messages, Nova, journal, moderation and the Founder Console. Components that need focus anywhere else (Universe composers, FreePlay games) hold a `FocusZone`.

## The fifteen Universes

`shared/universe-theme.ts` gives each Universe a layout family (ordered, expressive, browse, social, workshop), a motion language (drift, settle, pulse, orbit, rise, snap, ripple), a **unique signature artwork** (`src/features/universe/Sigil.tsx`, fifteen different motifs) and a depth level. Learning, research, finance and health are *ordered/calm*; media, entertainment, AI and play are *expressive*; the marketplace, work and events are *browse-first*; communities and volunteering are *social*; build and labs are *workshop*. The shared FREEVERSE type, tokens and focus ring are unchanged. Status labels come from `shared/universes.ts` and are not altered by styling. The hub (`/universes`) adds an **orbit map**: a native horizontal scroll region you can drag, arrow-key, use buttons on, or touch-swipe; every card is an ordinary link.

## Interaction system

Hover/focus lift (`.spatial`, off in focus/reduced modes), bounded pointer parallax on `depth: 2` heroes (≤ 8 px), the horizontal regions (landing work strip, orbit map), chapter rail, tabbed Universe sections, and loading / empty / error states (`Async`, `EmptyState`) already used across the app.

## Accessibility and performance facts

* Native scroll; landmark structure; skip link first; visible focus on every control (tested by tabbing 25 stops).
* The horizontal regions are focusable scroll containers: arrow keys scroll them and Tab leaves them (tested).
* Decorative layers are `aria-hidden`; text sits on solid/scrimmed surfaces; `test/contrast.test.ts` still passes.
* Layout is stable: no horizontal overflow at 390, 820 and 1366 px on the landing, hub or any of the fifteen Universe pages (tested). One overflow on the phone Trust chapter was found by these tests and fixed.

## Not done / honest limits

See `docs/INCOMPLETE_AND_EXTERNAL.md`.
