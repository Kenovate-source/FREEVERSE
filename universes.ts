// The fifteen FREEVERSE Universes. Status reflects what actually exists in this build (Stage 2), cross-referenced with
// the PRD v2.0 roadmap. Nothing here claims a Universe is complete beyond what the status says.

export type UniverseStatus =
  | 'available' // usable now, backed by the real backend
  | 'partial' // some of its experiences are usable now
  | 'planned_v2' // PRD v2: post-launch, needs validated demand
  | 'planned_v3' // PRD v3+: long-term
  | 'concept' // part of the vision; no scheduled scope in the PRD
  | 'under_review'; // existing documents disagree about it

export interface Universe {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: UniverseStatus;
  /** What exists today, in plain words. */
  today: string[];
  /** Where it lives in the app, if anywhere. */
  route?: string;
  /** Source of the status. */
  basis: string;
  accent: string;
}

export const UNIVERSE_STATUS_LABEL: Record<UniverseStatus, string> = {
  available: 'Available', partial: 'Partly available', planned_v2: 'Planned · next phase', planned_v3: 'Planned · later',
  concept: 'Concept', under_review: 'Under review',
};

export const UNIVERSES: readonly Universe[] = [
  { id: 'freeconnect', name: 'FreeConnect', tagline: 'People, communities and conversation', description: 'The social core: profiles, a chronological feed, communities, direct messages and the safety tools that make them trustworthy.', status: 'available', today: ['Feed, posts, comments, polls', 'Communities (anonymous posting is off by default)', 'Profiles with privacy controls', 'One-to-one messages with message requests', 'Reporting, blocking and muting'], route: '/universes/freeconnect', basis: 'PRD v2.0 · v1. Calls are not built.', accent: '#3ee6f4' },
  { id: 'freelearn', name: 'FreeLearn', tagline: 'Learn anything, your way', description: 'Articles, paths, courses, tutorials, quizzes and challenges that you can save and track.', status: 'available', today: ['Browse and search a sample catalogue', 'Progress on paths and quizzes, saved resources', 'Tips, questions and study-partner requests from members'], route: '/universes/freelearn', basis: 'PRD v2.0 · v1', accent: '#4f9dff' },
  { id: 'freework', name: 'FreeWork', tagline: 'Opportunities and mentors', description: 'Scholarships, internships, grants and entry-level roles, plus a mentor directory with a request-an-introduction flow.', status: 'available', today: ['Curated opportunity listings (sample) and an application tracker', 'Mentor directory and introduction requests', 'Career lessons and feedback requests from members'], route: '/universes/freework', basis: 'PRD v2.0 · v1', accent: '#a58bff' },
  { id: 'freeai', name: 'FreeAI', tagline: 'Nova and the AI Council', description: 'A companion for reflection and planning, and a council of specialist AIs for learning, careers, creativity and more.', status: 'partial', today: ['Nova conversations, journal, goals and habits', 'AI Council of nine specialists, with routing', 'Shared prompts and questions from members', 'Live AI replies only once a provider is configured and verified; otherwise labelled demo replies'], route: '/universes/freeai', basis: 'PRD v2.0 · v1; Nova Safety Specification', accent: '#f7b2ff' },
  { id: 'freeevents', name: 'FreeEvents', tagline: 'Gather, together', description: 'Workshops, meetups and community moments with RSVP.', status: 'available', today: ['Event listings (sample) with RSVP', 'Event ideas with “I’d attend” counts'], route: '/universes/freeevents', basis: 'PRD v2.0 · v1', accent: '#ffb86b' },
  { id: 'freebuild', name: 'FreeBuild', tagline: 'Make things with others', description: 'Projects, teams and tools for building products, software and ventures.', status: 'partial', today: ['Share projects with images, stage and who you need', '“I’d like to help” offers and messages', 'Build logs and mentors'], route: '/universes/freebuild', basis: 'PRD v2.0 · v2, brought forward by Founder decision (Oct 2026). No hosting or funding.', accent: '#6ff0cf' },
  { id: 'freemarket', name: 'FreeMarket', tagline: 'Marketplace', description: 'Goods, services and creative work. Needs payments and a dedicated trust model first.', status: 'partial', today: ['Listings for products and services with images, categories and filters', 'Wanted requests', 'Message sellers, save and report listings'], route: '/universes/freemarket', basis: 'PRD v2.0 · v2, brought forward by Founder decision (Oct 2026). No payments, escrow, delivery or seller verification.', accent: '#ffd36b' },
  { id: 'freeresearch', name: 'FreeResearch', tagline: 'Research and knowledge discovery', description: 'Research communities, resources and collaboration.', status: 'partial', today: ['Share sources with links and citations', 'Research questions and collaboration requests', 'Research resources in Learn'], route: '/universes/freeresearch', basis: 'PRD v2.0 · v2, brought forward by Founder decision (Oct 2026). No peer review.', accent: '#86b7ff' },
  { id: 'freevolunteer', name: 'FreeVolunteer', tagline: 'Give time, grow skills', description: 'Volunteer matching and community initiatives.', status: 'partial', today: ['Volunteer opportunities with “I’d like to help” sign-up', 'Impact stories', 'Volunteer roles in Opportunities'], route: '/universes/freevolunteer', basis: 'PRD v2.0 · v2, brought forward by Founder decision (Oct 2026). No organisation verification or hour logging.', accent: '#7ee7a8' },
  { id: 'freehealth', name: 'FreeHealth', tagline: 'Wellbeing, non-clinical', description: 'Non-diagnostic wellbeing resources and habits. Not a clinical service.', status: 'partial', today: ['General wellbeing guides (awaiting formal health-content review)', 'Private habits and journal', 'Member routines and non-medical questions', 'Support resources'], route: '/universes/freehealth', basis: 'Not scheduled in PRD v2.0; made available by Founder decision (Oct 2026). Not a clinical service.', accent: '#ff9aa9' },
  { id: 'freefinance', name: 'FreeFinance', tagline: 'Money skills', description: 'Financial education and tools. Long-term; needs specialist legal review.', status: 'partial', today: ['Budget, savings-goal and growth calculators (run in your browser)', 'Money lessons and questions from members', 'Grants and scholarships in Opportunities'], route: '/universes/freefinance', basis: 'PRD v2.0 · v3+, brought forward by Founder decision (Oct 2026). Education, not financial advice.', accent: '#9be37a' },
  { id: 'freemedia', name: 'FreeMedia', tagline: 'Discovery and discussion for media', description: 'Reviews, recommendations and discussion of films, series and more. Not a streaming product.', status: 'partial', today: ['Publish articles with cover images, edit and delete them', 'Gallery for creative work (image uploads)', 'Video links (link-out only, no hosting)'], route: '/universes/freemedia', basis: 'PRD v2.0 · v3+ (merged with FreeEntertainment), brought forward by Founder decision (Oct 2026). No video hosting.', accent: '#ff8ad8' },
  { id: 'freeentertainment', name: 'FreeEntertainment', tagline: 'Watch, play, talk about it', description: 'A discovery, discussion and sharing space for entertainment content.', status: 'partial', today: ['Recommendations with ratings and spoiler labels', 'Watch-along invitations with “I’m in” counts', 'Discussion in comments'], route: '/universes/freeentertainment', basis: 'PRD v2.0 · v3+ (redefined), brought forward by Founder decision (Oct 2026). Not a streaming product.', accent: '#ff7b9c' },
  { id: 'freelabs', name: 'FreeLabs', tagline: 'Experiments', description: 'A place to try early ideas with willing members.', status: 'partial', today: ['Propose and join member-run experiments', 'Share results, including failures'], route: '/universes/freelabs', basis: 'PRD v2.0 · v3+, brought forward by Founder decision (Oct 2026).', accent: '#b9a6ff' },
  { id: 'freeplay', name: 'FreePlay', tagline: 'Games', description: 'Accessible single-player games, personal bests and friendly challenges. Built to grow: new games plug into a simple registry.', status: 'partial', today: ['Four single-player games in your browser: Memory Match, Quick Maths, Slide & Merge, Word Scramble', 'Personal bests and an opt-in leaderboard', 'Challenges and tips from members'], route: '/universes/freeplay', basis: 'Founder decision (Oct 2026): FreePlay stays a visible Universe. PRD v2.0 had removed it; the conflict is recorded. No multiplayer.', accent: '#5ee0ff' },
];

export const UNIVERSE_IDS = ['freeconnect', 'freelearn', 'freework', 'freebuild', 'freemarket', 'freeai', 'freeresearch', 'freehealth', 'freefinance', 'freemedia', 'freeevents', 'freevolunteer', 'freelabs', 'freeplay', 'freeentertainment'] as const;
export type UniverseId = (typeof UNIVERSE_IDS)[number];
