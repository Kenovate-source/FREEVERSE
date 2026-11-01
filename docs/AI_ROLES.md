# AI roles and responsibilities (decision record, Phase 5)

## Audit (from the code)
- Runtime with two providers: `demo` (scripted, labelled) and `anthropic` (written against the public API, **never exercised against the live service** in this build).
- Nine founding specialists plus a hidden Founder AI, each with responsibilities, capabilities and tool permissions stored in `ai_agents`.
- Safety layer runs before any model call (crisis reply, flags with disclosed retention). Per-minute and daily limits. History, retention and delete controls. Private journal attach is per message and opt-in.
- Mismatch the owner noticed: Nova was titled "Creativity & Design · everyday companion", so one name carried two jobs and the UI did not say which it was doing.

## Decision
1. **Nova is the primary everyday conversational companion.** She keeps her identity and her creative depth. This is expressed as two visible **modes** (Everyday, Creative) over one shared conversation foundation, not as a second assistant. Creative mode only adds instructions; it grants no new permissions.
2. **No new named AI.** Specialists (Athena, Atlas, Aegis, Sage, Pulse, Forge, Echo, Compass) stay distinct by focus and by permissions. Nova routes people to them; they do not inherit Nova's access.
3. **Permissions are per assistant, not per conversation style.** Every member-facing assistant: cannot read private messages or journals on its own, cannot change platform data. Nova alone may read a journal entry, and only one the person attaches to a message. The Founder AI is hidden from members, reads aggregates only, and cannot write.
4. **Style is personalisation, not capability.** Tone, formality, humour, length and coaching style (plus a 200-character note) change wording only and are placed after the safety rules. Safety analysis runs on the raw message first, so a crisis message gets the safety reply regardless of style or mode (tested).
5. **Voice:** read-aloud uses the person's own device voices (nothing sent anywhere); the voice list is whatever the device exposes and FREEVERSE makes no claims about voice gender or presentation. Voice input, voice notes, image, video, document and link input are listed as **not available**, each with the reason, because no provider, moderation or privacy design exists for them. The capability list (`shared/ai-capabilities.ts`) is the single place to add a row when one is genuinely built.
6. **Access:** every member can use text chat now, within a per-minute and daily limit shown on the AI preferences page together with their own last-24-hour use. No essential function depends on AI. The limits are server-enforced and configurable; paid tiers or earned milestones can be layered on later without changing the interface (not built, not required).
7. **Admin visibility:** no admin endpoint returns conversation content; moderators and the Founder cannot read AI conversations, journals, goals or habits. Safety flags keep only a minimal excerpt for the disclosed retention window.

## Not done
- Live-provider behaviour untested. Demo mode is labelled everywhere it is used.
- No usage-based quotas per tier, no per-assistant model routing UI, no memory beyond saved history and style preferences.
- Read-aloud quality and voice availability vary by device; not tested on real devices.
