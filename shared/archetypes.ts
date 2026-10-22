// The fifteen identities (archetypes). One account can hold several. Each one changes the onboarding questions, the home
// dashboard, the identity space (navigation, widgets, tools), the profile sections, the terminology and the achievements.
// This file is data, shared by server and client. Nothing here claims a tool exists unless its status says so.
import type { Archetype } from './constants';

export type EntryKind = 'project' | 'publication' | 'achievement' | 'credential' | 'experience' | 'skill' | 'showcase' | 'contribution' | 'mentoring' | 'venture' | 'research_output' | 'game_highlight';
export interface Opt { key: string; label: string }
export interface Question {
  id: string; prompt: string; help?: string;
  type: 'single' | 'multi' | 'text';
  options?: Opt[]; max?: number;
  /** Only ask when an earlier answer matches. */
  when?: { q: string; anyOf: string[] };
  /** Where the answer lives: always inside the identity's own data. */
  optional: true;
}
export type WidgetSource = 'learn_progress' | 'opportunities' | 'events' | 'goals' | 'habits' | 'communities' | 'mentor_requests' | 'saved' | 'prompt' | 'planned' | `entries:${EntryKind}`;
export interface Widget { id: string; title: string; source: WidgetSource; empty: string; href?: string; wide?: boolean }
export interface ToolDef { id: string; label: string; description: string; status: 'available' | 'planned'; href?: string }
export interface Achievement { id: string; label: string; description: string; rule: { kind: 'entries'; entryKind: EntryKind; atLeast: number } | { kind: 'learn_completed'; atLeast: number } | { kind: 'posts'; atLeast: number } | { kind: 'goals_done'; atLeast: number } | { kind: 'events_yes'; atLeast: number } | { kind: 'mentor_requests'; atLeast: number } | { kind: 'tracked'; atLeast: number } }
export interface ArchetypeDef {
  id: Archetype; label: string; icon: string; accent: string; tagline: string; blurb: string;
  /** Words this identity uses. The same data, different language. */
  vocab: { work: string; goal: string; win: string; people: string; collection: string };
  questions: Question[];
  profileSections: { kind: EntryKind; label: string; prompt: string }[];
  widgets: Widget[];
  nav: { id: string; label: string; href: string }[];
  tools: ToolDef[];
  achievements: Achievement[];
  /** Interests/topics pre-suggested (never auto-applied) in onboarding. */
  suggestTags: string[];
  /** Safe defaults: what this identity shows on the profile unless the person changes it. */
  defaultVisibility: 'members' | 'connections';
  universes: string[];
  /** Intents (guided discovery) that point here. */
  intents: string[];
}

const o = (...pairs: string[]): Opt[] => pairs.map((p) => ({ key: p.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), label: p }));
const T = (id: string, prompt: string, type: Question['type'], options?: Opt[], extra: Partial<Question> = {}): Question => ({ id, prompt, type, options, optional: true, ...extra });
const W = (id: string, title: string, source: WidgetSource, empty: string, extra: Partial<Widget> = {}): Widget => ({ id, title, source, empty, ...extra });
const A = (id: string, label: string, description: string, rule: Achievement['rule']): Achievement => ({ id, label, description, rule });
const NAV = (...p: [string, string, string][]) => p.map(([id, label, href]) => ({ id, label, href }));
const PLANNED = (id: string, label: string, description: string): ToolDef => ({ id, label, description, status: 'planned' });
const HAVE = (id: string, label: string, description: string, href: string): ToolDef => ({ id, label, description, status: 'available', href });

export const ARCHETYPE_DEFS: Record<Archetype, ArchetypeDef> = {
  student: {
    id: 'student', label: 'Student', icon: '📚', accent: '#4f9dff', tagline: 'Learning, and making it count', blurb: 'Study support, learning paths, study groups and early opportunities.',
    vocab: { work: 'coursework', goal: 'study goal', win: 'milestone', people: 'classmates', collection: 'study list' },
    questions: [
      T('level', 'Where are you studying?', 'single', o('Secondary / sixth form', 'College or university', 'Vocational or apprenticeship', 'Self-taught')),
      T('field', 'What are you studying, or most want to study?', 'text', undefined, { help: 'A few words is fine.' }),
      T('support', 'What would help most right now?', 'multi', o('Study habits', 'Exam preparation', 'Finding scholarships', 'Choosing a direction', 'Study groups', 'Writing and research skills'), { max: 4 }),
      T('rhythm', 'How do you like to study?', 'single', o('Short daily sessions', 'Long focused blocks', 'With other people', 'It varies'), { when: { q: 'support', anyOf: ['study_habits', 'exam_preparation'] } }),
    ],
    profileSections: [{ kind: 'project', label: 'Coursework & projects', prompt: 'Add something you made or finished' }, { kind: 'achievement', label: 'Achievements', prompt: 'Add an award or milestone' }, { kind: 'skill', label: 'Skills', prompt: 'Add a skill you are building' }],
    widgets: [W('continue', 'Continue learning', 'learn_progress', 'Start a path or course in Learn and it will appear here.', { href: '#/learn', wide: true }), W('goals', 'Study goals', 'goals', 'Set a goal with Nova to keep it in view.', { href: '#/ai/goals' }), W('scholarships', 'Scholarships & internships', 'opportunities', 'Track an opportunity to see its status here.', { href: '#/opportunities' }), W('events', 'Upcoming', 'events', 'RSVP to an event to see it here.', { href: '#/events' })],
    nav: NAV(['learn', 'Learn', '#/learn'], ['opps', 'Scholarships & internships', '#/opportunities'], ['goals', 'Study goals', '#/ai/goals'], ['groups', 'Study groups', '#/communities']),
    tools: [HAVE('paths', 'Learning paths', 'Follow a path and track progress.', '#/learn'), HAVE('goals', 'Goals & habits', 'Private, with Nova or on your own.', '#/ai/goals'), PLANNED('study_rooms', 'Live study rooms', 'Shared focus rooms need the calls infrastructure.')],
    achievements: [A('first_path', 'First lesson done', 'Complete one item in Learn.', { kind: 'learn_completed', atLeast: 1 }), A('five_done', 'Five completed', 'Complete five items in Learn.', { kind: 'learn_completed', atLeast: 5 }), A('goal_met', 'Goal reached', 'Mark a goal done.', { kind: 'goals_done', atLeast: 1 })],
    suggestTags: ['study-skills', 'exam-prep', 'scholarships', 'writing'], defaultVisibility: 'members', universes: ['freelearn', 'freework', 'freeconnect'], intents: ['learn', 'direction'],
  },
  graduate: {
    id: 'graduate', label: 'Graduate', icon: '🎓', accent: '#6ff0cf', tagline: 'From qualification to first role', blurb: 'Entry-level roles, interview skills and your first professional steps.',
    vocab: { work: 'applications', goal: 'career goal', win: 'offer or interview', people: 'cohort', collection: 'shortlist' },
    questions: [
      T('status', 'Where are you in the journey?', 'single', o('Just finished', 'Job hunting', 'In a first role', 'Considering further study', 'Taking time out')),
      T('field', 'What did you study, or what kind of work are you aiming for?', 'text'),
      T('want', 'What do you want help with?', 'multi', o('CV and portfolio', 'Interview practice', 'Finding entry-level roles', 'Internships and fellowships', 'Choosing a field', 'Networking'), { max: 4 }),
      T('mode', 'Where could you work?', 'multi', o('Remote', 'Hybrid', 'On site', 'Willing to relocate'), { when: { q: 'status', anyOf: ['just_finished', 'job_hunting'] } }),
    ],
    profileSections: [{ kind: 'experience', label: 'Experience', prompt: 'Add a role, placement or volunteering' }, { kind: 'credential', label: 'Qualifications', prompt: 'Add a degree or certificate' }, { kind: 'project', label: 'Portfolio', prompt: 'Add work you can show' }],
    widgets: [W('pipeline', 'Applications', 'opportunities', 'Track an opportunity and move it through the stages.', { href: '#/opportunities', wide: true }), W('mentor', 'Mentor introductions', 'mentor_requests', 'Request an introduction from the mentor directory.', { href: '#/mentors' }), W('portfolio', 'Portfolio', 'entries:project', 'Add a project to your profile.'), W('learn', 'Interview & career skills', 'learn_progress', 'Browse the career resources in Learn.', { href: '#/learn' })],
    nav: NAV(['opps', 'Roles & fellowships', '#/opportunities'], ['mentors', 'Mentors', '#/mentors'], ['portfolio', 'Portfolio', '#/me/profile'], ['learn', 'Career skills', '#/learn']),
    tools: [HAVE('tracker', 'Application tracker', 'Interested, applied, interviewing, offer.', '#/opportunities'), HAVE('mentors', 'Mentor requests', 'Ask for an introduction.', '#/mentors'), PLANNED('cv', 'CV builder', 'Planned; your profile entries are the starting data.')],
    achievements: [A('tracked_three', 'Pipeline started', 'Track three opportunities.', { kind: 'tracked', atLeast: 3 }), A('intro', 'First introduction', 'Request a mentor introduction.', { kind: 'mentor_requests', atLeast: 1 }), A('portfolio_piece', 'Portfolio piece', 'Add a project.', { kind: 'entries', entryKind: 'project', atLeast: 1 })],
    suggestTags: ['careers', 'interviews', 'entry-level', 'cv'], defaultVisibility: 'members', universes: ['freework', 'freelearn'], intents: ['work', 'direction'],
  },
  researcher: {
    id: 'researcher', label: 'Researcher', icon: '🔬', accent: '#86b7ff', tagline: 'Questions worth asking', blurb: 'Research log, reading lists, publications and collaborators.',
    vocab: { work: 'research', goal: 'research question', win: 'finding', people: 'collaborators', collection: 'reading list' },
    questions: [
      T('stage', 'Where are you in research?', 'single', o('Curious beginner', 'Undergraduate research', 'Postgraduate', 'Independent researcher', 'Industry researcher')),
      T('area', 'Your research area or question', 'text', undefined, { help: 'Public by default only if you choose so on your profile.' }),
      T('need', 'What would help?', 'multi', o('Finding papers', 'Methods and statistics', 'Writing and citing', 'Collaborators', 'Funding and fellowships', 'Presenting work'), { max: 4 }),
      T('open', 'Are you open to collaboration requests?', 'single', o('Yes', 'Maybe, ask first', 'Not now'), { when: { q: 'need', anyOf: ['collaborators'] } }),
    ],
    profileSections: [{ kind: 'research_output', label: 'Research outputs', prompt: 'Add a paper, dataset or poster' }, { kind: 'publication', label: 'Publications', prompt: 'Add a publication' }, { kind: 'project', label: 'Projects', prompt: 'Add a project' }],
    widgets: [W('reading', 'Reading list', 'saved', 'Save papers and resources from Learn.', { href: '#/saved' }), W('log', 'Research outputs', 'entries:research_output', 'Add outputs to your profile.', { wide: true }), W('learn', 'Methods & writing', 'learn_progress', 'Open the research resources in Learn.', { href: '#/learn?format=research' }), W('funding', 'Fellowships & grants', 'opportunities', 'Track a grant or fellowship.', { href: '#/opportunities' })],
    nav: NAV(['reading', 'Reading list', '#/saved'], ['learn', 'Research resources', '#/learn?format=research'], ['funding', 'Grants & fellowships', '#/opportunities'], ['communities', 'Research communities', '#/communities']),
    tools: [HAVE('reading', 'Reading lists', 'Save and organise resources into collections.', '#/saved'), HAVE('outputs', 'Outputs on your profile', 'Self-declared, with optional links.', '#/me/profile'), PLANNED('collab', 'Collaboration spaces', 'Planned with FreeResearch.')],
    achievements: [A('first_output', 'First output', 'Add a research output.', { kind: 'entries', entryKind: 'research_output', atLeast: 1 }), A('published', 'Published', 'Add a publication.', { kind: 'entries', entryKind: 'publication', atLeast: 1 })],
    suggestTags: ['research-methods', 'academic-writing', 'statistics'], defaultVisibility: 'members', universes: ['freeresearch', 'freelearn'], intents: ['research', 'learn'],
  },
  creator: {
    id: 'creator', label: 'Creator', icon: '🎨', accent: '#f7b2ff', tagline: 'Make it, show it, grow it', blurb: 'A showcase for your work, feedback, creative challenges and collaborators.',
    vocab: { work: 'work', goal: 'creative goal', win: 'release', people: 'audience', collection: 'moodboard' },
    questions: [
      T('craft', 'What do you make?', 'multi', o('Writing', 'Illustration and design', 'Photography', 'Video and film', 'Music and audio', 'Fashion', 'Crafts', 'Digital art', 'Something else'), { max: 4 }),
      T('stage', 'Where are you with it?', 'single', o('Just starting', 'Making regularly', 'Sharing publicly', 'Selling or taking commissions')),
      T('want', 'What do you want from FREEVERSE?', 'multi', o('Honest feedback', 'Collaborators', 'An audience', 'Creative challenges', 'Learning a craft', 'Paid work'), { max: 3 }),
      T('feedback', 'How do you like feedback?', 'single', o('Kind and specific', 'Straight to the point', 'Only when I ask'), { when: { q: 'want', anyOf: ['honest_feedback'] } }),
    ],
    profileSections: [{ kind: 'showcase', label: 'Showcase', prompt: 'Add a piece of your work' }, { kind: 'project', label: 'Projects', prompt: 'Add a bigger project' }, { kind: 'achievement', label: 'Milestones', prompt: 'Add a milestone' }],
    widgets: [W('showcase', 'Showcase', 'entries:showcase', 'Pin your best work to your profile.', { wide: true }), W('feed', 'Creative communities', 'communities', 'Join a creative community to share work.', { href: '#/communities' }), W('challenges', 'Challenges', 'learn_progress', 'Try a creative challenge from Learn.', { href: '#/learn?format=challenge' }), W('events', 'Events', 'events', 'RSVP to a workshop or meetup.', { href: '#/events' })],
    nav: NAV(['showcase', 'Showcase', '#/me/profile'], ['communities', 'Creative communities', '#/communities'], ['challenges', 'Challenges', '#/learn?format=challenge'], ['events', 'Workshops', '#/events']),
    tools: [HAVE('showcase', 'Showcase on your profile', 'Images, links and descriptions you control.', '#/me/profile'), HAVE('posts', 'Creative posts', 'Share work in the feed with feedback.', '#/home'), PLANNED('market', 'Sell your work', 'Needs payments and a trust model first (FreeMarket).')],
    achievements: [A('first_show', 'On display', 'Add a showcase piece.', { kind: 'entries', entryKind: 'showcase', atLeast: 1 }), A('shared', 'Shared work', 'Post three times.', { kind: 'posts', atLeast: 3 })],
    suggestTags: ['illustration', 'photography', 'writing', 'music'], defaultVisibility: 'members', universes: ['freeconnect', 'freemedia', 'freelearn'], intents: ['make', 'meet'],
  },
  gamer: {
    id: 'gamer', label: 'Gamer', icon: '🎮', accent: '#ff7bd0', tagline: 'Play well, play kind', blurb: 'Find people to play with, share highlights and keep play healthy.',
    vocab: { work: 'highlights', goal: 'play goal', win: 'clip', people: 'squad', collection: 'library' },
    questions: [
      T('how', 'How do you play?', 'multi', o('Console', 'PC', 'Mobile', 'Tabletop', 'Esports and competitive', 'Cosy and story games'), { max: 4 }),
      T('want', 'What are you looking for?', 'multi', o('People to play with', 'Game discussion', 'Sharing highlights', 'Learning to improve', 'Game development'), { max: 3 }),
      T('limits', 'Do you want gentle play-time reminders?', 'single', o('Yes', 'No thanks')),
      T('dev', 'Which area of game making?', 'single', o('Design', 'Programming', 'Art and animation', 'Audio'), { when: { q: 'want', anyOf: ['game_development'] } }),
    ],
    profileSections: [{ kind: 'game_highlight', label: 'Highlights', prompt: 'Add a highlight or achievement' }, { kind: 'project', label: 'Game projects', prompt: 'Add something you built' }],
    widgets: [W('highlights', 'Highlights', 'entries:game_highlight', 'Add a highlight to your profile.', { wide: true }), W('squads', 'Gaming communities', 'communities', 'Join a community to find people.', { href: '#/communities' }), W('habits', 'Healthy play', 'habits', 'Track a habit such as breaks or sleep.', { href: '#/ai/habits' }), W('events', 'Events', 'events', 'RSVP to a game night.', { href: '#/events' })],
    nav: NAV(['communities', 'Communities', '#/communities'], ['highlights', 'Highlights', '#/me/profile'], ['events', 'Game nights', '#/events'], ['play', 'Games', '#/universes/freeentertainment']),
    tools: [HAVE('habits', 'Healthy-play habits', 'Private habit tracking.', '#/ai/habits'), PLANNED('games', 'Built-in games', 'Not part of Stage 2. PRD v2 removed FreePlay as its own Universe; see the conflicts section.'), PLANNED('lfg', 'Looking-for-group', 'Planned.')],
    achievements: [A('first_highlight', 'First highlight', 'Add a highlight.', { kind: 'entries', entryKind: 'game_highlight', atLeast: 1 }), A('night', 'Game night', 'RSVP yes to an event.', { kind: 'events_yes', atLeast: 1 })],
    suggestTags: ['gaming', 'esports', 'game-dev', 'cosy-games'], defaultVisibility: 'members', universes: ['freeentertainment', 'freeconnect', 'freeplay'], intents: ['play', 'meet'],
  },
  professional: {
    id: 'professional', label: 'Professional', icon: '💼', accent: '#a58bff', tagline: 'Grow your craft and your network', blurb: 'Career growth, upskilling, mentoring and meaningful connections.',
    vocab: { work: 'experience', goal: 'career goal', win: 'promotion or move', people: 'network', collection: 'resource list' },
    questions: [
      T('field', 'What is your field?', 'text'),
      T('stage', 'How long have you worked?', 'single', o('Under a year', '1–3 years', '3–5 years', 'More than 5 years')),
      T('want', 'What do you want?', 'multi', o('A new role', 'Upskilling', 'To mentor others', 'To find a mentor', 'To switch fields', 'Networking'), { max: 4 }),
      T('mentoring', 'How much time could you give to mentoring?', 'single', o('An hour a month', 'A few hours a month', 'Not yet'), { when: { q: 'want', anyOf: ['to_mentor_others'] } }),
    ],
    profileSections: [{ kind: 'experience', label: 'Experience', prompt: 'Add a role' }, { kind: 'skill', label: 'Skills', prompt: 'Add a skill' }, { kind: 'credential', label: 'Credentials', prompt: 'Add a certification' }],
    widgets: [W('opps', 'Opportunities', 'opportunities', 'Track roles and fellowships.', { href: '#/opportunities', wide: true }), W('learn', 'Upskilling', 'learn_progress', 'Pick a course in Learn.', { href: '#/learn' }), W('mentor', 'Mentors', 'mentor_requests', 'Request an introduction.', { href: '#/mentors' }), W('goals', 'Career goals', 'goals', 'Set a private goal.', { href: '#/ai/goals' })],
    nav: NAV(['opps', 'Opportunities', '#/opportunities'], ['learn', 'Upskill', '#/learn'], ['mentors', 'Mentors', '#/mentors'], ['events', 'Events', '#/events']),
    tools: [HAVE('tracker', 'Opportunity tracker', 'Stages from interested to offer.', '#/opportunities'), HAVE('goals', 'Career goals', 'Private goal tracking.', '#/ai/goals'), PLANNED('endorse', 'Endorsements', 'Planned; verified claims need a verification system.')],
    achievements: [A('skills3', 'Skills listed', 'Add three skills.', { kind: 'entries', entryKind: 'skill', atLeast: 3 }), A('goal', 'Goal reached', 'Mark a goal done.', { kind: 'goals_done', atLeast: 1 })],
    suggestTags: ['career-growth', 'leadership', 'networking'], defaultVisibility: 'members', universes: ['freework', 'freelearn', 'freeconnect'], intents: ['work', 'grow'],
  },
  entrepreneur: {
    id: 'entrepreneur', label: 'Entrepreneur', icon: '🚀', accent: '#ffd36b', tagline: 'Build something that matters', blurb: 'Venture board, co-founders, resources and mentors for early-stage building.',
    vocab: { work: 'venture', goal: 'milestone', win: 'launch', people: 'co-founders & backers', collection: 'toolkit' },
    questions: [
      T('stage', 'What stage are you at?', 'single', o('Exploring ideas', 'Validating an idea', 'Building a first version', 'Have early customers', 'Running a business')),
      T('idea', 'What are you building, in a sentence?', 'text', undefined, { help: 'You choose later whether this is public.' }),
      T('need', 'What do you need?', 'multi', o('A co-founder', 'A mentor', 'Funding knowledge', 'Customers', 'Technical help', 'Legal and admin basics'), { max: 4 }),
      T('team', 'Are you building alone?', 'single', o('Alone', 'With a partner', 'With a small team'), { when: { q: 'stage', anyOf: ['building_a_first_version', 'have_early_customers', 'running_a_business'] } }),
    ],
    profileSections: [{ kind: 'venture', label: 'Ventures', prompt: 'Add a venture' }, { kind: 'project', label: 'Projects', prompt: 'Add a project' }, { kind: 'achievement', label: 'Milestones', prompt: 'Add a milestone' }],
    widgets: [W('venture', 'Ventures', 'entries:venture', 'Add what you are building.', { wide: true }), W('mentors', 'Mentors', 'mentor_requests', 'Request an introduction.', { href: '#/mentors' }), W('grants', 'Grants & competitions', 'opportunities', 'Track a grant or competition.', { href: '#/opportunities' }), W('learn', 'Startup skills', 'learn_progress', 'Open the startup toolkit in Learn.', { href: '#/learn' })],
    nav: NAV(['venture', 'Ventures', '#/me/profile'], ['grants', 'Grants & competitions', '#/opportunities'], ['mentors', 'Mentors', '#/mentors'], ['learn', 'Startup toolkit', '#/learn'], ['events', 'Events', '#/events']),
    tools: [HAVE('venture', 'Venture entries', 'Describe what you are building.', '#/me/profile'), HAVE('mentors', 'Mentor requests', 'Ask for an introduction.', '#/mentors'), PLANNED('match', 'Co-founder matching', 'Planned; needs consent-based discovery design.')],
    achievements: [A('venture1', 'Venture listed', 'Add a venture.', { kind: 'entries', entryKind: 'venture', atLeast: 1 }), A('mentor', 'Asked for help', 'Request a mentor introduction.', { kind: 'mentor_requests', atLeast: 1 })],
    suggestTags: ['startups', 'validation', 'fundraising-basics', 'product'], defaultVisibility: 'members', universes: ['freebuild', 'freework', 'freelearn'], intents: ['build', 'work'],
  },
  developer: {
    id: 'developer', label: 'Developer', icon: '💻', accent: '#6ff0cf', tagline: 'Ship, learn, collaborate', blurb: 'Projects, open-source contributions, learning and collaborators.',
    vocab: { work: 'projects', goal: 'build goal', win: 'release', people: 'collaborators', collection: 'stack' },
    questions: [
      T('langs', 'What do you work with?', 'multi', o('JavaScript or TypeScript', 'Python', 'Java or Kotlin', 'C#, C or C++', 'Go or Rust', 'Mobile', 'Data and ML', 'Not sure yet'), { max: 5 }),
      T('level', 'How would you describe yourself?', 'single', o('Learning', 'Building side projects', 'Working professionally', 'Contributing to open source')),
      T('want', 'What would help?', 'multi', o('Project ideas', 'Code review', 'Collaborators', 'Interview prep', 'Open-source starts', 'Learning a new stack'), { max: 4 }),
      T('review', 'Would you give code feedback to others?', 'single', o('Yes', 'Sometimes', 'Not yet'), { when: { q: 'level', anyOf: ['working_professionally', 'contributing_to_open_source'] } }),
    ],
    profileSections: [{ kind: 'project', label: 'Projects', prompt: 'Add a project with a link' }, { kind: 'contribution', label: 'Contributions', prompt: 'Add an open-source contribution' }, { kind: 'skill', label: 'Stack', prompt: 'Add a technology' }],
    widgets: [W('projects', 'Projects', 'entries:project', 'Add a project and link to the code.', { wide: true }), W('learn', 'Tutorials & projects', 'learn_progress', 'Open a tutorial in Learn.', { href: '#/learn?format=tutorial' }), W('comm', 'Developer communities', 'communities', 'Join a community to ask and answer.', { href: '#/communities' }), W('opps', 'Roles', 'opportunities', 'Track roles and internships.', { href: '#/opportunities' })],
    nav: NAV(['projects', 'Projects', '#/me/profile'], ['learn', 'Tutorials', '#/learn?format=tutorial'], ['communities', 'Communities', '#/communities'], ['opps', 'Roles', '#/opportunities']),
    tools: [HAVE('projects', 'Project entries with links', 'Link out to your repository or demo.', '#/me/profile'), PLANNED('review', 'Code review rooms', 'Planned.'), PLANNED('repo', 'Repository integration', 'Planned; would need an OAuth app and review of data flows.')],
    achievements: [A('proj', 'Project listed', 'Add a project.', { kind: 'entries', entryKind: 'project', atLeast: 1 }), A('oss', 'Contributor', 'Add a contribution.', { kind: 'entries', entryKind: 'contribution', atLeast: 1 })],
    suggestTags: ['web-dev', 'open-source', 'algorithms', 'data'], defaultVisibility: 'members', universes: ['freebuild', 'freelearn', 'freework'], intents: ['build', 'learn'],
  },
  teacher: {
    id: 'teacher', label: 'Teacher', icon: '🍎', accent: '#ffb86b', tagline: 'Share what you know', blurb: 'Create resources, run sessions and support learners.',
    vocab: { work: 'lessons', goal: 'teaching goal', win: 'learner success', people: 'learners', collection: 'resource bank' },
    questions: [
      T('subject', 'What do you teach or coach?', 'text'),
      T('mode', 'How do you teach?', 'multi', o('One-to-one', 'Small groups', 'Online sessions', 'Written guides', 'Videos'), { max: 3 }),
      T('want', 'What would help?', 'multi', o('Reaching learners', 'Resource ideas', 'Peer teachers', 'Feedback on lessons', 'Workshops and events'), { max: 3 }),
      T('events', 'Interested in hosting a workshop?', 'single', o('Yes', 'Maybe later', 'No'), { when: { q: 'want', anyOf: ['workshops_and_events'] } }),
    ],
    profileSections: [{ kind: 'project', label: 'Lessons & resources', prompt: 'Add a lesson or guide' }, { kind: 'credential', label: 'Credentials', prompt: 'Add a teaching credential' }, { kind: 'mentoring', label: 'Mentoring', prompt: 'Add mentoring you do' }],
    widgets: [W('resources', 'Resources', 'entries:project', 'Add a resource to your profile.', { wide: true }), W('events', 'Sessions & workshops', 'events', 'RSVP or plan a session.', { href: '#/events' }), W('learn', 'Browse for ideas', 'learn_progress', 'See how others teach in Learn.', { href: '#/learn' }), W('comm', 'Teaching communities', 'communities', 'Join a community.', { href: '#/communities' })],
    nav: NAV(['resources', 'Resources', '#/me/profile'], ['events', 'Workshops', '#/events'], ['learn', 'Learn', '#/learn'], ['communities', 'Communities', '#/communities']),
    tools: [HAVE('resources', 'Resource entries', 'List what you teach with links.', '#/me/profile'), PLANNED('publish', 'Publish courses in Learn', 'Planned; Learn content is curated in Stage 2.'), PLANNED('classroom', 'Classrooms', 'Planned.')],
    achievements: [A('res1', 'First resource', 'Add a lesson or guide.', { kind: 'entries', entryKind: 'project', atLeast: 1 }), A('mentoring', 'Mentoring listed', 'Add a mentoring entry.', { kind: 'entries', entryKind: 'mentoring', atLeast: 1 })],
    suggestTags: ['teaching', 'tutoring', 'curriculum'], defaultVisibility: 'members', universes: ['freelearn', 'freeevents', 'freeconnect'], intents: ['teach', 'give'],
  },
  mentor: {
    id: 'mentor', label: 'Mentor', icon: '🧭', accent: '#7be0a8', tagline: 'Guide someone a step further', blurb: 'Offer guidance with clear boundaries and a calm workload.',
    vocab: { work: 'mentoring', goal: 'mentoring goal', win: 'mentee milestone', people: 'mentees', collection: 'guidance notes' },
    questions: [
      T('area', 'What can you help with?', 'multi', o('Career', 'Study', 'Creative work', 'Startups', 'Technology', 'Research', 'Life skills'), { max: 4 }),
      T('time', 'How much time can you give?', 'single', o('One chat a month', 'A few chats a month', 'Occasional questions')),
      T('boundaries', 'What would you like mentees to know up front?', 'text', undefined, { help: 'For example topics you do not cover.' }),
      T('exp', 'How long have you worked in this area?', 'single', o('Under 3 years', '3–7 years', '7+ years'), { when: { q: 'area', anyOf: ['career', 'technology', 'startups'] } }),
    ],
    profileSections: [{ kind: 'mentoring', label: 'Mentoring', prompt: 'Describe how you mentor' }, { kind: 'experience', label: 'Background', prompt: 'Add relevant experience' }, { kind: 'credential', label: 'Credentials', prompt: 'Add a credential' }],
    widgets: [W('requests', 'Introduction requests', 'mentor_requests', 'Requests to you appear here once mentor listings are enabled.', { wide: true }), W('mentoring', 'Mentoring', 'entries:mentoring', 'Describe your mentoring.'), W('events', 'Events', 'events', 'RSVP to events.', { href: '#/events' }), W('planned', 'Mentor matching', 'planned', 'Matching and scheduling are planned. Today, the mentor directory is a curated demo.')],
    nav: NAV(['mentoring', 'Mentoring', '#/me/profile'], ['directory', 'Mentor directory', '#/mentors'], ['events', 'Events', '#/events'], ['communities', 'Communities', '#/communities']),
    tools: [HAVE('profile', 'Mentoring profile', 'Say how you can help and your limits.', '#/me/profile'), PLANNED('match', 'Matching & scheduling', 'Planned. In Stage 2 the directory is curated demo content.'), PLANNED('safeguards', 'Mentor safeguards', 'Planned; adult-to-adult only, with reporting always available.')],
    achievements: [A('ment1', 'Mentoring described', 'Add a mentoring entry.', { kind: 'entries', entryKind: 'mentoring', atLeast: 1 })],
    suggestTags: ['mentoring', 'career-advice', 'coaching'], defaultVisibility: 'members', universes: ['freework', 'freeconnect'], intents: ['give', 'teach'],
  },
  employer: {
    id: 'employer', label: 'Employer', icon: '🏢', accent: '#ff9b6b', tagline: 'Meet people who fit', blurb: 'Early-career hiring presence. Most employer tooling is planned; this identity sets the foundation.',
    vocab: { work: 'roles', goal: 'hiring goal', win: 'hire', people: 'candidates', collection: 'shortlist' },
    questions: [
      T('org', 'What kind of organisation?', 'single', o('Startup', 'Small business', 'Large company', 'Non-profit', 'Public body')),
      T('hire', 'What do you hope to offer?', 'multi', o('Internships', 'Entry-level roles', 'Apprenticeships', 'Fellowships', 'Project work'), { max: 4 }),
      T('mode', 'How do people work with you?', 'multi', o('Remote', 'Hybrid', 'On site'), { max: 3 }),
      T('values', 'What do you want candidates to know?', 'text', undefined, { when: { q: 'hire', anyOf: ['internships', 'entry_level_roles', 'apprenticeships', 'fellowships', 'project_work'] } }),
    ],
    profileSections: [{ kind: 'experience', label: 'About us', prompt: 'Describe your organisation' }, { kind: 'achievement', label: 'Highlights', prompt: 'Add a highlight' }],
    widgets: [W('planned', 'Hiring tools', 'planned', 'Posting roles and managing candidates are planned. Nothing here is live in Stage 2.', { wide: true }), W('events', 'Events', 'events', 'Find events to meet people.', { href: '#/events' }), W('comm', 'Communities', 'communities', 'Join communities relevant to your work.', { href: '#/communities' })],
    nav: NAV(['about', 'Organisation profile', '#/me/profile'], ['events', 'Events', '#/events'], ['communities', 'Communities', '#/communities']),
    tools: [PLANNED('post', 'Post roles', 'Planned. Requires employer verification and candidate-consent design.'), PLANNED('pipeline', 'Candidate pipeline', 'Planned.'), HAVE('profile', 'Employer profile', 'Introduce your organisation.', '#/me/profile')],
    achievements: [A('about', 'Introduced', 'Add an About entry.', { kind: 'entries', entryKind: 'experience', atLeast: 1 })],
    suggestTags: ['hiring', 'early-careers'], defaultVisibility: 'members', universes: ['freework', 'freeconnect'], intents: ['hire'],
  },
  investor: {
    id: 'investor', label: 'Investor', icon: '📈', accent: '#b6e36b', tagline: 'Back early ideas responsibly', blurb: 'A profile and conversation presence. Deal tooling is planned and needs legal review.',
    vocab: { work: 'interests', goal: 'thesis', win: 'introduction', people: 'founders', collection: 'watchlist' },
    questions: [
      T('type', 'What kind of investor?', 'single', o('Angel', 'Small fund', 'Corporate', 'Grant maker', 'Just exploring')),
      T('focus', 'What do you care about?', 'multi', o('Education', 'Health', 'Climate', 'Creative industries', 'Technology', 'Community'), { max: 4 }),
      T('stage', 'Which stage?', 'multi', o('Idea', 'Prototype', 'Early revenue', 'Growth'), { max: 3 }),
      T('note', 'A note for founders', 'text', undefined, { when: { q: 'type', anyOf: ['angel', 'small_fund', 'corporate', 'grant_maker'] } }),
    ],
    profileSections: [{ kind: 'experience', label: 'Background', prompt: 'Add a role' }, { kind: 'contribution', label: 'Support given', prompt: 'Add support you have given' }],
    widgets: [W('deals', 'Deal flow', 'planned', 'Deal flow and investment tooling are not built. Financial services need legal review first.', { wide: true }), W('pitches', 'Pitch & demo events', 'events', 'Find pitch or demo events.', { href: '#/events' }), W('founders', 'Founder communities', 'communities', 'Join founder communities.', { href: '#/communities' })],
    nav: NAV(['profile', 'Investor profile', '#/me/profile'], ['events', 'Events', '#/events'], ['communities', 'Communities', '#/communities']),
    tools: [PLANNED('deals', 'Deal flow', 'Not built. Needs legal and compliance review before any investment functionality.'), HAVE('profile', 'Investor profile', 'State your interests and limits.', '#/me/profile')],
    achievements: [A('bg', 'Background added', 'Add an experience entry.', { kind: 'entries', entryKind: 'experience', atLeast: 1 })],
    suggestTags: ['early-stage', 'impact'], defaultVisibility: 'members', universes: ['freework', 'freefinance'], intents: ['invest'],
  },
  organization: {
    id: 'organization', label: 'Organization', icon: '🏛️', accent: '#8fb8ff', tagline: 'A group, club or institution', blurb: 'An identity for clubs, societies, charities and institutions, with events and communities.',
    vocab: { work: 'programmes', goal: 'mission', win: 'impact', people: 'members', collection: 'resources' },
    questions: [
      T('kind', 'What are you?', 'single', o('Student society', 'Charity or NGO', 'Community group', 'School or university', 'Company programme')),
      T('mission', 'Your mission in a sentence', 'text'),
      T('want', 'What do you want to do here?', 'multi', o('Run events', 'Recruit volunteers', 'Share opportunities', 'Build a community', 'Share resources'), { max: 4 }),
      T('vol', 'Roughly how many volunteers do you need?', 'single', o('A few', '10–30', 'More than 30'), { when: { q: 'want', anyOf: ['recruit_volunteers'] } }),
    ],
    profileSections: [{ kind: 'achievement', label: 'Impact', prompt: 'Add something you achieved' }, { kind: 'project', label: 'Programmes', prompt: 'Add a programme' }],
    widgets: [W('events', 'Our events', 'events', 'Events you RSVP to or list appear here.', { href: '#/events', wide: true }), W('comm', 'Communities', 'communities', 'Run or join a community.', { href: '#/communities' }), W('programs', 'Programmes', 'entries:project', 'Describe your programmes.'), W('planned', 'Team tools', 'planned', 'Member management and event ticketing are planned.')],
    nav: NAV(['events', 'Events', '#/events'], ['communities', 'Communities', '#/communities'], ['programmes', 'Programmes', '#/me/profile']),
    tools: [HAVE('communities', 'Communities', 'Create a community for your members.', '#/communities'), PLANNED('events', 'Event publishing', 'Planned. In Stage 2 events are curated demo content.'), PLANNED('verify', 'Verified organisation badge', 'Planned. Today, nothing is verified.')],
    achievements: [A('prog', 'First programme', 'Add a programme.', { kind: 'entries', entryKind: 'project', atLeast: 1 })],
    suggestTags: ['community', 'events', 'volunteering'], defaultVisibility: 'members', universes: ['freeevents', 'freevolunteer', 'freeconnect'], intents: ['give', 'meet'],
  },
  volunteer: {
    id: 'volunteer', label: 'Volunteer', icon: '🤝', accent: '#ff8fa3', tagline: 'Give time, grow skills', blurb: 'Find ways to help, log what you give and grow through it.',
    vocab: { work: 'contributions', goal: 'giving goal', win: 'contribution', people: 'teammates', collection: 'causes' },
    questions: [
      T('cause', 'Which causes matter?', 'multi', o('Education', 'Environment', 'Health and wellbeing', 'Community', 'Arts', 'Animals', 'Technology access'), { max: 4 }),
      T('time', 'How much time?', 'single', o('A few hours a month', 'A few hours a week', 'Occasional events', 'Full-time for a period')),
      T('mode', 'How would you like to help?', 'multi', o('Remote', 'In person', 'Events', 'Skills-based'), { max: 3 }),
      T('skills', 'Skills you could offer', 'text', undefined, { when: { q: 'mode', anyOf: ['skills_based'] } }),
    ],
    profileSections: [{ kind: 'contribution', label: 'Contributions', prompt: 'Log something you did' }, { kind: 'achievement', label: 'Recognition', prompt: 'Add recognition' }, { kind: 'skill', label: 'Skills offered', prompt: 'Add a skill' }],
    widgets: [W('given', 'What you have given', 'entries:contribution', 'Log a contribution to your profile.', { wide: true }), W('opps', 'Ways to help', 'opportunities', 'Track a volunteering opportunity.', { href: '#/opportunities?type=volunteer' }), W('events', 'Events', 'events', 'RSVP to a volunteering event.', { href: '#/events' }), W('comm', 'Causes & communities', 'communities', 'Join a community.', { href: '#/communities' })],
    nav: NAV(['opps', 'Ways to help', '#/opportunities?type=volunteer'], ['log', 'My contributions', '#/me/profile'], ['events', 'Events', '#/events']),
    tools: [HAVE('log', 'Contribution log', 'Self-declared. Verified hours need an organisation partner.', '#/me/profile'), HAVE('opps', 'Volunteer opportunities', 'Curated demo listings.', '#/opportunities?type=volunteer'), PLANNED('hours', 'Verified hours', 'Planned.')],
    achievements: [A('c1', 'First contribution', 'Log a contribution.', { kind: 'entries', entryKind: 'contribution', atLeast: 1 }), A('c5', 'Regular giver', 'Log five contributions.', { kind: 'entries', entryKind: 'contribution', atLeast: 5 })],
    suggestTags: ['volunteering', 'community', 'environment'], defaultVisibility: 'members', universes: ['freevolunteer', 'freeevents'], intents: ['give', 'meet'],
  },
  community_leader: {
    id: 'community_leader', label: 'Community leader', icon: '🌍', accent: '#5fd0ff', tagline: 'Hold a space people trust', blurb: 'Run a community with care: rules, welcome, health at a glance.',
    vocab: { work: 'community', goal: 'community goal', win: 'healthy moment', people: 'members', collection: 'guidelines' },
    questions: [
      T('size', 'How big is the group you lead or want to lead?', 'single', o('Starting from zero', 'Under 50', '50–500', 'More than 500')),
      T('topic', 'What is it about?', 'text'),
      T('want', 'What would help?', 'multi', o('Writing good rules', 'Welcoming newcomers', 'Handling conflict', 'Growing gently', 'Running events'), { max: 3 }),
      T('anon', 'Do you expect sensitive topics where anonymity helps?', 'single', o('Yes', 'Not sure', 'No'), { when: { q: 'want', anyOf: ['handling_conflict', 'writing_good_rules'] } }),
    ],
    profileSections: [{ kind: 'contribution', label: 'Communities led', prompt: 'Describe a community you lead' }, { kind: 'achievement', label: 'Highlights', prompt: 'Add a highlight' }],
    widgets: [W('comm', 'Your communities', 'communities', 'Create or join a community.', { href: '#/communities', wide: true }), W('learn', 'Community care', 'learn_progress', 'Open leadership resources in Learn.', { href: '#/learn' }), W('events', 'Events', 'events', 'Plan or RSVP to events.', { href: '#/events' }), W('planned', 'Community health', 'planned', 'Health dashboards for leaders are planned. Moderators and the Founder see aggregates only.')],
    nav: NAV(['communities', 'Communities', '#/communities'], ['learn', 'Leading well', '#/learn'], ['events', 'Events', '#/events']),
    tools: [HAVE('communities', 'Create a community', 'Rules, description and category.', '#/communities'), PLANNED('mod', 'Leader moderation tools', 'Planned. Anonymous spaces are enabled only by platform administrators.'), PLANNED('health', 'Community health view', 'Planned.')],
    achievements: [A('led', 'Leading', 'Add a community you lead.', { kind: 'entries', entryKind: 'contribution', atLeast: 1 })],
    suggestTags: ['community-building', 'moderation', 'events'], defaultVisibility: 'members', universes: ['freeconnect', 'freeevents'], intents: ['meet', 'give'],
  },
};

export const ARCHETYPE_LIST: ArchetypeDef[] = Object.values(ARCHETYPE_DEFS);

/** Guided discovery: what a person is here to do. Each intent points to identities as SUGGESTIONS the person confirms. */
export const INTENTS: { key: string; label: string; help: string }[] = [
  { key: 'learn', label: 'Learn something', help: 'Skills, subjects, study support' },
  { key: 'work', label: 'Find work or opportunities', help: 'Jobs, internships, scholarships' },
  { key: 'build', label: 'Build something', help: 'Projects, products, ventures' },
  { key: 'make', label: 'Make and share creative work', help: 'Writing, art, music, video' },
  { key: 'research', label: 'Explore research questions', help: 'Papers, methods, collaborators' },
  { key: 'meet', label: 'Meet people and join communities', help: 'Conversation and belonging' },
  { key: 'give', label: 'Give back', help: 'Volunteer, mentor or teach' },
  { key: 'play', label: 'Play and unwind', help: 'Games and entertainment' },
  { key: 'direction', label: 'Work out what to do next', help: 'Not sure yet — that is fine' },
  { key: 'grow', label: 'Grow in my career', help: 'Upskill, network, mentor' },
  { key: 'hire', label: 'Find early-career talent', help: 'For employers' },
  { key: 'invest', label: 'Support early ideas', help: 'For investors and grant makers' },
  { key: 'teach', label: 'Teach or coach', help: 'Share what you know' },
];

export function suggestArchetypes(intents: string[]): { archetype: Archetype; because: string[] }[] {
  const score = new Map<Archetype, string[]>();
  for (const a of ARCHETYPE_LIST) {
    const hit = a.intents.filter((i) => intents.includes(i));
    if (hit.length) score.set(a.id, hit.map((k) => INTENTS.find((x) => x.key === k)!.label));
  }
  return [...score.entries()].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0])).slice(0, 4).map(([archetype, because]) => ({ archetype, because }));
}

/** Questions that apply, given the answers so far. */
export function visibleQuestions(def: ArchetypeDef, answers: Record<string, unknown>): Question[] {
  return def.questions.filter((q) => {
    if (!q.when) return true;
    const a = answers[q.when.q];
    const vals = Array.isArray(a) ? a : a == null ? [] : [a];
    return vals.some((v) => q.when!.anyOf.includes(String(v)));
  });
}
