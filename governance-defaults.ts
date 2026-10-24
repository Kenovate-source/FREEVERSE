// Proposed default definitions for the 7 High Council, 12 Director and 24 Guardian seats.
// They are DEFAULTS FOR REVIEW, not constitutional text: the Founder can rename or revise every field through the
// `governance.seat_update` workflow (high risk: step-up + audit). All seats start VACANT. No person is named here.
// Numbers are responsibility groups, not rank in society. No seat grants access to anyone's private messages, journals or Nova chats.

export interface SeatDefault {
  /** Stable key so upgrades can find a seat even after the Founder renames it. */
  key: string;
  level: 7 | 12 | 24;
  seatNo: number;
  title: string;
  scope: string;
  responsibilities: string[];
  /** Plain-language reporting line (proposed default). */
  reportsTo: string;
  boundaries: string[];
  area?: string;
}

export const DEFAULTS_VERSION = 1;

const HC = (n: number, key: string, name: string, scope: string, responsibilities: string[]): SeatDefault => ({
  key: `hc.${key}`, level: 7, seatNo: n, title: `High Council: ${name}`, scope, responsibilities,
  reportsTo: 'The Council (level 3), and through it the Founder.',
  boundaries: [
    'Sets direction and reviews outcomes for its area; does not run day-to-day operations (Directors do).',
    'May view operational dashboards, community health and aggregate analytics. May view proposals and the AI Council.',
    'Cannot appoint, remove or change permissions; those are Founder decisions recorded in the audit log.',
    'No access to private messages, journals, Nova conversations or anonymous-author identities.',
  ],
});

export const HIGH_COUNCIL: SeatDefault[] = [
  HC(1, 'learning-research', 'Learning & Research', 'Education, research, knowledge and intellectual development.', ['Oversee the quality and honesty of FreeLearn and FreeResearch content.', 'Set standards for learning paths, sources and citations.', 'Review learning outcomes reported by the Directors.']),
  HC(2, 'work-enterprise', 'Work & Enterprise', 'Employment, careers, entrepreneurship and economic opportunity.', ['Oversee FreeWork, FreeBuild, FreeMarket and FreeFinance direction.', 'Guard against exploitative or misleading opportunities.', 'Review how opportunities translate into real outcomes for members.']),
  HC(3, 'community-citizen', 'Community & Citizen Experience', 'Communities, citizen journeys, participation and belonging.', ['Oversee community standards, onboarding and the citizen journey.', 'Champion belonging, accessibility and inclusion across every Universe.', 'Review community health signals and recommend improvements.']),
  HC(4, 'technology-infrastructure', 'Technology & Infrastructure', 'Platform architecture, reliability, data and technical infrastructure.', ['Oversee reliability, performance, data architecture and technical debt.', 'Review incidents and recovery readiness.', 'Approve technical direction with the Platform Engineering, Data & Security Director.']),
  HC(5, 'ai-innovation', 'AI & Innovation', 'AI systems, new capabilities, experimentation and emerging technologies.', ['Oversee the AI Council, Nova and any new AI capability before it reaches members.', 'Ensure experiments in FreeLabs are labelled, bounded and reversible.', 'Review AI incidents, limits and honest capability descriptions.']),
  HC(6, 'trust-safety-privacy', 'Trust, Safety & Privacy', 'Platform safety, moderation standards, privacy, security and citizen protection.', ['Oversee moderation standards, appeals and the anonymous-author reveal oversight log.', 'Review privacy and security posture and data-subject requests.', 'Recommend safeguards before risky features launch (for example anonymous posting).']),
  HC(7, 'partnerships-growth', 'Partnerships & Ecosystem Growth', 'Institutional partnerships, ecosystem development and responsible expansion.', ['Oversee partnerships with schools, employers, mentors and community organisations.', 'Ensure partners meet FREEVERSE trust standards before any listing is shown.', 'Review responsible-growth plans, including any change to the 18–24 range (a constitutional matter for the Founder).']),
];

const DIR = (n: number, key: string, name: string, universes: string, scope: string, resp: string[], reportsTo: string): SeatDefault => ({
  key: `dir.${key}`, level: 12, seatNo: n, title: `Director: ${name}`, scope: `${scope} Universes: ${universes}.`, responsibilities: resp, reportsTo,
  boundaries: [
    `Operational responsibility for ${universes}; the permission set is the same for every Director (ops dashboard, community health, moderation queue view, aggregate analytics, governance view).`,
    'Scope is organisational. Software permissions are not per-Universe, so a Director must not act outside the named scope; the audit log makes that reviewable.',
    'Cannot appoint or remove anyone, change roles, or reveal anonymous authors.',
    'No access to private messages, journals, Nova conversations or other private personal content.',
  ],
});

export const DIRECTORS: SeatDefault[] = [
  DIR(1, 'connect-communities', 'FreeConnect & Communities', 'FreeConnect', 'People, communities, profiles and the social experience.', ['Keep communities healthy, welcoming and well-moderated.', 'Coordinate Guardians in Community Care, Accessibility & Inclusion, and Regional Liaison.', 'Report community health to the High Council.'], 'High Council: Community & Citizen Experience'),
  DIR(2, 'learn-education', 'FreeLearn & Education', 'FreeLearn', 'Learning content, paths and educational partnerships.', ['Curate honest, accessible learning content and paths.', 'Coordinate Guardians in Learning & Research Communities.', 'Report learning outcomes and content quality.'], 'High Council: Learning & Research'),
  DIR(3, 'work-careers', 'FreeWork & Careers', 'FreeWork', 'Jobs, internships, careers and mentorship.', ['Vet opportunities and employers; remove misleading listings.', 'Run the mentor programme standards.', 'Coordinate Guardians in Work & Opportunity.'], 'High Council: Work & Enterprise'),
  DIR(4, 'build-entrepreneurship', 'FreeBuild & Entrepreneurship', 'FreeBuild', 'Projects, teams and early ventures.', ['Support builders with project spaces, collaboration and feedback.', 'Keep project listings truthful.', 'Escalate funding questions to the FreeFinance & Funding Director.'], 'High Council: Work & Enterprise'),
  DIR(5, 'market-commerce', 'FreeMarket & Commerce', 'FreeMarket', 'Products and services discovery and trading standards.', ['Define listing rules; remove scams and unsafe items.', 'Ensure no payment handling is claimed before it exists.', 'Coordinate with Trust, Safety & Privacy on fraud.'], 'High Council: Work & Enterprise'),
  DIR(6, 'ai-systems', 'FreeAI & AI Systems', 'FreeAI', 'Nova, the AI Council and member-facing AI tools.', ['Operate AI capabilities within their documented limits.', 'Keep capability labels honest (demo, configured, operational).', 'Report AI incidents to the High Council: AI & Innovation.'], 'High Council: AI & Innovation'),
  DIR(7, 'research-knowledge', 'FreeResearch & Knowledge', 'FreeResearch', 'Research, reading lists and knowledge sharing.', ['Curate sources and research projects; require attribution.', 'Coordinate Guardians in Learning & Research Communities.', 'Flag unreliable claims for correction.'], 'High Council: Learning & Research'),
  DIR(8, 'health-wellbeing', 'FreeHealth & Well-being', 'FreeHealth', 'Well-being information and support signposting. Not medical care.', ['Ensure content is general information, never diagnosis or treatment.', 'Maintain signposting to professional and crisis support.', 'Work with Trust, Safety & Privacy on sensitive-topic handling.'], 'High Council: Community & Citizen Experience'),
  DIR(9, 'finance-funding', 'FreeFinance & Funding', 'FreeFinance', 'Financial education, grants and funding information. Not financial advice.', ['Ensure content is educational and not personalised advice.', 'Vet funding opportunities and reject predatory ones.', 'Keep any money-related claim accurate and sourced.'], 'High Council: Work & Enterprise'),
  DIR(10, 'media-play-entertainment', 'FreeMedia, FreePlay & FreeEntertainment', 'FreeMedia, FreePlay, FreeEntertainment', 'Articles, creator publishing, games and entertainment discovery.', ['Set publishing and content standards for creators.', 'Keep games and entertainment age-appropriate for 18–24 adults and accessible.', 'Coordinate Guardians in Creators & Innovation.'], 'High Council: Community & Citizen Experience'),
  DIR(11, 'events-volunteer-labs', 'FreeEvents, FreeVolunteer & FreeLabs', 'FreeEvents, FreeVolunteer, FreeLabs', 'Events, volunteering and experiments.', ['Vet events and volunteering organisers; keep listings truthful and safe.', 'Run FreeLabs experiments in the open, labelled and reversible.', 'Coordinate Guardians in Events & Volunteering.'], 'High Council: Partnerships & Ecosystem Growth'),
  DIR(12, 'platform-data-security', 'Platform Engineering, Data & Security', 'the whole platform (infrastructure, not content)', 'Reliability, data stewardship and security.', ['Run infrastructure, backups, migrations and incident response.', 'Maintain data-lifecycle promises (export, correction, deletion).', 'Coordinate Guardians in Trust, Safety & Privacy.'], 'High Council: Technology & Infrastructure'),
];

export const GUARDIAN_AREAS = [
  { key: 'community-care', name: 'Community Care & Belonging', director: 'Director: FreeConnect & Communities', focus: 'Welcoming newcomers, checking in on community wellbeing, preventing isolation.' },
  { key: 'learning-communities', name: 'Learning & Research Communities', director: 'Director: FreeLearn & Education', focus: 'Helping study groups, research circles and learners find their footing.' },
  { key: 'work-opportunity', name: 'Work & Opportunity', director: 'Director: FreeWork & Careers', focus: 'Spotting misleading opportunities and guiding members to genuine ones.' },
  { key: 'creators-innovation', name: 'Creators & Innovation', director: 'Director: FreeMedia, FreePlay & FreeEntertainment', focus: 'Supporting creators and innovators and keeping creative spaces fair.' },
  { key: 'trust-safety-privacy', name: 'Trust, Safety & Privacy', director: 'Director: Platform Engineering, Data & Security', focus: 'Early identification of safety, privacy and abuse patterns; supporting fair dispute resolution.' },
  { key: 'accessibility-inclusion', name: 'Accessibility & Inclusion', director: 'Director: FreeConnect & Communities', focus: 'Making sure everyone can take part, whatever their needs or background.' },
  { key: 'events-volunteering', name: 'Events & Volunteering', director: 'Director: FreeEvents, FreeVolunteer & FreeLabs', focus: 'Safe, welcoming events and volunteering; supporting organisers.' },
  { key: 'regional-liaison', name: 'Regional & Community Liaison', director: 'Director: FreeConnect & Communities', focus: 'Listening to regional and local communities and carrying their concerns upward.' },
] as const;

/** Duties every Guardian keeps (Governance.md): the area adds focus, it never replaces these. */
export const GUARDIAN_CORE_DUTIES = [
  'Protect community health.',
  'Guide citizens.',
  'Support fair dispute resolution.',
  'Identify problems early.',
  'Recommend improvements.',
];

export const GUARDIANS: SeatDefault[] = GUARDIAN_AREAS.flatMap((a, ai) => [1, 2, 3].map((k): SeatDefault => ({
  key: `gd.${a.key}.${k}`, level: 24, seatNo: ai * 3 + k, title: `Guardian: ${a.name} (${k} of 3)`, area: a.name,
  scope: `${a.name}. ${a.focus}`,
  responsibilities: [...GUARDIAN_CORE_DUTIES, `Additional focus: ${a.focus}`],
  reportsTo: `${a.director}.`,
  boundaries: [
    'Community-facing: guides and reports. The focus area adds attention; it never excuses ignoring a core Guardian duty.',
    'May view community health and the moderation queue overview. Taking moderation actions needs a separate, explicit Moderator role.',
    'Cannot reveal anonymous authors, change roles, or see private messages, journals or Nova conversations.',
  ],
})));

export const ALL_SEAT_DEFAULTS: SeatDefault[] = [...HIGH_COUNCIL, ...DIRECTORS, ...GUARDIANS];

export const COUNCIL_NOTE = 'The three Council seats keep their generic titles: their specific responsibilities were not part of the supplied definitions, so the Founder sets them.';
