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
  { id: 'freeconnect', name: 'FreeConnect', tagline: 'People, communities and conversation', description: 'The social core: profiles, a chronological feed, communities, direct messages and the safety tools that make them trustworthy.', status: 'partial', today: ['Feed, posts, comments, polls', 'Communities (including anonymous spaces)', 'Profiles with privacy controls', 'One-to-one messages with message requests', 'Reporting and blocking'], route: '/home', basis: 'PRD v2.0 · v1', accent: '#3ee6f4' },
  { id: 'freelearn', name: 'FreeLearn', tagline: 'Learn anything, your way', description: 'Articles, paths, courses, tutorials, quizzes and challenges that you can save and track.', status: 'available', today: ['Browse and search a demo catalogue', 'Progress on paths and quizzes', 'Saved resources'], route: '/learn', basis: 'PRD v2.0 · v1', accent: '#4f9dff' },
  { id: 'freework', name: 'FreeWork', tagline: 'Opportunities and mentors', description: 'Scholarships, internships, grants and entry-level roles, plus a mentor directory with a request-an-introduction flow.', status: 'available', today: ['Curated opportunity listings (demo)', 'Application tracker', 'Mentor directory and introduction requests'], route: '/opportunities', basis: 'PRD v2.0 · v1', accent: '#a58bff' },
  { id: 'freeai', name: 'FreeAI', tagline: 'Nova and the AI Council', description: 'A companion for reflection and planning, and a council of specialist AIs for learning, careers, creativity and more.', status: 'partial', today: ['Conversation history, rename, delete', 'Private journal, goals and habits', 'AI Council registry and routing', 'Real AI replies only once a provider is configured'], route: '/ai', basis: 'PRD v2.0 · v1; Nova Safety Specification', accent: '#f7b2ff' },
  { id: 'freeevents', name: 'FreeEvents', tagline: 'Gather, together', description: 'Workshops, meetups and community moments with RSVP.', status: 'available', today: ['Event listings (demo)', 'RSVP'], route: '/events', basis: 'PRD v2.0 · v1', accent: '#ffb86b' },
  { id: 'freebuild', name: 'FreeBuild', tagline: 'Make things with others', description: 'Projects, teams and tools for building products, software and ventures.', status: 'planned_v2', today: ['Project and venture entries on your profile'], basis: 'PRD v2.0 · v2', accent: '#6ff0cf' },
  { id: 'freemarket', name: 'FreeMarket', tagline: 'Marketplace', description: 'Goods, services and creative work. Needs payments and a dedicated trust model first.', status: 'planned_v2', today: ['Register interest'], basis: 'PRD v2.0 · v2 (deferred: payments)', accent: '#ffd36b' },
  { id: 'freeresearch', name: 'FreeResearch', tagline: 'Research and knowledge discovery', description: 'Research communities, resources and collaboration.', status: 'planned_v2', today: ['Researcher identity and profile; research resources in Learn'], basis: 'PRD v2.0 · v2', accent: '#86b7ff' },
  { id: 'freevolunteer', name: 'FreeVolunteer', tagline: 'Give time, grow skills', description: 'Volunteer matching and community initiatives.', status: 'planned_v2', today: ['Volunteer identity; volunteer opportunities in listings'], basis: 'PRD v2.0 · v2', accent: '#7ee7a8' },
  { id: 'freehealth', name: 'FreeHealth', tagline: 'Wellbeing, non-clinical', description: 'Non-diagnostic wellbeing resources and habits. Not a clinical service.', status: 'concept', today: ['Habit tracker in Nova; Pulse (wellbeing AI) in the AI Council'], basis: 'Not scheduled in PRD v2.0', accent: '#ff9aa9' },
  { id: 'freefinance', name: 'FreeFinance', tagline: 'Money skills', description: 'Financial education and tools. Long-term; needs specialist legal review.', status: 'planned_v3', today: ['Finance appears as an interest and in Learn'], basis: 'PRD v2.0 · v3+', accent: '#9be37a' },
  { id: 'freemedia', name: 'FreeMedia', tagline: 'Discovery and discussion for media', description: 'Reviews, recommendations and discussion of films, series and more. Not a streaming product.', status: 'planned_v3', today: ['Register interest'], basis: 'PRD v2.0 · v3+ (merged with FreeEntertainment)', accent: '#ff8ad8' },
  { id: 'freeentertainment', name: 'FreeEntertainment', tagline: 'Watch, play, talk about it', description: 'A discovery, discussion and sharing space for entertainment content.', status: 'planned_v3', today: ['Register interest'], basis: 'PRD v2.0 · v3+ (redefined)', accent: '#ff7b9c' },
  { id: 'freelabs', name: 'FreeLabs', tagline: 'Experiments', description: 'A place to try early ideas with willing members.', status: 'planned_v3', today: ['None'], basis: 'PRD v2.0 · v3+', accent: '#b9a6ff' },
  { id: 'freeplay', name: 'FreePlay', tagline: 'Games', description: 'Games and play. PRD v2.0 removed FreePlay as its own Universe (lightweight gamification belongs inside existing modules); the founder\'s Stage 2 brief lists it again.', status: 'under_review', today: ['Register interest'], basis: 'Conflict: PRD v2.0 removes it; Stage 2 directive lists it', accent: '#5ee0ff' },
];
