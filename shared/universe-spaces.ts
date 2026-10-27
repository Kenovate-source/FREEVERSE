// What a member can actually DO in each Universe. One registry shared by the server (validation) and the client (forms, tabs, labels).
// Everything here is backed by real features: posts (with a `universe` and `template`), the existing Learn / Opportunities / Mentors /
// Events / Nova / Council features, in-browser tools and games. Nothing here promises payments, video hosting, multiplayer or live AI.
import type { PostKind } from './constants';

export type FieldType = 'text' | 'textarea' | 'select' | 'number';
export interface FieldDef { key: string; label: string; type: FieldType; options?: readonly string[]; required?: boolean; max?: number; min?: number; hint?: string; placeholder?: string }

export interface Template {
  id: string;
  label: string;
  kind: PostKind;
  /** Button text, e.g. "List something". */
  verb: string;
  blurb: string;
  titleLabel?: string;
  titleRequired?: boolean;
  bodyLabel: string;
  bodyRequired?: boolean;
  images?: boolean;
  urlLabel?: string;
  urlRequired?: boolean;
  needsStart?: boolean;
  fields: readonly FieldDef[];
  /** A select field used for filter chips on the browse page. */
  filterField?: string;
  /** "I'm in" style action. The author sees who joined; members only see a count. */
  participation?: { label: string; done: string; what: string };
  notice?: string;
}

export type SpaceType = 'overview' | 'browse' | 'tool' | 'link';
export interface Space { id: string; label: string; type: SpaceType; /** browse: template ids shown (all when omitted) */ templates?: readonly string[]; tool?: string; to?: string; blurb?: string }

export interface UniverseSpec {
  id: string;
  templates: readonly Template[];
  spaces: readonly Space[];
  related: readonly string[];
  /** Shown on every page of the Universe. Honest limits live here. */
  limits: readonly string[];
  /** Quick actions on the overview. */
  actions: readonly { label: string; to: string; primary?: boolean }[];
}

const S = (o: readonly string[]) => o;
const CAT_MARKET = S(['Digital products', 'Design & creative', 'Tutoring & lessons', 'Tech help', 'Handmade & crafts', 'Clothing & accessories', 'Electronics', 'Books & study materials', 'Other']);
const MEDIA_KINDS = S(['Film', 'Series', 'Music', 'Podcast', 'Book', 'Anime', 'Comedy', 'Game', 'Other']);
const FIELDS = S(['Computer science', 'Engineering', 'Health & life sciences', 'Social sciences', 'Business & economics', 'Arts & humanities', 'Natural sciences', 'Education', 'Other']);

export const GAMES = [
  { id: 'memory', name: 'Memory Match', blurb: 'Flip cards and find the pairs. Fewer moves is better.', scoreLabel: 'moves', lowerIsBetter: true, max: 500 },
  { id: 'maths', name: 'Quick Maths', blurb: '60 seconds of mental arithmetic. Keyboard friendly.', scoreLabel: 'correct answers', lowerIsBetter: false, max: 200 },
  { id: 'slide', name: 'Slide & Merge', blurb: 'Slide tiles with arrow keys or buttons and merge matching numbers.', scoreLabel: 'points', lowerIsBetter: false, max: 1_000_000 },
  { id: 'scramble', name: 'Word Scramble', blurb: 'Unscramble as many words as you can in 90 seconds.', scoreLabel: 'words', lowerIsBetter: false, max: 100 },
] as const;
export type GameId = (typeof GAMES)[number]['id'];

const T = {
  tip: (topic: readonly string[]): Template => ({ id: 'tip', label: 'Tip', kind: 'text', verb: 'Share a tip', blurb: 'Something that helped you, in a few sentences.', bodyLabel: 'Your tip', bodyRequired: true, fields: [{ key: 'topic', label: 'Topic', type: 'select', options: topic, required: true }], filterField: 'topic' }),
  question: (label = 'Question', verb = 'Ask a question'): Template => ({ id: 'question', label, kind: 'question', verb, blurb: 'Ask the community. Be specific so people can help.', titleLabel: 'Your question', titleRequired: true, bodyLabel: 'More detail', fields: [] }),
};

export const UNIVERSE_SPECS: readonly UniverseSpec[] = [
  {
    id: 'freeconnect', related: S(['freelearn', 'freeevents', 'freevolunteer']),
    templates: [],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'feed', label: 'Feed', type: 'link', to: '/home', blurb: 'Your chronological or relevant feed.' },
      { id: 'communities', label: 'Communities', type: 'link', to: '/communities', blurb: 'Join and start communities.' },
      { id: 'messages', label: 'Messages', type: 'link', to: '/messages', blurb: 'One-to-one messages with message requests.' },
      { id: 'people', label: 'Find people', type: 'link', to: '/explore', blurb: 'Discover members by interest.' },
    ],
    limits: ['Calls (voice and video) are not built. Messaging is.'],
    actions: [{ label: 'Open your feed', to: '/home', primary: true }, { label: 'Browse communities', to: '/communities' }, { label: 'Messages', to: '/messages' }],
  },
  {
    id: 'freelearn', related: S(['freeresearch', 'freework', 'freeai']),
    templates: [
      T.tip(S(['Study habits', 'Exams', 'Languages', 'Coding', 'Maths', 'Writing', 'Other'])),
      T.question(),
      { id: 'study-partner', label: 'Study partner', kind: 'text', verb: 'Find a study partner', blurb: 'Say what you are studying and how you would like to study together.', bodyLabel: 'What are you working on?', bodyRequired: true, fields: [{ key: 'subject', label: 'Subject', type: 'text', required: true, max: 60 }, { key: 'format', label: 'Format', type: 'select', options: S(['Online', 'In person', 'Either']), required: true }], filterField: 'format', participation: { label: 'I’d study with you', done: 'You’ve said you’re interested', what: 'The author will see that you’re interested and can message you.' } },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'catalogue', label: 'Catalogue', type: 'link', to: '/learn', blurb: 'Articles, paths, courses, tutorials and quizzes.' },
      { id: 'tips', label: 'Tips & questions', type: 'browse', templates: S(['tip', 'question']) },
      { id: 'partners', label: 'Study partners', type: 'browse', templates: S(['study-partner']) },
    ],
    limits: ['The catalogue is sample content, labelled as such. Courses are not accredited.'],
    actions: [{ label: 'Open the catalogue', to: '/learn', primary: true }, { label: 'Find a study partner', to: '/universes/freelearn/partners' }],
  },
  {
    id: 'freework', related: S(['freebuild', 'freefinance', 'freelearn']),
    templates: [
      { id: 'career-lesson', label: 'Career lesson', kind: 'text', verb: 'Share a career lesson', blurb: 'What you learned about work, applying or interviewing.', bodyLabel: 'Your lesson', bodyRequired: true, fields: [{ key: 'stage', label: 'Stage', type: 'select', options: S(['Exploring', 'Applying', 'Interviewing', 'First job', 'Changing direction']), required: true }], filterField: 'stage' },
      { id: 'feedback', label: 'Feedback request', kind: 'question', verb: 'Ask for feedback', blurb: 'Ask for feedback on a CV, portfolio or application. Never post private details like phone numbers.', titleLabel: 'What do you want feedback on?', titleRequired: true, bodyLabel: 'Context', fields: [{ key: 'about', label: 'About', type: 'select', options: S(['CV / résumé', 'Portfolio', 'Cover letter', 'Interview practice', 'Other']), required: true }], filterField: 'about' },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'opportunities', label: 'Opportunities', type: 'link', to: '/opportunities', blurb: 'Scholarships, internships, grants and roles, with an application tracker.' },
      { id: 'mentors', label: 'Mentors', type: 'link', to: '/mentors', blurb: 'Mentor directory and introduction requests.' },
      { id: 'lessons', label: 'Career lessons', type: 'browse', templates: S(['career-lesson']) },
      { id: 'feedback', label: 'Feedback', type: 'browse', templates: S(['feedback']) },
    ],
    limits: ['Listings are curated sample content. FREEVERSE does not verify employers or guarantee outcomes.'],
    actions: [{ label: 'Browse opportunities', to: '/opportunities', primary: true }, { label: 'Find a mentor', to: '/mentors' }],
  },
  {
    id: 'freebuild', related: S(['freemarket', 'freelabs', 'freefinance']),
    templates: [
      { id: 'project', label: 'Project', kind: 'creative', verb: 'Share a project', blurb: 'Pitch what you are building and who you would like to build it with.', titleLabel: 'Project name', titleRequired: true, bodyLabel: 'What is it, and why?', bodyRequired: true, images: true, urlLabel: 'Link (repo, site or demo)', fields: [{ key: 'stage', label: 'Stage', type: 'select', options: S(['Idea', 'Prototype', 'Building', 'Launched']), required: true }, { key: 'looking_for', label: 'Looking for', type: 'select', options: S(['Developer', 'Designer', 'Marketer', 'Teammate', 'Tester', 'Mentor', 'Nothing right now']), required: true }], filterField: 'looking_for', participation: { label: 'I’d like to help', done: 'You’ve offered to help', what: 'The project owner will see your offer and can message you.' } },
      { id: 'build-log', label: 'Build log', kind: 'text', verb: 'Post a build log', blurb: 'Share progress, a lesson or a blocker.', bodyLabel: 'What happened?', bodyRequired: true, fields: [{ key: 'project', label: 'Project name', type: 'text', max: 80 }] },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'projects', label: 'Projects', type: 'browse', templates: S(['project']) },
      { id: 'logs', label: 'Build logs', type: 'browse', templates: S(['build-log']) },
      { id: 'mentors', label: 'Find a mentor', type: 'link', to: '/mentors' },
    ],
    limits: ['Projects are listings and conversations. There is no hosting, source control or funding in FREEVERSE.'],
    actions: [{ label: 'Share a project', to: '/universes/freebuild/projects?new=project', primary: true }, { label: 'See projects', to: '/universes/freebuild/projects' }],
  },
  {
    id: 'freemarket', related: S(['freebuild', 'freemedia', 'freefinance']),
    templates: [
      { id: 'listing', label: 'Listing', kind: 'creative', verb: 'List something', blurb: 'Offer a product or a service. Buyers message you to agree details.', titleLabel: 'What are you offering?', titleRequired: true, bodyLabel: 'Description', bodyRequired: true, images: true,
        fields: [{ key: 'category', label: 'Category', type: 'select', options: CAT_MARKET, required: true }, { key: 'offer', label: 'Type', type: 'select', options: S(['Product', 'Service']), required: true }, { key: 'price', label: 'Price (free text)', type: 'text', required: true, max: 40, placeholder: 'e.g. ₦5,000 · $20 · Free · Negotiable', hint: 'FREEVERSE does not process payments. This is just what you are asking.' }, { key: 'condition', label: 'Condition', type: 'select', options: S(['Not applicable', 'New', 'Like new', 'Used']) }, { key: 'where', label: 'Where', type: 'text', max: 60, placeholder: 'City, region or “Online”' }],
        filterField: 'category', notice: 'Meet in public places, never send money to someone you can’t verify, and report anything that looks like a scam.' },
      { id: 'wanted', label: 'Wanted', kind: 'text', verb: 'Post a request', blurb: 'Tell the community what you are looking for.', bodyLabel: 'What are you looking for?', bodyRequired: true, fields: [{ key: 'category', label: 'Category', type: 'select', options: CAT_MARKET, required: true }, { key: 'budget', label: 'Budget (optional)', type: 'text', max: 40 }], filterField: 'category' },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'listings', label: 'Browse listings', type: 'browse', templates: S(['listing']) },
      { id: 'wanted', label: 'Wanted', type: 'browse', templates: S(['wanted']) },
    ],
    limits: ['No payments, escrow, delivery or seller verification. Agree details by message, at your own risk. Sample listings are fictional and labelled.'],
    actions: [{ label: 'Browse listings', to: '/universes/freemarket/listings', primary: true }, { label: 'List something', to: '/universes/freemarket/listings?new=listing' }],
  },
  {
    id: 'freeai', related: S(['freelabs', 'freelearn', 'freeresearch']),
    templates: [
      { id: 'prompt', label: 'Prompt', kind: 'text', verb: 'Share a prompt', blurb: 'A prompt or approach that worked well, and what it was for.', bodyLabel: 'The prompt and what it did', bodyRequired: true, fields: [{ key: 'for', label: 'Used for', type: 'select', options: S(['Studying', 'Writing', 'Career', 'Creativity', 'Coding', 'Planning', 'Other']), required: true }], filterField: 'for', notice: 'Don’t paste private information into shared prompts.' },
      T.question('AI question', 'Ask about AI'),
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'nova', label: 'Nova', type: 'link', to: '/ai', blurb: 'Your companion for reflection, planning and conversation.' },
      { id: 'council', label: 'AI Council', type: 'link', to: '/ai/council', blurb: 'Nine specialists for learning, careers, creativity and more.' },
      { id: 'status', label: 'What’s connected', type: 'tool', tool: 'ai-status' },
      { id: 'prompts', label: 'Prompts & questions', type: 'browse', templates: S(['prompt', 'question']) },
    ],
    limits: ['Replies are labelled demo replies until an AI provider is configured and verified. No image or video generation exists.'],
    actions: [{ label: 'Talk to Nova', to: '/ai', primary: true }, { label: 'Meet the AI Council', to: '/ai/council' }],
  },
  {
    id: 'freeresearch', related: S(['freelearn', 'freelabs', 'freeai']),
    templates: [
      { id: 'question', label: 'Research question', kind: 'question', verb: 'Ask a research question', blurb: 'Put a question to people who think about it.', titleLabel: 'Your question', titleRequired: true, bodyLabel: 'Background', fields: [{ key: 'field', label: 'Field', type: 'select', options: FIELDS, required: true }], filterField: 'field' },
      { id: 'source', label: 'Source', kind: 'resource', verb: 'Share a source', blurb: 'A paper, dataset or tool worth reading. Say why.', titleLabel: 'Title', titleRequired: true, bodyLabel: 'Why it matters', bodyRequired: true, urlLabel: 'Link', urlRequired: true, fields: [{ key: 'field', label: 'Field', type: 'select', options: FIELDS, required: true }, { key: 'type', label: 'Type', type: 'select', options: S(['Paper', 'Preprint', 'Dataset', 'Book', 'Tool', 'Talk']), required: true }, { key: 'citation', label: 'Citation (optional)', type: 'text', max: 200 }], filterField: 'field' },
      { id: 'collab', label: 'Collaboration', kind: 'text', verb: 'Look for collaborators', blurb: 'Describe the work and what kind of help would move it forward.', bodyLabel: 'The work', bodyRequired: true, fields: [{ key: 'field', label: 'Field', type: 'select', options: FIELDS, required: true }, { key: 'stage', label: 'Stage', type: 'select', options: S(['Exploring', 'Literature review', 'Collecting data', 'Analysing', 'Writing up']), required: true }], filterField: 'field', participation: { label: 'I’d collaborate', done: 'You’ve offered to collaborate', what: 'The author will see your offer and can message you.' } },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'sources', label: 'Sources', type: 'browse', templates: S(['source']) },
      { id: 'questions', label: 'Questions', type: 'browse', templates: S(['question']) },
      { id: 'collabs', label: 'Collaborations', type: 'browse', templates: S(['collab']) },
      { id: 'learn', label: 'Research in Learn', type: 'link', to: '/learn?q=research' },
    ],
    limits: ['FREEVERSE does not peer-review or fact-check what members share. Check sources yourself.'],
    actions: [{ label: 'Share a source', to: '/universes/freeresearch/sources?new=source', primary: true }, { label: 'Ask a question', to: '/universes/freeresearch/questions?new=question' }],
  },
  {
    id: 'freehealth', related: S(['freeai', 'freevolunteer', 'freeconnect']),
    templates: [
      { id: 'routine', label: 'Routine', kind: 'text', verb: 'Share a routine', blurb: 'A small habit that helps you. Personal experience only, not medical advice.', bodyLabel: 'What helps you?', bodyRequired: true, fields: [{ key: 'area', label: 'Area', type: 'select', options: S(['Sleep', 'Movement', 'Food', 'Focus', 'Stress', 'Connection']), required: true }], filterField: 'area', notice: 'This is not medical advice. Don’t share anyone’s health details but your own, and only what you’re comfortable with.' },
      { id: 'question', label: 'Question', kind: 'question', verb: 'Ask (non-medical)', blurb: 'General wellbeing questions. For symptoms or treatment, speak to a health professional.', titleLabel: 'Your question', titleRequired: true, bodyLabel: 'More detail', fields: [], notice: 'Members can’t diagnose. For anything medical, speak to a health professional.' },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'guides', label: 'Guides', type: 'tool', tool: 'wellbeing-guides' },
      { id: 'habits', label: 'Habits', type: 'link', to: '/ai/habits', blurb: 'Private habit tracking.' },
      { id: 'journal', label: 'Journal', type: 'link', to: '/ai/journal', blurb: 'A private journal.' },
      { id: 'routines', label: 'Routines', type: 'browse', templates: S(['routine']) },
      { id: 'questions', label: 'Questions', type: 'browse', templates: S(['question']) },
      { id: 'support', label: 'Get support', type: 'link', to: '/help', blurb: 'Crisis and support resources.' },
    ],
    limits: ['Not a clinical service. No diagnosis, treatment, therapy or emergency response. The wellbeing guides are general information awaiting formal health-content review.'],
    actions: [{ label: 'Wellbeing guides', to: '/universes/freehealth/guides', primary: true }, { label: 'Get support', to: '/help' }],
  },
  {
    id: 'freefinance', related: S(['freework', 'freemarket', 'freelearn']),
    templates: [
      { id: 'lesson', label: 'Money lesson', kind: 'text', verb: 'Share a money lesson', blurb: 'Something you learned about money. General education only.', bodyLabel: 'Your lesson', bodyRequired: true, fields: [{ key: 'topic', label: 'Topic', type: 'select', options: S(['Budgeting', 'Saving', 'Debt', 'Earning', 'Scholarships & funding', 'Scams', 'Other']), required: true }], filterField: 'topic', notice: 'Educational only, not financial advice. Never share account numbers, passwords or ID details.' },
      T.question('Money question', 'Ask about money'),
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'tools', label: 'Calculators', type: 'tool', tool: 'finance-tools' },
      { id: 'lessons', label: 'Lessons & questions', type: 'browse', templates: S(['lesson', 'question']) },
      { id: 'funding', label: 'Grants & scholarships', type: 'link', to: '/opportunities?kind=scholarship' },
    ],
    limits: ['Calculators run in your browser and are not saved. FREEVERSE gives education, not advice, and handles no money or accounts.'],
    actions: [{ label: 'Open the calculators', to: '/universes/freefinance/tools', primary: true }, { label: 'Find funding', to: '/opportunities' }],
  },
  {
    id: 'freemedia', related: S(['freeentertainment', 'freebuild', 'freeconnect']),
    templates: [
      { id: 'article', label: 'Article', kind: 'article', verb: 'Publish an article', blurb: 'Write something worth reading. Articles are public to members and you can edit or delete them any time.', titleLabel: 'Headline', titleRequired: true, bodyLabel: 'Article (at least 200 characters)', bodyRequired: true, images: true, fields: [{ key: 'category', label: 'Category', type: 'select', options: S(['Opinion', 'Explainer', 'Interview', 'Review', 'Story', 'Tutorial']), required: true }], filterField: 'category' },
      { id: 'creative', label: 'Creative work', kind: 'creative', verb: 'Show your work', blurb: 'Photography, illustration, design or writing. Add up to four images.', titleLabel: 'Title', titleRequired: true, bodyLabel: 'About the work', images: true, fields: [{ key: 'medium', label: 'Medium', type: 'select', options: S(['Photography', 'Illustration', 'Design', 'Writing', 'Mixed']), required: true }], filterField: 'medium' },
      { id: 'video', label: 'Video link', kind: 'video_link', verb: 'Share a video link', blurb: 'Link to a video hosted elsewhere (YouTube, Vimeo and similar). FREEVERSE doesn’t host video.', titleLabel: 'Title', titleRequired: true, bodyLabel: 'About the video', urlLabel: 'Video link', urlRequired: true, fields: [{ key: 'category', label: 'Category', type: 'select', options: S(['Short film', 'Tutorial', 'Talk', 'Music', 'Documentary', 'Other']), required: true }], filterField: 'category' },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'articles', label: 'Articles', type: 'browse', templates: S(['article']) },
      { id: 'gallery', label: 'Gallery', type: 'browse', templates: S(['creative']) },
      { id: 'video', label: 'Video links', type: 'browse', templates: S(['video']) },
      { id: 'mine', label: 'My publications', type: 'tool', tool: 'my-publications' },
    ],
    limits: ['Images are uploaded to FREEVERSE storage. Video is link-out only: no video hosting, streaming or transcoding.'],
    actions: [{ label: 'Publish an article', to: '/universes/freemedia/articles?new=article', primary: true }, { label: 'Show your work', to: '/universes/freemedia/gallery?new=creative' }],
  },
  {
    id: 'freeevents', related: S(['freeconnect', 'freevolunteer', 'freeentertainment']),
    templates: [
      { id: 'idea', label: 'Event idea', kind: 'text', verb: 'Suggest an event', blurb: 'Propose a meetup, workshop or gathering and see who would come.', bodyLabel: 'What would it be?', bodyRequired: true, fields: [{ key: 'format', label: 'Format', type: 'select', options: S(['In person', 'Online', 'Hybrid']), required: true }, { key: 'where', label: 'Where (city or “Online”)', type: 'text', max: 60 }], filterField: 'format', participation: { label: 'I’d attend', done: 'You’d attend', what: 'The author sees how many people would attend.' } },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'calendar', label: 'Events', type: 'link', to: '/events', blurb: 'Upcoming events with RSVP.' },
      { id: 'ideas', label: 'Event ideas', type: 'browse', templates: S(['idea']) },
    ],
    limits: ['Events are listings with RSVP. There is no ticketing, payments or live streaming.'],
    actions: [{ label: 'See upcoming events', to: '/events', primary: true }, { label: 'Suggest an event', to: '/universes/freeevents/ideas?new=idea' }],
  },
  {
    id: 'freevolunteer', related: S(['freeevents', 'freework', 'freehealth']),
    templates: [
      { id: 'opportunity', label: 'Volunteer opportunity', kind: 'resource', verb: 'Offer an opportunity', blurb: 'Describe a way people can help. Only post for causes and organisations you represent or know.', titleLabel: 'Role or initiative', titleRequired: true, bodyLabel: 'What will volunteers do?', bodyRequired: true, urlLabel: 'More information (optional)',
        fields: [{ key: 'organisation', label: 'Organisation or group', type: 'text', required: true, max: 80 }, { key: 'mode', label: 'Mode', type: 'select', options: S(['In person', 'Remote', 'Hybrid']), required: true }, { key: 'commitment', label: 'Commitment', type: 'select', options: S(['One-off', 'Weekly', 'Monthly', 'Flexible']), required: true }, { key: 'where', label: 'Where', type: 'text', max: 60 }, { key: 'skills', label: 'Skills helpful (optional)', type: 'text', max: 120 }], filterField: 'commitment',
        participation: { label: 'I’d like to help', done: 'You’ve offered to help', what: 'The organiser will see your name and can message you. Nothing is shared beyond that.' }, notice: 'FREEVERSE does not vouch for organisations. Check who you’re helping before you commit, and never share sensitive personal details.' },
      { id: 'story', label: 'Impact story', kind: 'text', verb: 'Share an impact story', blurb: 'What you did, and what it meant.', bodyLabel: 'Your story', bodyRequired: true, fields: [] },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'opportunities', label: 'Opportunities', type: 'browse', templates: S(['opportunity']) },
      { id: 'stories', label: 'Impact stories', type: 'browse', templates: S(['story']) },
      { id: 'listings', label: 'Volunteer roles in Opportunities', type: 'link', to: '/opportunities?kind=volunteer' },
    ],
    limits: ['No organisation verification, hour logging or certificates yet.'],
    actions: [{ label: 'Find a way to help', to: '/universes/freevolunteer/opportunities', primary: true }, { label: 'Offer an opportunity', to: '/universes/freevolunteer/opportunities?new=opportunity' }],
  },
  {
    id: 'freelabs', related: S(['freeai', 'freebuild', 'freeresearch']),
    templates: [
      { id: 'experiment', label: 'Experiment', kind: 'text', verb: 'Propose an experiment', blurb: 'An early idea to try with willing members. Say what you will learn and how long it runs.', bodyLabel: 'What are we testing, and how?', bodyRequired: true, titleLabel: 'Experiment name', titleRequired: true,
        fields: [{ key: 'status', label: 'Status', type: 'select', options: S(['Proposed', 'Recruiting', 'Running', 'Concluded']), required: true }, { key: 'duration', label: 'How long?', type: 'text', max: 40, placeholder: 'e.g. 2 weeks' }, { key: 'risk', label: 'Risks or limits', type: 'text', max: 200, placeholder: 'What could go wrong? Who is it not for?' }], filterField: 'status',
        participation: { label: 'Join this experiment', done: 'You’re in', what: 'Taking part is voluntary and you can leave any time. The author sees who joined.' }, notice: 'Experiments are community-run and unofficial. Nothing here changes FREEVERSE itself unless the Founder decides so.' },
      { id: 'result', label: 'Result', kind: 'text', verb: 'Share a result', blurb: 'What happened, including when it didn’t work.', bodyLabel: 'What did you find?', bodyRequired: true, fields: [{ key: 'outcome', label: 'Outcome', type: 'select', options: S(['It worked', 'Mixed', 'It didn’t work']), required: true }], filterField: 'outcome' },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'experiments', label: 'Experiments', type: 'browse', templates: S(['experiment']) },
      { id: 'results', label: 'Results', type: 'browse', templates: S(['result']) },
    ],
    limits: ['FreeLabs is a place to propose and join member-run experiments. It is not a software sandbox or beta-feature switch.'],
    actions: [{ label: 'See experiments', to: '/universes/freelabs/experiments', primary: true }, { label: 'Propose one', to: '/universes/freelabs/experiments?new=experiment' }],
  },
  {
    id: 'freeplay', related: S(['freeentertainment', 'freeconnect', 'freelabs']),
    templates: [
      { id: 'challenge', label: 'Challenge', kind: 'text', verb: 'Post a challenge', blurb: 'Share your score and dare others to beat it.', bodyLabel: 'Your message', bodyRequired: true, fields: [{ key: 'game', label: 'Game', type: 'select', options: GAMES.map((g) => g.name), required: true }, { key: 'score', label: 'Your score', type: 'number', min: 0, max: 1_000_000 }], filterField: 'game' },
      { id: 'game-tip', label: 'Game tip', kind: 'text', verb: 'Share a tip', blurb: 'A strategy that helped.', bodyLabel: 'Your tip', bodyRequired: true, fields: [{ key: 'game', label: 'Game', type: 'select', options: GAMES.map((g) => g.name), required: true }], filterField: 'game' },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'games', label: 'Play', type: 'tool', tool: 'games' },
      { id: 'challenges', label: 'Challenges', type: 'browse', templates: S(['challenge']) },
      { id: 'tips', label: 'Tips', type: 'browse', templates: S(['game-tip']) },
    ],
    limits: ['Four single-player games run in your browser. No multiplayer, no real-time play, no in-game purchases. Scores are self-reported by your browser, so leaderboards are for fun, not competition.'],
    actions: [{ label: 'Play now', to: '/universes/freeplay/games', primary: true }, { label: 'Post a challenge', to: '/universes/freeplay/challenges?new=challenge' }],
  },
  {
    id: 'freeentertainment', related: S(['freemedia', 'freeplay', 'freeevents']),
    templates: [
      { id: 'recommendation', label: 'Recommendation', kind: 'resource', verb: 'Recommend something', blurb: 'Tell people what to watch, hear, read or play, and why.', titleLabel: 'Title', titleRequired: true, bodyLabel: 'Why do you recommend it?', bodyRequired: true, urlLabel: 'Link (optional)',
        fields: [{ key: 'medium', label: 'Kind', type: 'select', options: MEDIA_KINDS, required: true }, { key: 'rating', label: 'Your rating', type: 'select', options: S(['5 – loved it', '4 – really good', '3 – good', '2 – mixed', '1 – not for me']), required: true }, { key: 'spoilers', label: 'Spoilers', type: 'select', options: S(['Spoiler-free', 'Contains spoilers']), required: true }, { key: 'where', label: 'Where to find it (optional)', type: 'text', max: 80 }], filterField: 'medium' },
      { id: 'watch-along', label: 'Watch-along', kind: 'event', verb: 'Host a watch-along', blurb: 'Invite people to watch or listen together at the same time, on a service of your choice.', titleLabel: 'What are you watching?', titleRequired: true, bodyLabel: 'Details', needsStart: true, urlLabel: 'Meeting or stream link (optional)', fields: [{ key: 'medium', label: 'Kind', type: 'select', options: MEDIA_KINDS, required: true }], filterField: 'medium',
        participation: { label: 'I’m in', done: 'You’re in', what: 'The host sees how many are joining.' }, notice: 'FREEVERSE doesn’t stream content or host calls. You watch on your own service and chat here.' },
    ],
    spaces: [
      { id: 'overview', label: 'Overview', type: 'overview' },
      { id: 'recommendations', label: 'Recommendations', type: 'browse', templates: S(['recommendation']) },
      { id: 'watch-alongs', label: 'Watch-alongs', type: 'browse', templates: S(['watch-along']) },
      { id: 'play', label: 'Play instead', type: 'link', to: '/universes/freeplay/games' },
    ],
    limits: ['A discovery and discussion space, not a streaming product. No licensed content is hosted.'],
    actions: [{ label: 'Browse recommendations', to: '/universes/freeentertainment/recommendations', primary: true }, { label: 'Recommend something', to: '/universes/freeentertainment/recommendations?new=recommendation' }],
  },
];

export const specFor = (universe: string): UniverseSpec | undefined => UNIVERSE_SPECS.find((u) => u.id === universe);
export const templateFor = (universe: string, templateId: string): Template | undefined => specFor(universe)?.templates.find((t) => t.id === templateId);

export type MetaValue = string | number;
export interface MetaResult { ok: boolean; meta: Record<string, MetaValue>; errors: Record<string, string> }

/** Checks a template's structured fields. Unknown keys are rejected; select values must be among the options. Pure, used by server and client. */
export function validateMeta(t: Template, input: Record<string, unknown> | undefined): MetaResult {
  const src = input ?? {}; const errors: Record<string, string> = {}; const meta: Record<string, MetaValue> = {};
  for (const k of Object.keys(src)) if (!t.fields.some((f) => f.key === k)) errors[k] = 'Unknown field.';
  for (const f of t.fields) {
    const raw = src[f.key];
    const empty = raw === undefined || raw === null || raw === '';
    if (empty) { if (f.required) errors[f.key] = `${f.label}: please choose or enter a value.`; continue; }
    if (f.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) errors[f.key] = `${f.label}: enter a number${f.min !== undefined ? ` from ${f.min}` : ''}${f.max !== undefined ? ` to ${f.max}` : ''}.`; else meta[f.key] = n;
      continue;
    }
    if (typeof raw !== 'string') { errors[f.key] = `${f.label}: invalid value.`; continue; }
    const v = raw.trim().replace(/\s+/g, ' ');
    if (f.type === 'select') { if (!f.options?.includes(v)) errors[f.key] = `${f.label}: choose one of the options.`; else meta[f.key] = v; continue; }
    if (v.length > (f.max ?? (f.type === 'textarea' ? 600 : 120))) { errors[f.key] = `${f.label}: too long.`; continue; }
    meta[f.key] = v;
  }
  return { ok: Object.keys(errors).length === 0, meta, errors };
}
