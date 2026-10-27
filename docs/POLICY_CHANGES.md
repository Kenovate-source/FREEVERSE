# Product-policy changes (Founder decisions, October 2026)

These supersede earlier decisions.

## 1. Age: 18 and over, no upper limit
* **Was:** adults aged 18–24, with a Founder-only exemption from the upper bound.
* **Now:** adults aged **18 and over**. There is no upper limit, so the Founder exemption is no longer needed and has been removed (the legacy `users.eligibility_exemption` column is kept but unused).
* **Still true:** age is **self-declared**. We store only birth month and year; the day is discarded. The product never calls members "verified"; there is no verification mechanism.
* **Implementation:** `MAX_AGE` is `null` (`shared/constants.ts`); `checkEligibility` (`server/domain/eligibility.ts`) rejects only under-18 and implausible dates (age above 120, treated as typing errors); `/api/config` reports `eligibility.max = null`. Age bands shown on profiles (private by default) are now 18–24, 25–34, 35–49, 50+. Sign-up, eligibility page (year list now spans 100 years), landing, Settings, AI system prompt, legal drafts, docs and `check-deploy` were updated.
* **Tests:** `test/policy.test.ts` (adults at 30 and 60 can register and use the app; under-18 rejected with nothing stored; typo years invalid), `test/foundation.test.ts` (boundaries, bands).

## 2. Anonymous posting: available and on by default
* **Was:** off by default globally and per community.
* **Now:** `ANONYMOUS_POSTING_ENABLED` defaults to **true**. Seeded communities allow it except First Job Club and Volunteer Hub (opportunity and organisation postings need an accountable poster). New communities allow it by default. It can be switched off globally (`ANONYMOUS_POSTING_ENABLED=false`) or per community. Community moderators may turn it **off** for their community; only stewards with `config.manage` can turn it **on**. Anonymous posts remain inside communities.
* **Unchanged safeguards:** the server never returns the author id, handle or name for anonymous content (tests walk feed, post, comments, search, notifications and profile pages as other viewers); media links are bound to the viewer, not the author; anonymous posts are rate limited (5/hour); reports and moderation work as before.
* **Reveal:** only `moderation.reveal_anonymous`, with a reviewed case, a reason of at least 20 characters, step-up sign-in, conflict-of-interest checks, a daily limit, an audit record and oversight review. **The Founder role does not get reveal.** Tested.
* **Where users are told:** Community rules, Privacy Policy, Trust page, Settings and the Steward → Communities page were updated (drafts, pending legal review).
