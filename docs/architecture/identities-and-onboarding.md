# Identities, onboarding, spaces and living profiles

## Fifteen identities (archetypes)
Student, Researcher, Creator, Gamer, Graduate, Professional, Entrepreneur, Developer, Teacher, Mentor, Employer, Investor, Organization, Volunteer, Community Leader. Defined as data in `shared/archetypes.ts`: label, vocabulary (work/goal/win/people/collection), onboarding questions, profile sections, home widgets, space navigation, tools (with `available | planned` status), achievements, suggested interests.

## Two onboarding paths, one account
Both are skippable at any step and resumable (`/api/onboarding`). Both end in the same account model.
* **Path A — identity first.** Choose identities → answer a few identity-specific questions each (conditional questions supported) → interests → privacy → finish. Primary identity chosen first.
* **Path B — guided discovery.** Pick what you want to do (intents) → the app suggests identities (explained, `suggestArchetypes`) → light questions only for what you accept → interests → privacy → finish.
They differ meaningfully in step order, question volume and where identities come from, but the same endpoints, tables and privacy defaults apply. Answers are stored privately in the identity's data and never exposed to other viewers.

## Multiple identities
`/api/identities`: add, edit headline/visibility/answers, **pause/resume**, change primary, **remove**. Removing never deletes the account or entries (entries are detached, not deleted) and a removed identity can come back with its old answers. The last active identity can't be left without a primary.

## Adaptive home and identity spaces
`GET /api/home` composes widgets from the person's active identities (deduplicated, with provenance) plus next steps; with no identity it shows a general home. `GET /api/spaces/:archetype` returns that identity's navigation, widgets, tools (honestly `planned` where not built), profile sections and milestones, in the identity's own vocabulary. Widget data comes from platform records (Learn progress, tracked opportunities, RSVPs, goals, habits, communities, saved items) or is an honest prompt/planned placeholder.

## Living profiles
* **Self-declared vs verified.** Entries are `self_declared` when a person adds them. `platform_recorded` exists only for things FREEVERSE itself saw (completed Learn items, volunteering event RSVPs, own non-anonymous creative posts). `verified` is a reserved state that nothing grants in Stage 2. Editing the substance of a platform-recorded entry reverts it to self-declared. The UI labels each.
* **User-controlled visibility.** Each identity and each entry has its own audience; accepted suggestions start **Only me**.
* **No auto-exposure.** Private journals, goals, Nova data and onboarding answers are never placed on a profile.
* **Evidence-based suggestions, reversible.** `/api/me/suggestions` proposes entries from platform records with a stated reason; nothing is added until accepted; dismissed items stay dismissed; accepted entries can be edited or deleted.
* **Milestones** are rule-based on real records and private to the person.

## Universe expansion
`shared/universes.ts` lists fifteen Universes (FreeConnect, FreeLearn, FreeWork, FreeBuild, FreeMarket, FreeAI, FreeResearch, FreeHealth, FreeFinance, FreeMedia, FreeEvents, FreeVolunteer, FreeLabs, FreePlay, FreeEntertainment) with a status (`available`, `partial`, `planned_v2`, `planned_v3`, `concept`, `under_review`), what works **today**, and the documentary basis. Statuses can be overridden by the Founder through the governed *Universe status* action (stored in `platform_config`). Pages for unbuilt Universes show a plain "not built" state and a private interest signal (`feature_interest`) that is not a pre-order and promises no date.

To add a Universe: add an entry to `UNIVERSES`; add routes/modules when it ships; flip its status through governance. Identity spaces and the explore page pick it up from the registry.

Current honest statuses: FreeLearn, FreeWork, FreeEvents *available*; FreeConnect, FreeAI *partial*; FreeBuild, FreeMarket, FreeResearch, FreeVolunteer *planned v2*; FreeFinance, FreeMedia, FreeEntertainment, FreeLabs *planned v3*; FreeHealth *concept*; FreePlay *under review* (the PRD v2 removed it; reported).

Web only for Stage 2: nothing claims native apps or a public API.
