# AI Council (nine specialists)

| Specialist | Focus |
|---|---|
| Athena | Learning & Research |
| Atlas | Career & Employment |
| Nova | Creativity & Design (also the everyday companion) |
| Aegis | Security & Moderation |
| Sage | Governance & Policy |
| Pulse | Health & Well-being (non-diagnostic) |
| Forge | Entrepreneurship & Startups |
| Echo | Communication & Translation |
| Compass | Recommendations & Personal Growth |

> **Documentation conflict (reported):** the PRD describes Nova as a single companion; the Stage 2 directive assigns Nova "Creativity & Design" within a nine-specialist Council. Stage 2 keeps Nova as the everyday companion **and** the creativity specialist, and says so in the UI. Founder AI is a tenth, separate, hidden agent not offered to members.

## Registry
Specialists are rows in `ai_agents` (seeded from `server/ai/agents.ts`): id, name, title, tagline, responsibilities, capabilities (each with a state), tool permissions (allowed/denied with notes), enabled flag, sort order. `upsertAgent` adds a tenth or later specialist without code changes elsewhere (extensible registry).

## Capability states (shown to members and the Founder)
`unavailable` (no integration) · `available` (code exists, not configured) · `configured` (credentials present, not verified) · `operational` (verified recently) · `demo` (scripted stand-in). With no provider configured every specialist is `demo`. A health check (Founder Console) verifies a round trip and updates the state.

## Routing and delegation
`POST /api/council/route` suggests a specialist for free text using explainable keyword/intent rules; if nothing matches clearly it says so and points to Nova. Founder AI can delegate a task to a specialist; the delegation, status and result are stored in `ai_delegations`. A disabled or unavailable specialist returns a clear unavailable result; nothing is faked.

## Provider interface
`server/ai/providers.ts` defines `AiRuntime` (`complete`, provider kind). Implementations: **demo** (scripted, labelled) and **anthropic** (server-side HTTP, key from `ANTHROPIC_API_KEY`, default model `claude-sonnet-5-5`). The key never reaches the browser. Provider errors surface as a normal, safe error; a failed reply leaves no half-saved message. A per-person daily cap applies.

## Safety
Every message passes `server/ai/safety.ts` first: crisis or elevated-risk language returns a non-judgemental notice with resources (no pretending a model counselled them), and a short excerpt may be kept for the disclosed retention (default 30 days) detached from identity. Specialists advise; they take no actions on someone's behalf.

## Member interface
`#/ai/council` lists the nine with state badges and a router box; each specialist page shows responsibilities, what works today, and what it may or may not do. Conversations use the same history features as Nova (list, open, rename, pin, delete, delete-all, search; temporary chat when history is off).
