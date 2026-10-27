// Sample content so each Universe has something to browse on day one. Every item is written by a fictional demo member (labelled
// "demo" everywhere), is invented for this build, and makes no real offer: listings are not for sale, projects are not real ventures,
// opportunities are not real. Real members add their own; demo content can be switched off with SEED_DEMO_DATA=false.
import type { Services } from '../services';
import { uuid } from '../db';
import { templateFor, validateMeta } from '../../shared/universe-spaces';

interface Sample { by: string; universe: string; template: string; title?: string; body: string; meta: Record<string, string | number>; url?: string; startsInDays?: number; tags?: string[]; join?: string[] }

const SAMPLES: Sample[] = [
  // FreeLearn
  { by: 'demo_mei', universe: 'freelearn', template: 'tip', body: 'Demo tip: after a study session, write three questions you could be asked tomorrow. Answer them from memory before you sleep.', meta: { topic: 'Study habits' } },
  { by: 'demo_amara', universe: 'freelearn', template: 'study-partner', body: 'Demo request: working through a typography course and looking for someone to swap weekly feedback with.', meta: { subject: 'Typography', format: 'Online' }, join: ['demo_mei'] },
  // FreeWork
  { by: 'demo_ife', universe: 'freework', template: 'career-lesson', body: 'Demo lesson: I stopped sending the same CV everywhere. Three versions, each tuned to a type of role, got me far more replies.', meta: { stage: 'Applying' } },
  { by: 'demo_ife', universe: 'freework', template: 'feedback', title: 'Could someone read my cover letter opening?', body: 'Demo request: it feels either too stiff or too casual. Happy to return the favour.', meta: { about: 'Cover letter' } },
  // FreeBuild
  { by: 'demo_kofi', universe: 'freebuild', template: 'project', title: 'Bus-time board (demo project)', body: 'Demo project: a tiny web page that shows the next buses for my street, built from a public timetable file. Prototype works; the design does not.', meta: { stage: 'Prototype', looking_for: 'Designer' }, url: 'https://example.com/demo', join: ['demo_amara', 'demo_noor'] },
  { by: 'demo_tunde', universe: 'freebuild', template: 'project', title: 'Pay-what-you-can tutoring (demo venture)', body: 'Demo project: validating whether students would use short tutoring slots with flexible pricing. Looking for someone to help with interviews.', meta: { stage: 'Idea', looking_for: 'Teammate' } },
  { by: 'demo_kofi', universe: 'freebuild', template: 'build-log', body: 'Demo log: the timetable file changes format every few months, so today I wrote a tiny checker that tells me when it breaks.', meta: { project: 'Bus-time board' } },
  // FreeMarket
  { by: 'demo_noor', universe: 'freemarket', template: 'listing', title: 'Custom pet portrait, digital (demo listing)', body: 'Demo listing, not a real offer: a hand-drawn digital portrait from a photo, delivered as a high-resolution image. Three revisions included.', meta: { category: 'Design & creative', offer: 'Service', price: 'Example: ₦15,000', condition: 'Not applicable', where: 'Online' }, tags: ['illustration'] },
  { by: 'demo_mei', universe: 'freemarket', template: 'listing', title: 'Maths revision sessions (demo listing)', body: 'Demo listing, not a real offer: one-hour online sessions on school and first-year university maths. First 15 minutes free.', meta: { category: 'Tutoring & lessons', offer: 'Service', price: 'Example: $12 / hour', condition: 'Not applicable', where: 'Online' } },
  { by: 'demo_amara', universe: 'freemarket', template: 'listing', title: 'Used design books bundle (demo listing)', body: 'Demo listing, not a real offer: four design and typography books in good condition.', meta: { category: 'Books & study materials', offer: 'Product', price: 'Example: Free to a good home', condition: 'Used', where: 'Local pickup' } },
  { by: 'demo_sam', universe: 'freemarket', template: 'wanted', body: 'Demo request: looking for someone to design a simple poster for a community clean-up day.', meta: { category: 'Design & creative', budget: 'Example: small budget' } },
  // FreeAI
  { by: 'demo_mei', universe: 'freeai', template: 'prompt', body: 'Demo prompt: “Quiz me on this chapter one question at a time. Wait for my answer, then correct me kindly and explain why.” Works well for revision.', meta: { for: 'Studying' } },
  // FreeResearch
  { by: 'demo_lena', universe: 'freeresearch', template: 'source', title: 'A readable introduction to confidence intervals (demo)', body: 'Demo entry: an invented example of how a shared source looks. Say what it is, who it is for and why it helped.', meta: { field: 'Social sciences', type: 'Paper', citation: 'Demo, A. (2026). An example entry. Journal of Examples.' }, url: 'https://example.com/demo-paper' },
  { by: 'demo_lena', universe: 'freeresearch', template: 'question', title: 'How do you keep a literature review from sprawling?', body: 'Demo question: mine reaches forty papers and no clear argument.', meta: { field: 'Social sciences' } },
  { by: 'demo_lena', universe: 'freeresearch', template: 'collab', body: 'Demo request: planning a small survey on study habits and looking for someone to co-design the questions.', meta: { field: 'Social sciences', stage: 'Exploring' }, join: ['demo_mei'] },
  // FreeHealth
  { by: 'demo_sam', universe: 'freehealth', template: 'routine', body: 'Demo routine: a ten-minute walk after lunch, no phone. It resets my afternoon. (Personal experience, not advice.)', meta: { area: 'Movement' } },
  { by: 'demo_noor', universe: 'freehealth', template: 'routine', body: 'Demo routine: screens off thirty minutes before bed and a drawing instead. (Personal experience, not advice.)', meta: { area: 'Sleep' } },
  // FreeFinance
  { by: 'demo_tunde', universe: 'freefinance', template: 'lesson', body: 'Demo lesson: I give every naira a job on payday: bills, savings, then the rest. Writing it down took ten minutes and stopped month-end surprises.', meta: { topic: 'Budgeting' } },
  // FreeMedia
  { by: 'demo_amara', universe: 'freemedia', template: 'article', title: 'Why small type decisions change how a page feels (demo article)', body: 'Demo article. Type is the quiet part of design: nobody says “nice line height”, yet everybody feels it. Start with size and spacing before reaching for a new typeface. A comfortable body size, a generous line height and a clear gap between sections will do more for a page than any decorative font. Test it by squinting: if the structure survives, the hierarchy works. This is an invented sample article so the Universe shows how published pieces look.', meta: { category: 'Explainer' }, tags: ['design', 'writing'] },
  { by: 'demo_noor', universe: 'freemedia', template: 'creative', title: 'Five-minute sketches (demo)', body: 'Demo work: a week of quick sketches. Images aren’t attached to demo content.', meta: { medium: 'Illustration' } },
  // FreeEvents
  { by: 'demo_sam', universe: 'freeevents', template: 'idea', body: 'Demo idea: a monthly “bring a half-finished project” evening where everyone gets ten minutes of friendly feedback.', meta: { format: 'In person', where: 'City library meeting room' }, join: ['demo_kofi', 'demo_ife', 'demo_noor'] },
  // FreeVolunteer
  { by: 'demo_sam', universe: 'freevolunteer', template: 'opportunity', title: 'Community clean-up day helpers (demo)', body: 'Demo opportunity, not a real event: help tidy a local green space, two hours on a Saturday. Gloves provided.', meta: { organisation: 'Example Neighbourhood Group', mode: 'In person', commitment: 'One-off', where: 'Local park', skills: 'None needed' }, join: ['demo_amara'] },
  { by: 'demo_sam', universe: 'freevolunteer', template: 'story', body: 'Demo story: I joined a clean-up expecting to feel useful and left having met four neighbours. That mattered more than the bin bags.', meta: {} },
  // FreeLabs
  { by: 'demo_kofi', universe: 'freelabs', template: 'experiment', title: 'Two-week “no notifications” trial (demo)', body: 'Demo experiment: switch off all non-essential notifications for two weeks and write down what changes. Share a short note at the end.', meta: { status: 'Recruiting', duration: '2 weeks', risk: 'You might miss time-sensitive messages. Keep calls and messages from family on.' }, join: ['demo_lena', 'demo_ife'] },
  { by: 'demo_lena', universe: 'freelabs', template: 'result', body: 'Demo result: the first three days were uncomfortable; by day ten I was reading more. Sample size of one, so take it lightly.', meta: { outcome: 'Mixed' } },
  // FreePlay
  { by: 'demo_kofi', universe: 'freeplay', template: 'challenge', body: 'Demo challenge: I cleared Memory Match in 18 moves. Can you beat it?', meta: { game: 'Memory Match', score: 18 } },
  { by: 'demo_mei', universe: 'freeplay', template: 'game-tip', body: 'Demo tip: in Slide & Merge, keep your largest tile in one corner and build outward from it.', meta: { game: 'Slide & Merge' } },
  // FreeEntertainment
  { by: 'demo_noor', universe: 'freeentertainment', template: 'recommendation', title: 'A cosy mystery series (demo recommendation)', body: 'Demo recommendation, an invented example: gentle puzzles, kind characters, perfect for a rainy afternoon.', meta: { medium: 'Series', rating: '4 – really good', spoilers: 'Spoiler-free', where: 'Your favourite streaming service' } },
  { by: 'demo_amara', universe: 'freeentertainment', template: 'watch-along', title: 'Saturday film night (demo)', body: 'Demo invitation: pick any film, press play together at the agreed time and chat here afterwards.', meta: { medium: 'Film' }, startsInDays: 6, join: ['demo_noor'] },
];

export async function seedUniverseContent(s: Services): Promise<void> {
  if (!s.config.seedDemoData) return;
  const db = s.db;
  if (await db.get('SELECT 1 AS x FROM posts p JOIN users u ON u.id = p.author_id WHERE p.universe IS NOT NULL AND u.is_demo = $1 LIMIT 1', [true])) return;
  const users = new Map((await db.query<{ id: string; handle: string }>('SELECT id, handle FROM users WHERE is_demo = $1', [true])).map((u) => [u.handle, u.id]));
  if (!users.size) return;
  const now = s.now();
  await db.tx(async (t) => {
    let n = 0;
    for (const x of SAMPLES) {
      const author = users.get(x.by); const tpl = templateFor(x.universe, x.template);
      if (!author || !tpl) continue;
      const m = validateMeta(tpl, x.meta);
      if (!m.ok) throw new Error(`Seed sample invalid (${x.universe}/${x.template}): ${JSON.stringify(m.errors)}`);
      const data: Record<string, unknown> = { template: tpl.id, meta: m.meta };
      if (x.url) data.url = x.url;
      if (tpl.needsStart) data.startsAt = new Date(now.getTime() + (x.startsInDays ?? 7) * 86400_000).toISOString();
      const facet = tpl.filterField && m.meta[tpl.filterField] !== undefined ? String(m.meta[tpl.filterField]) : null;
      const pid = uuid(); const at = new Date(now.getTime() - (SAMPLES.length - n++) * 3_600_000 * 3).toISOString();
      await t.run("INSERT INTO posts (id, author_id, kind, title, body, community_id, visibility, is_anonymous, data, tags, status, created_at, universe, template, facet) VALUES ($1,$2,$3,$4,$5,NULL,'everyone',$6,$7,$8,'published',$9,$10,$11,$12)",
        [pid, author, tpl.kind, x.title ?? null, x.body, false, data, x.tags ?? [], at, x.universe, tpl.id, facet]);
      for (const j of x.join ?? []) { const ju = users.get(j); if (ju && ju !== author) await t.run('INSERT INTO post_participation (post_id, user_id, created_at) VALUES ($1,$2,$3)', [pid, ju, at]); }
    }
  });
}
