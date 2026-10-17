# FREEVERSE — Stage 1 prototype

A locally launchable, mock-data front end: sign-up/sign-in (mock), 18+ attestation, onboarding, chronological feed, profile, Learn, Opportunities & Mentors, Events, Nova (scripted), Messages (read-only sample).

**Everything is fictional and stored only in your browser. There is no backend.**

## Launch
    npm install
    npm start          # builds, then serves http://localhost:5173

Or build and open `dist/index.html` directly in a browser (works from file://).

## Checks
    npm run typecheck  # tsc --noEmit
    npm test           # unit tests (node:test)
    node scripts/e2e.mjs   # Playwright end-to-end + screenshots (needs a built dist/)
    npm run check      # typecheck + test + build

Use **Demo controls** in the app to force slow / error / empty states or reset local data.
Decision record: ADR-009 in Architecture_Decision_Records_ADR.md.
