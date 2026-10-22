// Demo catalogue. Everything here is flagged is_demo and shown as illustrative in the UI: it is not a live catalogue,
// and no organisation, mentor or deadline listed is real. Generated deterministically so tests are stable.
import type { Services } from '../services';
import { uuid } from '../db';
import type { LearnBlock, LearnFormat } from '../../shared/api/catalog';

type L = { f: LearnFormat; t: string; s: string; c: string; lv?: string; m?: number; tags?: string[]; body?: LearnBlock[] };
const P = (text: string): LearnBlock => ({ t: 'p', text });
const H = (text: string): LearnBlock => ({ t: 'h', text });
const LIST = (...items: string[]): LearnBlock => ({ t: 'list', items });
const Q = (id: string, prompt: string, options: string[], answer: number, explain: string): LearnBlock => ({ t: 'question', id, prompt, options, answer, explain });

export const LEARN: L[] = [
  { f: 'article', t: 'Study habits that survive a bad week', s: 'Small routines you can keep when everything else is messy.', c: 'Study skills', m: 6, tags: ['study-skills'], body: [P('Consistency beats intensity. The goal is a routine small enough that a bad week cannot break it.'), H('Three habits to try'), LIST('Pick one fixed start time and a 25-minute first block.', 'Decide tomorrow’s first task before you stop today.', 'Keep a “minimum day”: the smallest version that still counts.'), P('Try one for a week. If it does not fit, change it. That is the method, not a failure.')] },
  { f: 'article', t: 'How to read a research paper without panic', s: 'A three-pass method for getting what you need.', c: 'Research', lv: 'intermediate', m: 8, tags: ['research-methods'], body: [P('Read in passes: title and abstract, then figures and conclusions, then the methods only if you need them.'), LIST('Pass one: what is the claim?', 'Pass two: what is the evidence?', 'Pass three: would I trust this method?')] },
  { f: 'article', t: 'Writing a first CV when you have no experience', s: 'Show evidence, not job titles.', c: 'Careers', m: 7, tags: ['careers', 'cv'], body: [P('Projects, volunteering, coursework and responsibilities all count as evidence. Describe what you did and what changed because of it.')] },
  { f: 'article', t: 'Sleep, screens and focus: what the evidence says', s: 'Practical, non-clinical, with the limits stated.', c: 'Wellbeing', m: 6, tags: ['wellbeing'], body: [P('This is general information, not medical advice. If something is affecting your health, talk to a qualified professional.')] },
  { f: 'article', t: 'Money basics for your first pay cheque', s: 'Budgeting, tax and saving, explained simply.', c: 'Money', m: 9, tags: ['money'], body: [P('General education, not financial advice. Rules differ by country; check official sources for yours.')] },
  { f: 'article', t: 'Giving feedback that helps', s: 'Specific, kind, and useful.', c: 'Communication', m: 5, tags: ['feedback'] },
  { f: 'video', t: 'Pomodoro in practice (animated explainer)', s: 'A short walk-through of focused blocks and breaks.', c: 'Study skills', m: 4, tags: ['study-skills'], body: [P('Demo placeholder: this entry describes a video. No media file is bundled in the demo catalogue.')] },
  { f: 'video', t: 'Pitching in 90 seconds', s: 'Structure for a clear, short pitch.', c: 'Startups', m: 5, tags: ['startups'] },
  { f: 'video', t: 'First steps in Git', s: 'Commits, branches and why they matter.', c: 'Technology', lv: 'beginner', m: 12, tags: ['web-dev'] },
  { f: 'infographic', t: 'The research process on one page', s: 'From question to write-up.', c: 'Research', m: 3, tags: ['research-methods'], body: [{ t: 'step', title: '1 · Question', text: 'Make it specific and answerable.' }, { t: 'step', title: '2 · Review', text: 'Find what is already known.' }, { t: 'step', title: '3 · Method', text: 'Choose how you will find out.' }, { t: 'step', title: '4 · Analyse', text: 'Let the data answer, not your hopes.' }, { t: 'step', title: '5 · Share', text: 'Write it so others can check you.' }] },
  { f: 'infographic', t: 'Interview answers: the STAR shape', s: 'Situation, Task, Action, Result.', c: 'Careers', m: 2, tags: ['interviews'], body: [{ t: 'step', title: 'Situation', text: 'One sentence of context.' }, { t: 'step', title: 'Task', text: 'What you were responsible for.' }, { t: 'step', title: 'Action', text: 'What you did, specifically.' }, { t: 'step', title: 'Result', text: 'What changed, with a number if you can.' }] },
  { f: 'visual', t: 'Colour and contrast, at a glance', s: 'Why accessible contrast helps everyone.', c: 'Design', m: 3, tags: ['design'], body: [{ t: 'stat', value: '4.5 : 1', label: 'Minimum contrast for normal text (WCAG AA)' }, { t: 'stat', value: '3 : 1', label: 'Minimum for large text and interface parts' }] },
  { f: 'visual', t: 'How a startup idea becomes a business', s: 'A map of the early stages.', c: 'Startups', m: 3, tags: ['startups'] },
  { f: 'audio', t: 'Talking about money without shame (audio essay)', s: 'A calm listen on a tricky subject.', c: 'Money', m: 14, tags: ['money'], body: [P('Demo placeholder: audio entries describe the piece; no audio file is bundled in the demo catalogue.')] },
  { f: 'audio', t: 'Notes on finishing things', s: 'A short audio reflection on follow-through.', c: 'Creativity', m: 9, tags: ['creativity'] },
  { f: 'tutorial', t: 'Build a personal site in an afternoon', s: 'HTML, CSS and a little JavaScript, step by step.', c: 'Technology', lv: 'beginner', m: 90, tags: ['web-dev'], body: [{ t: 'step', title: 'Plan the pages', text: 'Home, about and a project list is enough.' }, { t: 'step', title: 'Write the HTML', text: 'Use headings and landmarks.' }, { t: 'step', title: 'Style it', text: 'Start with spacing and type before colour.' }, { t: 'step', title: 'Check it', text: 'Test with the keyboard only, and on a phone.' }] },
  { f: 'tutorial', t: 'Spreadsheet formulas that save hours', s: 'Lookups, filters and clean-up.', c: 'Technology', lv: 'intermediate', m: 40, tags: ['data'] },
  { f: 'tutorial', t: 'Edit a short video with free tools', s: 'Cuts, captions, export.', c: 'Creativity', lv: 'beginner', m: 60, tags: ['video'] },
  { f: 'course', t: 'Foundations of academic writing', s: 'Structure, argument and citation in four modules.', c: 'Writing', lv: 'beginner', m: 240, tags: ['writing', 'academic-writing'], body: [P('Four modules: argument, structure, evidence, citation. Demo outline; the lessons are summaries.')] },
  { f: 'course', t: 'Intro to data and statistics', s: 'Think clearly about numbers.', c: 'Data', lv: 'beginner', m: 300, tags: ['statistics', 'data'] },
  { f: 'course', t: 'Start a small business: first 90 days', s: 'Validate, price, and find your first customers.', c: 'Startups', lv: 'intermediate', m: 280, tags: ['startups', 'validation'] },
  { f: 'course', t: 'Communicating across cultures', s: 'Clarity, context and translation.', c: 'Communication', lv: 'all', m: 180, tags: ['communication'] },
  { f: 'quiz', t: 'Quick check: spotting reliable sources', s: 'Five questions.', c: 'Research', m: 5, tags: ['research-methods'], body: [Q('q1', 'Which is the strongest sign a source is reliable?', ['It is widely shared', 'It cites checkable evidence', 'It is written confidently', 'It is recent'], 1, 'Checkable evidence lets you verify the claim yourself; popularity and confidence do not.'), Q('q2', 'A claim appears on only one blog. What first?', ['Share it', 'Look for independent sources', 'Ignore it forever', 'Trust it if it sounds right'], 1, 'Independent corroboration is the first check.'), Q('q3', 'A study has a tiny sample. What does that change?', ['Nothing', 'How confident you can be', 'Whether it is true', 'Its publication date'], 1, 'Small samples make results less certain, not automatically false.')] },
  { f: 'quiz', t: 'Quick check: budgeting basics', s: 'Four questions.', c: 'Money', m: 4, tags: ['money'], body: [Q('q1', 'What is a budget mainly for?', ['Restricting fun', 'Deciding where money goes on purpose', 'Impressing others', 'Avoiding tax'], 1, 'A budget is a plan you choose, not a punishment.'), Q('q2', 'Which usually comes first?', ['Spending', 'Saving a small fixed amount', 'Investing everything', 'Ignoring bills'], 1, 'Paying yourself first, even a little, builds the habit.')] },
  { f: 'quiz', t: 'Quick check: privacy settings', s: 'Four questions about your own controls.', c: 'Digital life', m: 4, tags: ['privacy'], body: [Q('q1', 'On FREEVERSE, who can see a field set to “Only me”?', ['Everyone', 'Members', 'Only you', 'Moderators'], 2, 'Only you. Moderators do not get to read it.')] },
  { f: 'challenge', t: '7-day creative challenge', s: 'One small prompt a day.', c: 'Creativity', m: 70, tags: ['creativity'], body: [{ t: 'step', title: 'Day 1', text: 'Make something in five minutes.' }, { t: 'step', title: 'Day 2', text: 'Make it with your non-dominant hand.' }, { t: 'step', title: 'Day 3', text: 'Copy a style you admire, then change one rule.' }, { t: 'step', title: 'Day 4', text: 'Use only three colours or notes.' }, { t: 'step', title: 'Day 5', text: 'Share one piece with feedback requested.' }, { t: 'step', title: 'Day 6', text: 'Remake your favourite piece smaller.' }, { t: 'step', title: 'Day 7', text: 'Choose one to keep working on.' }] },
  { f: 'challenge', t: '30-day study streak (gentle edition)', s: 'Minimum days count.', c: 'Study skills', m: 300, tags: ['study-skills', 'habits'] },
  { f: 'challenge', t: 'Build in public: ship one small thing', s: 'Scope small, finish, show.', c: 'Startups', m: 240, tags: ['startups', 'web-dev'] },
  { f: 'project', t: 'Design a community survey', s: 'Ask good questions, then analyse them.', c: 'Research', lv: 'intermediate', m: 180, tags: ['research-methods', 'data'] },
  { f: 'project', t: 'Build a habit tracker', s: 'A small app with real data.', c: 'Technology', lv: 'intermediate', m: 300, tags: ['web-dev'] },
  { f: 'project', t: 'Write a short story, start to finish', s: 'Plan, draft, revise.', c: 'Writing', lv: 'all', m: 360, tags: ['writing'] },
  { f: 'reading_list', t: 'Starting out in research: ten reads', s: 'A curated list of accessible starting points.', c: 'Research', m: 0, tags: ['research-methods'], body: [P('Demo list. Titles are illustrative placeholders describing types of reading rather than real publications.'), LIST('A guide to forming a research question', 'An accessible introduction to statistics', 'A paper-reading guide', 'A style guide for academic writing')] },
  { f: 'reading_list', t: 'Books on making and ideas', s: 'For creators.', c: 'Creativity', m: 0, tags: ['creativity'] },
  { f: 'reading_list', t: 'Leading communities well', s: 'For community leaders.', c: 'Community', m: 0, tags: ['community-building'] },
  { f: 'research', t: 'How young adults use social platforms (summary)', s: 'A plain-language demo summary with limits stated.', c: 'Research', lv: 'intermediate', m: 10, tags: ['research-methods'], body: [P('Demo content: an illustration of how research summaries appear in Learn. It is not a real study.')] },
  { f: 'research', t: 'What makes online communities feel safe', s: 'A demo literature overview.', c: 'Community', lv: 'intermediate', m: 10, tags: ['community-building'] },
  { f: 'download', t: 'Weekly planner (printable)', s: 'A one-page planner you can print.', c: 'Study skills', m: 0, tags: ['study-skills'], body: [P('Demo placeholder: no file is bundled with the demo catalogue.')] },
  { f: 'download', t: 'Interview preparation checklist', s: 'A short checklist.', c: 'Careers', m: 0, tags: ['interviews'] },
  { f: 'download', t: 'Project brief template', s: 'Scope a project on one page.', c: 'Startups', m: 0, tags: ['startups'] },
  { f: 'book', t: 'Short books on focus (reading guide)', s: 'Summaries and discussion questions.', c: 'Study skills', m: 0, tags: ['study-skills'] },
  { f: 'book', t: 'Classic essays on freedom and responsibility (guide)', s: 'Public-domain reading with prompts.', c: 'Humanities', lv: 'intermediate', m: 0, tags: ['humanities'] },
];

const PATHS: { t: string; s: string; c: string; tags: string[]; items: string[] }[] = [
  { t: 'Start strong: learning to learn', s: 'A path of habits, notes and review.', c: 'Study skills', tags: ['study-skills'], items: ['Study habits that survive a bad week', 'Pomodoro in practice (animated explainer)', 'Quick check: spotting reliable sources', '7-day creative challenge'] },
  { t: 'Your first job search', s: 'CV, interviews, tracking and asking for help.', c: 'Careers', tags: ['careers'], items: ['Writing a first CV when you have no experience', 'Interview answers: the STAR shape', 'Interview preparation checklist'] },
  { t: 'Research foundations', s: 'From question to reading to writing.', c: 'Research', tags: ['research-methods'], items: ['The research process on one page', 'How to read a research paper without panic', 'Foundations of academic writing', 'Starting out in research: ten reads'] },
  { t: 'Start building', s: 'From idea to a shipped thing.', c: 'Startups', tags: ['startups'], items: ['Pitching in 90 seconds', 'How a startup idea becomes a business', 'Build in public: ship one small thing', 'Project brief template'] },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
const ART = ['#4f9dff', '#a58bff', '#6ff0cf', '#f7b2ff', '#ffd36b', '#ff9b6b', '#5fd0ff', '#7be0a8'];

const OPPS = [
  ['scholarship', 'Open Minds Undergraduate Scholarship', 'Illustrative Foundation', 'A demo scholarship for first-generation students. Illustrative entry; not a real offer.', 'Education', 'remote', 'Any', 60],
  ['scholarship', 'STEM Futures Bursary', 'Illustrative Trust', 'Demo bursary for students in science and technology.', 'Technology', 'remote', 'Any', 45],
  ['scholarship', 'Creative Arts Award', 'Demo Arts Council', 'Demo award for emerging creative practitioners.', 'Creativity', 'remote', 'Any', 75],
  ['internship', 'Summer data internship', 'Example Analytics Ltd', 'Demo placement: dashboards, spreadsheets and a mentor. Illustrative only.', 'Data', 'hybrid', 'Lagos', 30],
  ['internship', 'Community media intern', 'Example Media Co-op', 'Demo placement in a small media co-operative.', 'Media', 'remote', 'Remote', 50],
  ['internship', 'Product design internship', 'Sample Studio', 'Demo placement with a design team.', 'Design', 'on_site', 'London', 40],
  ['grant', 'Youth Community Project Grant', 'Illustrative Community Fund', 'Demo micro-grants for community projects led by young adults.', 'Community', 'remote', 'Any', 90],
  ['grant', 'First Venture Micro-grant', 'Demo Startup Trust', 'Demo seed grant for early ventures.', 'Startups', 'remote', 'Any', 80],
  ['entry_level_job', 'Junior support analyst', 'Sample Services Inc', 'Demo entry-level role. Illustrative listing.', 'Technology', 'hybrid', 'Nairobi', 20],
  ['entry_level_job', 'Marketing assistant', 'Example Retail', 'Demo entry-level role.', 'Marketing', 'on_site', 'Accra', 25],
  ['entry_level_job', 'Junior developer', 'Demo Software House', 'Demo role for early-career developers.', 'Technology', 'remote', 'Remote', 35],
  ['fellowship', 'Emerging Researchers Fellowship', 'Illustrative Institute', 'Demo fellowship for early-career researchers.', 'Research', 'hybrid', 'Any', 100],
  ['fellowship', 'Civic Technology Fellowship', 'Demo Civic Lab', 'Demo fellowship in public-interest technology.', 'Technology', 'remote', 'Any', 70],
  ['competition', 'Global Student Pitch Competition', 'Example Challenge Network', 'Demo pitch competition for student founders.', 'Startups', 'remote', 'Any', 55],
  ['competition', 'Short story prize', 'Demo Writers Circle', 'Demo prize for new writers.', 'Writing', 'remote', 'Any', 65],
  ['volunteer', 'Weekend tutoring volunteer', 'Illustrative Learning Club', 'Demo volunteering: help school students with homework.', 'Education', 'hybrid', 'Local', 15],
  ['volunteer', 'Community garden helper', 'Example Green Network', 'Demo volunteering, outdoors, flexible.', 'Environment', 'on_site', 'Local', 21],
  ['volunteer', 'Remote translator for an NGO', 'Demo Aid Group', 'Demo skills-based volunteering.', 'Communication', 'remote', 'Remote', 40],
] as const;

const MENTORS = [
  ['Demo mentor · Amara', 'Product designer, early-career coaching', 'Fictional demo profile. Mentors in the demo directory are illustrative; no one real is represented.', ['Design', 'Careers', 'Portfolios'], 'Available one hour a month'],
  ['Demo mentor · Kofi', 'Software engineer, open-source maintainer', 'Fictional demo profile.', ['Technology', 'Open source', 'Interviews'], 'A few chats a month'],
  ['Demo mentor · Lena', 'Researcher in public health', 'Fictional demo profile.', ['Research', 'Writing', 'Grants'], 'One chat a month'],
  ['Demo mentor · Tunde', 'Founder, two small ventures', 'Fictional demo profile.', ['Startups', 'Validation', 'Pitching'], 'Occasional questions'],
  ['Demo mentor · Mei', 'Teacher and curriculum writer', 'Fictional demo profile.', ['Teaching', 'Study skills', 'Communication'], 'A few chats a month'],
  ['Demo mentor · Sam', 'Community manager', 'Fictional demo profile.', ['Community', 'Moderation', 'Events'], 'One chat a month'],
] as const;

const EVENTS: [string, string, string, 'virtual' | 'in_person' | 'hybrid', string | null, number, number][] = [
  ['Study skills workshop', 'Hands-on session on routines and focus. Demo event.', 'Study skills', 'virtual', null, 9, 90],
  ['Portfolio review night', 'Bring work, get kind, specific feedback. Demo event.', 'Creativity', 'virtual', null, 14, 120],
  ['Intro to open source', 'Make your first contribution together. Demo event.', 'Technology', 'virtual', null, 18, 120],
  ['Career conversations', 'Early-career professionals answer your questions. Demo event.', 'Careers', 'hybrid', 'Lagos and online', 21, 90],
  ['Community meetup', 'Casual meet-up for members in the same city. Demo event.', 'Community', 'in_person', 'City library (example)', 25, 150],
  ['Pitch practice', 'Practice a three-minute pitch in a safe room. Demo event.', 'Startups', 'virtual', null, 28, 90],
  ['Game night', 'Cosy and competitive games. Demo event.', 'Gaming', 'virtual', null, 7, 150],
  ['Volunteer day', 'A morning of helping out locally. Demo event.', 'Volunteering', 'in_person', 'Community hall (example)', 35, 240],
  ['Research methods clinic', 'Bring a question and a method puzzle. Demo event.', 'Research', 'virtual', null, 12, 90],
  ['Wellbeing and boundaries (non-clinical)', 'A discussion, not therapy. Demo event.', 'Wellbeing', 'virtual', null, 30, 75],
];

export async function seedCatalog(s: Services): Promise<void> {
  const { db } = s;
  if (await db.get('SELECT 1 AS x FROM learn_items LIMIT 1')) return;
  const now = s.now();
  const ids = new Map<string, string>();
  let i = 0;
  for (const l of LEARN) {
    const id = uuid(); ids.set(l.t, id);
    await db.run('INSERT INTO learn_items (id, slug, format, title, summary, body, category, level, minutes, art, tags, is_demo, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [id, slug(l.t), l.f, l.t, l.s, JSON.stringify(l.body ?? [{ t: 'p', text: `${l.s} This is a short demo entry that shows how ${l.f.replace('_', ' ')} content appears in Learn.` }]), l.c, l.lv ?? 'beginner', l.m ?? null, ART[i++ % ART.length], JSON.stringify(l.tags ?? []), true, 'published', now.toISOString()]);
  }
  for (const p of PATHS) {
    const id = uuid();
    await db.run('INSERT INTO learn_items (id, slug, format, title, summary, body, category, level, minutes, art, tags, is_demo, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [id, slug(p.t), 'path', p.t, p.s, JSON.stringify([{ t: 'p', text: p.s }]), p.c, 'beginner', null, ART[i++ % ART.length], JSON.stringify(p.tags), true, 'published', now.toISOString()]);
    let n = 0;
    for (const title of p.items) { const it = ids.get(title); if (it) await db.run('INSERT INTO learn_path_items (path_id, item_id, sort_order) VALUES ($1,$2,$3)', [id, it, n++]); }
  }
  for (const o of OPPS) {
    const d = new Date(now.getTime() + o[7] * 86400_000).toISOString().slice(0, 10);
    await db.run('INSERT INTO opportunities (id, type, title, organisation, description, category, work_mode, location, deadline, apply_url, tags, is_demo, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [uuid(), o[0], o[1], o[2], o[3], o[4], o[5], o[6], d, null, JSON.stringify([o[4].toLowerCase()]), true, 'published', now.toISOString()]);
  }
  i = 0;
  for (const m of MENTORS) await db.run('INSERT INTO mentors (id, name, headline, bio, expertise, availability_note, art, is_demo, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [uuid(), m[0], m[1], m[2], JSON.stringify(m[3]), m[4], ART[i++ % ART.length], true, 'active']);
  i = 0;
  for (const e of EVENTS) {
    const start = new Date(now.getTime() + e[5] * 86400_000); start.setUTCHours(17, 0, 0, 0);
    await db.run('INSERT INTO events (id, title, description, category, format, location, starts_at, ends_at, capacity, art, is_demo, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [uuid(), e[0], e[1], e[2], e[3], e[4], start.toISOString(), new Date(start.getTime() + e[6] * 60_000).toISOString(), null, ART[i++ % ART.length], true, 'published']);
  }
}
