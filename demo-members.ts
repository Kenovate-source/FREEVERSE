// Fictional demo members so a fresh install is not an empty room. They are labelled "Demo" everywhere (users.is_demo),
// cannot sign in (no auth identity or dev account), and every line they write is invented for this build.
import type { Services } from '../services';
import { uuid } from '../db';
import { AVATAR_EYES, AVATAR_EXTRAS, AVATAR_MOUTHS, AVATAR_PALETTES, AVATAR_SHAPES } from '../../shared/avatar';

const M: { h: string; n: string; bio: string; headline: string; interests: string[]; ids: string[] }[] = [
  { h: 'demo_amara', n: 'Amara (demo)', headline: 'Design student', bio: 'Fictional demo member. Loves type, tea and tidy spreadsheets.', interests: ['design', 'writing', 'study-skills'], ids: ['student', 'creator'] },
  { h: 'demo_kofi', n: 'Kofi (demo)', headline: 'Learning to build', bio: 'Fictional demo member. Side projects and open source beginner.', interests: ['web-dev', 'open-source', 'careers'], ids: ['developer'] },
  { h: 'demo_lena', n: 'Lena (demo)', headline: 'Early-career researcher', bio: 'Fictional demo member. Public health, statistics, strong coffee.', interests: ['research-methods', 'statistics', 'writing'], ids: ['researcher'] },
  { h: 'demo_tunde', n: 'Tunde (demo)', headline: 'Building a first venture', bio: 'Fictional demo member. Validating a small idea with real people.', interests: ['startups', 'validation', 'careers'], ids: ['entrepreneur'] },
  { h: 'demo_mei', n: 'Mei (demo)', headline: 'Tutor and lesson writer', bio: 'Fictional demo member. Making study guides that people actually finish.', interests: ['teaching', 'study-skills', 'writing'], ids: ['teacher', 'mentor'] },
  { h: 'demo_sam', n: 'Sam (demo)', headline: 'Community host', bio: 'Fictional demo member. Keeping spaces warm and rules clear.', interests: ['community-building', 'events', 'volunteering'], ids: ['community_leader', 'volunteer'] },
  { h: 'demo_noor', n: 'Noor (demo)', headline: 'Illustrator', bio: 'Fictional demo member. Posting small drawings every day.', interests: ['illustration', 'photography', 'music'], ids: ['creator'] },
  { h: 'demo_ife', n: 'Ife (demo)', headline: 'Graduate, job hunting', bio: 'Fictional demo member. Tracking applications and practising interviews.', interests: ['careers', 'interviews', 'cv'], ids: ['graduate'] },
];

const POSTS: { by: string; community: string; kind: string; title: string | null; body: string; anon?: boolean; poll?: string[] }[] = [
  { by: 'demo_amara', community: 'welcome-lounge', kind: 'text', title: null, body: 'Hello from a demo member! This is an example post so the feed shows how things look. Real members will fill this space.' },
  { by: 'demo_kofi', community: 'code-and-build', kind: 'question', title: 'What was your first project that actually shipped?', body: 'Demo question: I am collecting ideas for a small first project. What worked for you?' },
  { by: 'demo_lena', community: 'study-circle', kind: 'text', title: 'A three-pass way to read papers', body: 'Demo post: pass one is the abstract and figures, pass two the conclusions, pass three only the methods you need. It saves hours.' },
  { by: 'demo_tunde', community: 'first-job-club', kind: 'text', title: 'Five customer conversations beat fifty survey answers', body: 'Demo post: talk to a few real people before you build anything.' },
  { by: 'demo_mei', community: 'study-circle', kind: 'resource', title: 'A printable weekly planner', body: 'Demo post: sharing the planner template I use with students. (Illustrative; no file attached.)' },
  { by: 'demo_sam', community: 'volunteer-hub', kind: 'text', title: 'Welcoming newcomers', body: 'Demo post: a short checklist for hosts: greet, point to the rules, invite one reply.' },
  { by: 'demo_noor', community: 'creators-corner', kind: 'creative', title: 'Small daily drawings', body: 'Demo post: a week of five-minute sketches. Feedback welcome, kindly and specifically.' },
  { by: 'demo_ife', community: 'first-job-club', kind: 'question', title: 'How do you answer “tell me about yourself”?', body: 'Demo question: I freeze every time. Any structure that helps?' },
  { by: 'demo_lena', community: 'honest-questions', kind: 'text', title: null, body: 'Demo anonymous-space example: I sometimes feel behind everyone else in my course. Does anyone else?', anon: true },
];
const REPLIES: { post: number; by: string; body: string }[] = [
  { post: 1, by: 'demo_lena', body: 'Demo reply: a tiny calculator for my brother. It was ugly and he used it for years.' },
  { post: 7, by: 'demo_tunde', body: 'Demo reply: situation, what you did, what changed. Two sentences each.' },
  { post: 8, by: 'demo_amara', body: 'Demo reply: you are not alone in this. Many of us feel it, and it does pass.' },
];

export async function seedDemoMembers(s: Services): Promise<void> {
  if (!s.config.seedDemoData) return;
  const db = s.db;
  if (await db.get('SELECT 1 AS x FROM users WHERE is_demo = $1 LIMIT 1', [true])) return;
  const now = s.now(); const nowIso = now.toISOString(); const year = now.getUTCFullYear() - 21;
  const ids = new Map<string, string>();
  await db.tx(async (t) => {
    let i = 0;
    for (const m of M) {
      const id = uuid(); ids.set(m.h, id);
      await t.run("INSERT INTO users (id, status, handle, display_name, birth_month, birth_year, age_check_method, age_check_status, age_attested_at, terms_version, terms_accepted_at, onboarding_completed_at, created_at, updated_at, is_demo) VALUES ($1,'active',$2,$3,6,$4,'self_declared_birthdate','self_attested',$5,'demo',$5,$5,$5,$5,$6)", [id, m.h, m.n, year, nowIso, true]);
      const cfg = { seed: m.h, palette: AVATAR_PALETTES[i % AVATAR_PALETTES.length]!.id, shape: AVATAR_SHAPES[i % AVATAR_SHAPES.length], eyes: AVATAR_EYES[(i * 3) % AVATAR_EYES.length], mouth: AVATAR_MOUTHS[i % AVATAR_MOUTHS.length], extra: AVATAR_EXTRAS[(i * 2) % AVATAR_EXTRAS.length] };
      await t.run('INSERT INTO profiles (user_id, headline, bio, avatar_config, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [id, m.headline, m.bio, JSON.stringify(cfg), nowIso]);
      await t.run('INSERT INTO user_privacy (user_id, updated_at) VALUES ($1,$2)', [id, nowIso]);
      for (const k of m.interests) await t.run("INSERT INTO user_tags (user_id, kind, key, label, category, is_custom, created_at) VALUES ($1,'interest',$2,$3,NULL,$4,$5)", [id, k, k.replace(/-/g, ' '), false, nowIso]);
      let first = true;
      for (const a of m.ids) { await t.run('INSERT INTO user_identities (id, user_id, archetype, status, is_primary, data, visibility, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)', [uuid(), id, a, 'active', first, '{}', 'members', nowIso]); first = false; }
      i++;
    }
    const posts: string[] = [];
    let n = 0;
    for (const p of POSTS) {
      const c = await t.get<{ id: string; allow_anonymous: unknown }>('SELECT id, allow_anonymous FROM communities WHERE slug = $1', [p.community]);
      if (!c) { posts.push(''); continue; }
      const anon = !!p.anon && (c.allow_anonymous === true || c.allow_anonymous === 1);
      const pid = uuid(); posts.push(pid); const at = new Date(now.getTime() - (POSTS.length - n++) * 3_600_000 * 5).toISOString();
      const author = ids.get(p.by)!;
      await t.run('INSERT INTO community_members (community_id, user_id, role, show_on_profile, joined_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [c.id, author, 'member', true, nowIso]);
      await t.run("INSERT INTO posts (id, author_id, kind, title, body, community_id, visibility, is_anonymous, data, tags, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,'members',$7,'{}','[]','published',$8)", [pid, author, p.kind, p.title, p.body, c.id, anon, at]);
      if (anon) await t.run('INSERT INTO post_anon_aliases (post_id, user_id, alias_no) VALUES ($1,$2,0)', [pid, author]);
    }
    for (const r of REPLIES) {
      const pid = posts[r.post]; if (!pid) continue;
      const row = await t.get<{ is_anonymous: unknown }>('SELECT is_anonymous FROM posts WHERE id = $1', [pid]);
      const anon = row?.is_anonymous === true || row?.is_anonymous === 1;
      const author = ids.get(r.by)!;
      if (anon) { const n2 = await t.get<{ n: number | null }>('SELECT MAX(alias_no) AS n FROM post_anon_aliases WHERE post_id = $1', [pid]); await t.run('INSERT INTO post_anon_aliases (post_id, user_id, alias_no) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [pid, author, Number(n2?.n ?? 0) + 1]); }
      await t.run("INSERT INTO comments (id, post_id, parent_id, author_id, body, is_anonymous, depth, status, created_at) VALUES ($1,$2,NULL,$3,$4,$5,0,'published',$6)", [uuid(), pid, author, r.body, anon, nowIso]);
    }
  });
}
