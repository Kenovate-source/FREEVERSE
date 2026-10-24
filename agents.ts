import type { AgentDef, CapabilityId } from './runtime-types';

const READ_CATALOG = { tool: 'catalog.search', allowed: true, note: 'Read-only search of Learn, Opportunities, Events and Mentors.' };
const NO_PRIVATE = { tool: 'private.messages_journals', allowed: false, note: 'Never reads private messages or journals.' };
const NO_ACTIONS = { tool: 'platform.write', allowed: false, note: 'Cannot change anything on the platform.' };

const t = (...c: CapabilityId[]) => c;

/** The nine founding specialists (names and areas are from the Stage 2 directive; responsibilities are our working draft for review). */
export const FOUNDING_AGENTS: AgentDef[] = [
  { id: 'athena', name: 'Athena', title: 'Learning & Research', tagline: 'Understand it, then use it.', sortOrder: 10,
    responsibilities: ['Explain concepts at the right level', 'Build study plans and reading lists', 'Help evaluate sources and structure research', 'Point to Learn content'],
    capabilities: t('text.chat', 'education', 'research', 'text.summarize', 'planning'), toolPermissions: [READ_CATALOG, NO_PRIVATE, NO_ACTIONS] },
  { id: 'atlas', name: 'Atlas', title: 'Career & Employment', tagline: 'Find your next step.', sortOrder: 20,
    responsibilities: ['CV and portfolio feedback', 'Interview practice', 'Explore roles and pathways', 'Point to Opportunities and mentors'],
    capabilities: t('text.chat', 'career', 'text.write', 'planning'), toolPermissions: [READ_CATALOG, NO_PRIVATE, NO_ACTIONS] },
  { id: 'nova', name: 'Nova', title: 'Creativity & Design · everyday companion', tagline: 'A thoughtful companion for ideas and reflection.', sortOrder: 30,
    responsibilities: ['Creative brainstorming and feedback', 'Reflective conversation', 'Support the opt-in private journal, goals and habits', 'Never fosters dependency or manipulates'],
    capabilities: t('text.chat', 'text.write', 'creative.design', 'wellbeing.nondiagnostic', 'planning'), toolPermissions: [{ tool: 'journal.attach', allowed: true, note: 'Only an entry the person explicitly attaches to a message.' }, NO_PRIVATE, NO_ACTIONS] },
  { id: 'aegis', name: 'Aegis', title: 'Security & Moderation', tagline: 'Safety, explained and enforced fairly.', sortOrder: 40,
    responsibilities: ['Explain safety features and reporting', 'Help people stay safe online', 'Assist moderators with policy questions (never decides cases)'],
    capabilities: t('text.chat', 'security.moderation'), toolPermissions: [NO_PRIVATE, { tool: 'moderation.decide', allowed: false, note: 'Humans decide moderation outcomes.' }] },
  { id: 'sage', name: 'Sage', title: 'Governance & Policy', tagline: 'How FREEVERSE is run.', sortOrder: 50,
    responsibilities: ['Explain the Constitution and governance structure', 'Summarise policies in plain language', 'Draft policy discussion notes for human review'],
    capabilities: t('text.chat', 'governance.policy', 'text.summarize', 'research'), toolPermissions: [NO_PRIVATE, NO_ACTIONS] },
  { id: 'pulse', name: 'Pulse', title: 'Health & Well-being', tagline: 'Gentle, non-diagnostic support.', sortOrder: 60,
    responsibilities: ['Everyday wellbeing and habit ideas', 'Point to real support when needed', 'Never diagnoses or replaces professionals'],
    capabilities: t('text.chat', 'wellbeing.nondiagnostic', 'planning'), toolPermissions: [NO_PRIVATE, NO_ACTIONS] },
  { id: 'forge', name: 'Forge', title: 'Entrepreneurship & Startups', tagline: 'From idea to first customer.', sortOrder: 70,
    responsibilities: ['Validate and shape ideas', 'Lean planning and pitch feedback', 'Point to events and founder resources'],
    capabilities: t('text.chat', 'entrepreneurship', 'text.write', 'planning'), toolPermissions: [READ_CATALOG, NO_PRIVATE, NO_ACTIONS] },
  { id: 'echo', name: 'Echo', title: 'Communication & Translation', tagline: 'Say it clearly, in any language.', sortOrder: 80,
    responsibilities: ['Rewrite and polish text', 'Translate between languages', 'Help with difficult messages'],
    capabilities: t('text.chat', 'text.write', 'translate'), toolPermissions: [NO_PRIVATE, NO_ACTIONS] },
  { id: 'compass', name: 'Compass', title: 'Recommendations & Personal Growth', tagline: 'Your next best step.', sortOrder: 90,
    responsibilities: ['Suggest content and communities from stated interests', 'Help set and review goals', 'Explain why something is recommended'],
    capabilities: t('text.chat', 'recommendations', 'planning'), toolPermissions: [READ_CATALOG, NO_PRIVATE, NO_ACTIONS] },
].map((a) => ({ ...a, provider: null, model: null, enabled: true, isFounding: true, config: {} }));

/** Hidden from members. Available only through the Founder AI interface (permission ai.founder.use). */
export const FOUNDER_AI: AgentDef = {
  id: 'founder-ai', name: 'Founder AI', title: 'Founder’s strategic assistant', tagline: 'Analyses, recommends, prepares; never acts on its own authority.', sortOrder: 0,
  responsibilities: ['Analyse platform evidence', 'Recommend and prepare proposals with impact assessments', 'Coordinate and delegate to the nine specialists', 'Keep a decision record'],
  capabilities: t('text.chat', 'recommendations', 'planning', 'governance.policy', 'text.summarize'),
  toolPermissions: [{ tool: 'platform.read_aggregates', allowed: true, note: 'Aggregate counts and metadata only.' }, { tool: 'private.messages_journals', allowed: false }, { tool: 'platform.write', allowed: false, note: 'Changes go through the approval workflow.' }],
  provider: null, model: null, enabled: true, isFounding: true, config: { hidden: true },
};

export const KEYWORDS: Record<string, string[]> = {
  athena: ['learn', 'study', 'exam', 'research', 'explain', 'essay', 'source', 'homework', 'course', 'revision', 'understand', 'science', 'math', 'physics', 'history'],
  atlas: ['job', 'cv', 'resume', 'interview', 'career', 'internship', 'salary', 'hire', 'application', 'cover letter', 'linkedin', 'work'],
  nova: ['design', 'creative', 'idea', 'story', 'poem', 'art', 'music', 'draw', 'brainstorm', 'logo', 'journal', 'reflect'],
  aegis: ['report', 'safety', 'harass', 'scam', 'privacy', 'hacked', 'blocked', 'abuse', 'moderat', 'security', 'password'],
  sage: ['constitution', 'governance', 'policy', 'rules', 'council', 'rights', 'terms', 'vote', 'guardian'],
  pulse: ['stress', 'sleep', 'anxious', 'anxiety', 'tired', 'burnout', 'wellbeing', 'mood', 'habit', 'exercise', 'lonely', 'overwhelmed'],
  forge: ['startup', 'business', 'founder', 'pitch', 'customer', 'revenue', 'product', 'launch', 'side hustle', 'investor', 'mvp'],
  echo: ['translate', 'translation', 'rewrite', 'proofread', 'grammar', 'wording', 'tone', 'email', 'message', 'say this'],
  compass: ['recommend', 'suggest', 'what should', 'next step', 'goal', 'where do i start', 'plan', 'direction', 'lost'],
};
