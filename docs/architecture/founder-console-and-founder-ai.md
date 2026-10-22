# Founder Console and Founder AI

## Founder Console (`#/founder`)
A distinct area gated by `founder.console` (and finer permissions per section). Everything is computed live from this instance's database; nothing is estimated, and the page says so. Sections:

| Section | Content | Permission |
|---|---|---|
| Overview | platform health (counts), configuration (database, auth, AI, storage), moderation indicators and internal target times, security indicators, governance seat fill, AI Council states, Universes, pending decisions, last access review | `founder.console` |
| Founder AI | mode, autonomy rules, findings, conversation, specialist delegation, proposal preparation | `ai.founder.use` |
| Decisions | pending proposals (impact, payload, evidence) with approve / revise / reject; history; rollback | `proposals.view/decide` |
| Governance | seats by level, appoint / remove / rename | `governance.*` |
| Access reviews | who holds access; start, mark, complete a review | `access_review.*` |
| Communities | counts only (members, posts, open cases) — no content | `community.health.view` |
| Universes | change a Universe's published status | via proposal |
| AI Council | specialist states, switches, health checks | `ai.council.*` |
| Audit log | filtered, paginated, content-free | `audit.view` |
| Constitution | reference and recorded amendments | `governance.view` |
| Priorities | the Founder's own checklist | `config.manage` |

Moderation queue (`#/moderation`) and the member-facing Governance page (`#/governance`) are separate.

**Demo vs real.** Figures are real counts of this instance's data; if demo content is present the console says how much of it is fictional. If no AI model is connected the console says so.

## Founder AI
Separate from the nine specialists. It analyses aggregate facts, raises findings, and *prepares* proposals. It never has direct write access: everything goes through the proposal workflow.

### Modes
| Mode | Behaviour |
|---|---|
| **Advisory** | Analyses and recommends. Nothing it prepares can execute. |
| **Approval Required** *(default)* | Prepares changes; each waits for explicit Founder approval. |
| **Bounded Autonomy** | May auto-run only **routine, low-risk, autonomy-eligible** actions that match a founder-configured rule, within that rule's daily cap. |

**In every mode** these always need explicit approval: constitutional/governance changes; security-sensitive permission changes; destructive or irreversible operations; material privacy changes; changes to the AI's own boundaries (mode and rules); any other high-risk action. Because the registry — not the AI — fixes risk, the AI cannot talk its way past this.

Changing the mode or rules is itself a high-risk action: authenticated (step-up), requires a written reason, is recorded as a decision and appears in the audit log.

### Honesty rules
* Findings are labelled **verified fact** (computed from the database), **observation**, **assumption**, **forecast** or **suggestion**.
* It never claims to have inspected private data (analysis uses aggregate counts) or to have executed anything.
* **Demo mode** (no model): chat replies are computed summaries of fixed facts, labelled "Computed from fixed facts (demo)". With a model, the model sees aggregate facts only and its output is labelled as model output.
* Executed actions record **verification** (did state change as claimed) and show it in decision history; autonomous runs are flagged "Ran on its own".

### Interface
Conversations, analysis run, findings (acknowledge / dismiss), recommendations as proposals with impact, approve / reject / revise, execution status and verification, decision history, autonomy settings and rules, delegation to specialists with recorded results.
