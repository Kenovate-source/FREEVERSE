# Phase 2A report: motion environments and landing storytelling (v0.11.0)

## Implemented
- **Environment engine** (`src/environments/engine.ts`, lazy `dist/environments.js`): one shared rAF loop, seeded randomness, FPS caps by quality (30/24/18; 12 when calm), DPR caps, density scaling, IntersectionObserver pause, ResizeObserver, a single `live` registry. Off mounts nothing; still draws one frame; calm is slow and sparse; full is the complete scene. Failure to load the bundle never affects the page.
- **Ten distinct environments**: messages (network, packets, ripples), calls (ring, connect, speak, end), profile (identity orb with orbiting abstract shapes), communities (hubs and bridges), notifications (priority-band receiver), saved (parallax archive), settings (sliders and switches), posts (drafts rising and publishing), council (nine agents sending findings to the Founder), nova (breathing orb).
- **Routing** `src/lib/env-map.ts`; backdrop `EnvironmentBackdrop`; mode from the one motion decision (`src/motion/env-mode.ts`). Canvas is inert, `aria-hidden`, confined to the content area on desktop, hidden in print. Cards are slightly translucent on environment pages.
- **Landing 2.1** each identity circle has its own orbiting particle (own direction, speed, brightness, distance).
- **Landing 2.2/2.4** Universe→Universe pulses travel only the real `related` links, with varied speeds, directions and colours; citizen→Universe is shown as particles orbiting every one of the 15 Universe nodes. Names stay readable (particles are small, additive).
- **Landing 2.3** Learn/Research group gets trailing energy along its geometric loop (distinct from the pulses).
- **Landing 2.5** each trust ring turns independently (direction, speed, tilt, depth).
- New `flow` layer in `keyframes.ts`; with Motion Off nothing is drawn, Less is calm, no WebGL falls back as before.

## Tests actually run (sandbox)
- `npm test`: 435 passed before adding tests; new `test/environments.test.ts` 10 passed (run alone).
- `scripts/e2e-immersive.mjs`: 55/55. `scripts/e2e.mjs`: 235/235 (new check on three viewport sizes: mount per page, inert canvas, none on Home, exactly one live environment, no leak after leaving).
- Screenshots reviewed at 1366 and 390 wide: environments, plus landing chapters universes, knowledge, work, trust, identity (software WebGL).

## Not done / limits
- Not verified on a real low-end Android device or on live Vercel/Render. Software WebGL only; frame rates there are not representative.
- Only 10 page families have environments; other pages stay plain until designed (one file plus one registry line each).
- The Calls environment animates a call lifecycle while the page says calls are not built; it is illustrative and the page text stays honest.
- Universe-chapter labels can sit near the lede text at some scroll positions (pre-existing camera framing, not changed).
- No DB changes. No new env vars.

## Needs your approval
- Whether the Calls backdrop should stay or be removed until calls exist.
