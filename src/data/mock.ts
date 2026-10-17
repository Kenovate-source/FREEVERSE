/**
 * MOCK DATA — Stage 1 only. Every person, organisation, listing and event here is fictional.
 * Nothing in this file represents real members, real opportunities, or real events.
 */
import type { Conversation, EventItem, LearnItem, Mentor, Opportunity, Post, PublicUser } from '../types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (now: number, deltaMs: number) => new Date(now + deltaMs).toISOString();

export const INTERESTS = [
  'Design', 'Software', 'Writing', 'Data', 'Entrepreneurship', 'Science', 'Music', 'Film & TV',
  'Career growth', 'Public speaking', 'Wellbeing habits', 'Community building', 'Languages', 'Volunteering',
];
export const GOALS = [
  'Land a first internship', 'Find a mentor', 'Learn a new skill', 'Meet people who share my interests',
  'Find scholarships or grants', 'Build a portfolio', 'Prepare for interviews', 'Build healthier habits',
];

export const MEMBERS: PublicUser[] = [
  { id: 'u_demo_ada', handle: 'ada.okafor', displayName: 'Ada Okafor', bio: 'Product design student. Learning to build things people actually need.', interests: ['Design', 'Writing', 'Career growth'], hue: 0, joinedAt: '2026-08-01T09:00:00.000Z' },
  { id: 'm_tunde', handle: 'tunde.bello', displayName: 'Tunde Bello', bio: 'Self-taught developer. Currently wrestling with TypeScript and winning, slowly.', interests: ['Software', 'Entrepreneurship'], hue: 1, joinedAt: '2026-08-03T09:00:00.000Z' },
  { id: 'm_mira', handle: 'mira.chen', displayName: 'Mira Chen', bio: 'Biology undergrad, aspiring science communicator.', interests: ['Science', 'Writing', 'Public speaking'], hue: 2, joinedAt: '2026-08-05T09:00:00.000Z' },
  { id: 'm_sam', handle: 'sam.rivera', displayName: 'Sam Rivera', bio: 'Community organiser. Big on small rooms and good conversation.', interests: ['Community building', 'Volunteering', 'Music'], hue: 3, joinedAt: '2026-08-06T09:00:00.000Z' },
  { id: 'm_priya', handle: 'priya.nair', displayName: 'Priya Nair', bio: 'Data analyst trainee. Spreadsheets are a love language.', interests: ['Data', 'Career growth'], hue: 4, joinedAt: '2026-08-09T09:00:00.000Z' },
  { id: 'm_kofi', handle: 'kofi.mensah', displayName: 'Kofi Mensah', bio: 'Film nerd. Keeps a running list of things worth watching twice.', interests: ['Film & TV', 'Writing', 'Languages'], hue: 5, joinedAt: '2026-08-12T09:00:00.000Z' },
  { id: 'm_lena', handle: 'lena.fischer', displayName: 'Lena Fischer', bio: 'Learning Portuguese one awkward conversation at a time.', interests: ['Languages', 'Wellbeing habits'], hue: 1, joinedAt: '2026-08-15T09:00:00.000Z' },
];

export function seedPosts(now: number): Post[] {
  const p = (id: string, authorId: string, mins: number, body: string, reactions: number, comments: number): Post => ({
    id, authorId, body, createdAt: at(now, -mins * MIN), reactions, comments,
  });
  return [
    p('p1', 'm_mira', 6, 'Gave my first ever 5-minute talk to a room of strangers today. My hands shook for the first minute, then I forgot to be scared. If you have been putting off speaking up somewhere: this is your sign. #publicspeaking', 24, 6),
    p('p2', 'm_tunde', 38, 'Question for people further along: how did you decide which ONE skill to go deep on first? I keep starting new tutorials and finishing none of them.', 11, 9),
    p('p3', 'm_sam', 95, 'Small-rooms-over-big-feeds is my whole philosophy. Running a tiny monthly meetup for people new to our city. Eight people showed up last time and it was the best night of my month. #community', 31, 4),
    p('p4', 'u_demo_ada', 180, 'Rewrote my portfolio intro three times today. The version that finally worked was the one that sounded like how I actually talk. Funny how that goes.', 17, 3),
    p('p5', 'm_priya', 340, 'Tip for anyone staring at a job listing and wondering if they qualify: read it as a wish list, not a checklist. Apply if you meet about 60% and can explain how you would learn the rest. #careers', 52, 14),
    p('p6', 'm_kofi', 610, 'Rewatched an old favourite and noticed something completely new in the second act. What is a film you think rewards a second viewing?', 9, 12),
    p('p7', 'm_lena', 1260, 'Day 41 of learning Portuguese. Ordered coffee entirely in Portuguese today and the barista answered in English. We both laughed. I will take it as a win.', 38, 7),
    p('p8', 'm_mira', 2900, 'Reminder that "I don\'t know yet" is a complete and respectable answer to most questions in your early twenties.', 66, 10),
  ];
}

export const LEARN: LearnItem[] = [
  {
    id: 'l-cv-first', type: 'article', title: 'Your first CV when you have no “experience”', category: 'Careers', minutes: 6, level: 'Starter',
    summary: 'Turn coursework, volunteering and side projects into a CV that earns a second look.',
    body: [
      'Employers hiring for entry-level roles are not looking for a long history. They are looking for evidence that you can learn, follow through and work with other people.',
      'Start with a short summary of who you are and what you are aiming for. Then list projects, volunteering and coursework the way you would list jobs: what you did, what changed because of it, and what you used to do it.',
      'Use plain verbs and real numbers where you have them. "Organised a monthly meetup of 8 people" says more than "good at teamwork".',
      'Keep it to one page. Ask one person you trust to read it cold and tell you what stood out. That reader is your best editor.',
    ],
  },
  {
    id: 'l-spot-scams', type: 'article', title: 'Spotting scam job and scholarship listings', category: 'Careers', minutes: 5, level: 'Starter',
    summary: 'Five warning signs, and what to do before you share any personal details.',
    body: [
      'Real opportunities rarely ask you to pay to apply, and they do not pressure you to decide within hours.',
      'Warning signs: fees for "processing" or "training"; requests for bank details or ID before any interview; vague employer details; free-email contact addresses; offers that arrive before you applied.',
      'Before sharing anything personal, find the organisation through a source you trust, not the link in the message, and check that the contact details match.',
      'If something feels off, pause. You can ask a friend, a mentor, or report the listing. Missing one opportunity costs less than losing money or your identity.',
    ],
  },
  {
    id: 'l-talk-5min', type: 'video', title: 'Giving a five-minute talk without freezing', category: 'Communication', minutes: 9, level: 'Starter',
    summary: 'A practical walkthrough: structure, pacing, and what to do with your hands.',
    body: ['This is a placeholder for a short video lesson. No video is attached in the Stage 1 prototype.'],
  },
  {
    id: 'l-spreadsheets', type: 'video', title: 'Spreadsheets for people who avoid spreadsheets', category: 'Data', minutes: 14, level: 'Starter',
    summary: 'Sort, filter and summarise a small dataset in one sitting.',
    body: ['This is a placeholder for a short video lesson. No video is attached in the Stage 1 prototype.'],
  },
  {
    id: 'l-mentor-ask', type: 'article', title: 'How to ask a mentor for an introduction', category: 'Mentorship', minutes: 4, level: 'Growing',
    summary: 'What to say, what to leave out, and how to make a first conversation easy to say yes to.',
    body: [
      'Be specific. "Can you mentor me?" is a big ask. "Could we talk for 20 minutes about how you moved from design into product?" is easy to answer.',
      'Say why this person: one sentence showing you know their work. Say what you hope to learn, and what you will do with it.',
      'Offer an easy way to say no. Mentors are generous with time when they never feel cornered.',
    ],
  },
  {
    id: 'l-path-portfolio', type: 'path', title: 'Path: Build your first portfolio', category: 'Careers', minutes: 45, level: 'Growing',
    summary: 'Four short steps from "I have nothing to show" to a portfolio you are proud to share.',
    steps: [
      { title: 'Choose two projects worth showing' },
      { title: 'Write each as a short story: problem, approach, result' },
      { title: 'Learn to talk about your work out loud', itemId: 'l-talk-5min' },
      { title: 'Get one person to review it', itemId: 'l-mentor-ask' },
    ],
  },
  {
    id: 'l-path-job-ready', type: 'path', title: 'Path: Get ready to apply', category: 'Careers', minutes: 30, level: 'Starter',
    summary: 'A CV, a safety check and a plan for your first five applications.',
    steps: [
      { title: 'Draft your first CV', itemId: 'l-cv-first' },
      { title: 'Learn to spot scam listings', itemId: 'l-spot-scams' },
      { title: 'Shortlist five opportunities that fit you' },
    ],
  },
];

export function seedOpportunities(now: number): Opportunity[] {
  const o = (id: string, type: Opportunity['type'], title: string, organization: string, summary: string, category: string, location: string, days: number): Opportunity => ({
    id, type, title, organization, summary, category, location, deadline: at(now, days * DAY),
  });
  return [
    o('o1', 'scholarship', 'Horizon Undergraduate Scholarship', 'Meridian Foundation (fictional)', 'Tuition support for first- and second-year students pursuing design, science or technology degrees.', 'Education', 'Open to all countries', 24),
    o('o2', 'internship', 'Summer Design Internship', 'Lantern Studio (fictional)', 'Ten-week paid internship working alongside a small product design team. Portfolio required.', 'Design', 'Remote', 12),
    o('o3', 'grant', 'Community Spark Micro-grant', 'Common Ground Trust (fictional)', 'Small grants for young organisers running neighbourhood projects. No prior funding required.', 'Community', 'Local projects', 40),
    o('o4', 'entry_level_job', 'Junior Data Analyst', 'Northwind Analytics (fictional)', 'Entry-level role cleaning, summarising and presenting datasets for small clients. Training provided.', 'Data', 'Hybrid', 9),
    o('o5', 'internship', 'Editorial Assistant Internship', 'The Open Page (fictional)', 'Support a small editorial team with research, fact-checking and drafting. Writing sample required.', 'Writing', 'Remote', 18),
    o('o6', 'scholarship', 'Women in STEM Travel Award', 'Aurora Science Society (fictional)', 'Covers travel costs to attend one academic or industry conference.', 'Science', 'Open to all countries', 33),
    o('o7', 'entry_level_job', 'Community Programmes Coordinator', 'Bridgeway Youth Network (fictional)', 'Coordinate workshops and volunteers for a youth programme. Experience volunteering is a plus.', 'Community', 'On site', 6),
  ];
}

export const MENTORS: Mentor[] = [
  { id: 'mt1', name: 'Dr. Amara Eze', headline: 'Research scientist and former first-gen student', bio: 'Fifteen years in applied research. Enjoys helping people navigate graduate applications and early research careers.', expertise: ['Science', 'Graduate study', 'Research careers'], availability: 'About one conversation a month, evenings.', hue: 2 },
  { id: 'mt2', name: 'Jordan Reyes', headline: 'Product designer, startup and agency', bio: 'Has hired and mentored junior designers. Happy to review portfolios and talk about breaking into design.', expertise: ['Design', 'Portfolios', 'Career growth'], availability: 'Weekends, short calls.', hue: 0 },
  { id: 'mt3', name: 'Chidi Nwosu', headline: 'Engineering manager', bio: 'Moved from self-taught to lead. Good for learning paths, interviews and picking your first stack.', expertise: ['Software', 'Interviews', 'Learning paths'], availability: 'Two slots a month.', hue: 1 },
  { id: 'mt4', name: 'Hannah Lindqvist', headline: 'Community and nonprofit lead', bio: 'Built volunteer programmes from nothing. Offers practical advice on organising and fundraising.', expertise: ['Community building', 'Volunteering', 'Entrepreneurship'], availability: 'Weekday lunchtimes.', hue: 3 },
];

export function seedEvents(now: number): EventItem[] {
  const e = (id: string, title: string, description: string, days: number, hour: number, durH: number, format: EventItem['format'], where: string, going: number): EventItem => {
    const start = new Date(now + days * DAY);
    start.setUTCHours(hour, 0, 0, 0);
    return { id, title, description, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + durH * HOUR).toISOString(), format, where, going };
  };
  return [
    e('e1', 'Portfolio Clinic: bring a draft, leave with a plan', 'Small-group feedback from working designers and developers. Bring something unfinished.', 3, 17, 2, 'virtual', 'Video call (link shared after RSVP)', 42),
    e('e2', 'First Applications Workshop', 'Draft a CV and shortlist five opportunities in one session, with a scam-spotting primer.', 6, 15, 2, 'virtual', 'Video call (link shared after RSVP)', 67),
    e('e3', 'Neighbourhood Meetup: new in town', 'A relaxed evening for people new to the area. Conversation prompts provided, pressure not.', 9, 18, 3, 'in_person', 'Community hall, central district', 18),
    e('e4', 'Ask a Mentor: Careers in science', 'Open Q&A with two mentors from research and industry. Submit questions in advance.', 14, 16, 1, 'virtual', 'Video call (link shared after RSVP)', 54),
    e('e5', 'Volunteer Day: park clean-up', 'Half a day of practical work, snacks included. Gloves provided.', 21, 9, 4, 'in_person', 'City Park, north entrance', 31),
  ];
}

export const CONVERSATIONS: Conversation[] = [
  { id: 'c1', name: 'Mira Chen', preview: 'That talk tip was exactly what I needed, thank you!', time: '12m', unread: 2, hue: 2 },
  { id: 'c2', name: 'Portfolio buddies (group)', preview: 'Sam: anyone free Thursday evening for a review swap?', time: '1h', unread: 0, hue: 3 },
  { id: 'c3', name: 'Tunde Bello', preview: 'Which course did you finish in the end?', time: 'Yesterday', unread: 0, hue: 1 },
  { id: 'c4', name: 'Priya Nair', preview: 'Sent you the spreadsheet template.', time: 'Mon', unread: 0, hue: 4 },
];

/** Scripted, non-AI replies for the Nova mock. Each is deliberately generic, non-diagnostic and non-clinical. */
export const NOVA_SCRIPT = {
  intro: 'Hi, I’m Nova. In this prototype my replies are scripted, so I can show you how the conversation will feel, but I’m not a real AI yet. What would you like to think through today?',
  learn: 'It sounds like you want to build a skill. A good first step is picking one small thing to practise for 20 minutes. There’s a short path in Learn called “Get ready to apply” you could start with. What would make today’s 20 minutes feel worthwhile?',
  opportunities: 'Looking for the right opportunity can feel like a lot. One approach: shortlist three that genuinely fit you, and check each one using the “Spotting scam listings” article before you share any details. Want to talk through what “fits” means for you?',
  mentor: 'Asking for help is a real skill. The Mentors tab lists people you can request an introduction to. Before you do, it can help to write down the one specific question you’d most like answered. What’s yours?',
  generic: 'Thanks for sharing that. Can you tell me a bit more about what’s on your mind, and what a good outcome would look like for you? I can help you break it down into a first small step.',
};
