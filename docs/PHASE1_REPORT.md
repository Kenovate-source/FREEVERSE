# Phase 1 report: stabilization (v0.4.0)

Tests actually run in the build sandbox: `npm test` 326/326 pass; `scripts/e2e.mjs` 192/192; `scripts/e2e-immersive.mjs` 55/55 (real Chromium, software WebGL); `check:structure` OK. Live Vercel/Render/Supabase were NOT reachable from the sandbox and are untested here.

## What changed
| Area | Change |
|---|---|
| Motion | Full / Less / Off are now three different configurations. **Full**: 3D scene, scroll camera, pointer parallax, continuous rotation. **Less**: calm low-quality 3D scene with slow drift only, no scroll or pointer effects, opacity-only reveals. **Off**: no 3D, no animation or transitions, decoration hidden. New default "Automatic" follows the device: Off if the device asks for reduced motion. Choosing Full on such a device is capped to Less. The choice persists. |
| Scene | Continuous time-based rotation (opposing rings, shells, stars), independent of scroll; the SVG fallback also rotates. |
| Not-found | The page shows the address and a Back button. All links in all 15 identity spaces (including Graduate) are now covered by `test/routes-integrity.test.ts`. **I could not reproduce the Graduate "couldn't find that page" error**; every link it emits resolves. If it recurs, the new page shows the exact address. |
| Blocked & muted | Search any member, then Mute or Block with a confirmation that explains the consequence. Unblock/Unmute with confirmation. `test/blocks.test.ts` proves the server enforces it (blocked: no messages either way, no follow, hidden from search; muted: posts hidden from the muter only, messaging still works). |
| Access reviews | Resume an open review, per-grant keep/revoke with required reason, progress count, cancel with a recorded reason (changes nothing), and openable history showing who/when/outcome. New migration `0006`. |
| Age check | Settings → Account showed "Not completed" for everyone because the UI checked `attested` while the server stores `self_attested`. Fixed; wording says self-declared, not verified. |
| Avatar | The account menu ignored your photo/avatar; it now uses your real avatar. Display mode "both" shows the photo with a small avatar badge. |
| Sign out | Visible button in the top bar and in the mobile More sheet. |

## Not done yet (next phases)
Registration redesign, identity taxonomy, Home vs Profile, messaging and habit settings (days/times/reminders), communities, media/entertainment, AI architecture, Founder Console redesign, suggestions, ecosystem-wide motion, landing section redesign.

## External configuration / cost
None new. Migration `0006` runs automatically when the API restarts on Render.
