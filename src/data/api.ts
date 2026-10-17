/**
 * MOCK API — Stage 1 only. Implements the shape the real backend will later provide, but serves seeded fictional
 * data from memory plus the viewer's local changes (kept in this browser). Simulation modes let every loading,
 * empty and error state be demonstrated. Nothing here talks to a server.
 */
import type { Conversation, EventItem, FeedPost, LearnItem, LearnType, Mentor, Opportunity, OpportunityType, Post, PublicUser, RsvpResponse, SimMode } from '../types';
import { CONVERSATIONS, LEARN, MEMBERS, MENTORS, NOVA_SCRIPT, seedEvents, seedOpportunities, seedPosts } from './mock';
import { readJSON, type KV } from '../lib/kv';
import { validatePost } from '../lib/validate';

export class ApiError extends Error {
  readonly code: 'simulated_failure' | 'not_found' | 'invalid';
  constructor(message: string, code: ApiError['code'] = 'simulated_failure') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

interface MockState {
  v: 1;
  posts: Post[];
  reacted: string[];
  rsvps: Record<string, RsvpResponse>;
  intros: Record<string, string>;
  following: string[];
}
const STATE_KEY = 'fv.mock.state';
const emptyState = (): MockState => ({ v: 1, posts: [], reacted: [], rsvps: {}, intros: {}, following: [] });

export interface ApiOptions {
  kv: KV;
  getMode: () => SimMode;
  getViewer: () => PublicUser | null;
  now?: () => number;
  /** Test hook: replaces the artificial delay. */
  sleep?: (ms: number) => Promise<void>;
}

export interface Api {
  getFeed(): Promise<FeedPost[]>;
  createPost(body: string): Promise<FeedPost>;
  toggleReaction(postId: string): Promise<{ reacted: boolean; total: number }>;
  getProfile(handle: string): Promise<{ user: PublicUser; posts: FeedPost[]; following: boolean; isViewer: boolean }>;
  toggleFollow(userId: string): Promise<boolean>;
  getLearn(filter?: { type?: LearnType }): Promise<LearnItem[]>;
  getLearnItem(id: string): Promise<LearnItem>;
  getOpportunities(filter?: { type?: OpportunityType }): Promise<Opportunity[]>;
  getMentors(): Promise<{ mentors: Mentor[]; requested: Record<string, string> }>;
  requestIntro(mentorId: string): Promise<string>;
  getEvents(): Promise<EventItem[]>;
  setRsvp(eventId: string, response: RsvpResponse | null): Promise<EventItem>;
  getConversations(): Promise<Conversation[]>;
  novaReply(message: string): Promise<{ text: string }>;
  resetLocalState(): void;
}

export function createApi(opts: ApiOptions): Api {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const load = (): MockState => ({ ...emptyState(), ...readJSON<Partial<MockState>>(opts.kv, STATE_KEY, {}) });
  const save = (s: MockState) => opts.kv.set(STATE_KEY, JSON.stringify(s));

  async function gate(kind: 'read' | 'write' = 'read') {
    const mode = opts.getMode();
    await sleep(mode === 'slow' ? 2600 : 320);
    if (mode === 'error') throw new ApiError(kind === 'write' ? 'The mock server refused this change (simulated failure).' : 'The mock server didn’t respond (simulated failure).');
  }
  const isEmptyMode = () => opts.getMode() === 'empty';

  const people = (): PublicUser[] => {
    const v = opts.getViewer();
    return v && !MEMBERS.some((m) => m.id === v.id) ? [...MEMBERS, v] : MEMBERS;
  };
  const byId = (id: string) => people().find((p) => p.id === id);
  const allPosts = (s: MockState): Post[] => [...seedPosts(now()), ...s.posts];
  const decorate = (p: Post, s: MockState): FeedPost | null => {
    const author = byId(p.authorId);
    if (!author) return null;
    const reactedByMe = s.reacted.includes(p.id);
    return { ...p, author, reactedByMe, reactionTotal: p.reactions + (reactedByMe ? 1 : 0) };
  };
  const chronological = (list: FeedPost[]) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

  return {
    async getFeed() {
      await gate();
      if (isEmptyMode()) return [];
      const s = load();
      return chronological(allPosts(s).map((p) => decorate(p, s)).filter((p): p is FeedPost => p !== null));
    },
    async createPost(body) {
      await gate('write');
      const viewer = opts.getViewer();
      if (!viewer) throw new ApiError('Sign in to post.', 'invalid');
      const err = validatePost(body);
      if (err) throw new ApiError(err, 'invalid');
      const s = load();
      const post: Post = { id: `lp_${now().toString(36)}_${s.posts.length}`, authorId: viewer.id, body: body.trim(), createdAt: new Date(now()).toISOString(), reactions: 0, comments: 0 };
      s.posts.push(post);
      save(s);
      const out = decorate(post, s);
      if (!out) throw new ApiError('Author not found.', 'not_found');
      return out;
    },
    async toggleReaction(postId) {
      await gate('write');
      const s = load();
      const post = allPosts(s).find((p) => p.id === postId);
      if (!post) throw new ApiError('Post not found.', 'not_found');
      const has = s.reacted.includes(postId);
      s.reacted = has ? s.reacted.filter((id) => id !== postId) : [...s.reacted, postId];
      save(s);
      return { reacted: !has, total: post.reactions + (has ? 0 : 1) };
    },
    async getProfile(handle) {
      await gate();
      const user = people().find((p) => p.handle === handle);
      if (!user) throw new ApiError('We couldn’t find that member.', 'not_found');
      const s = load();
      const posts = isEmptyMode() ? [] : chronological(allPosts(s).filter((p) => p.authorId === user.id).map((p) => decorate(p, s)).filter((p): p is FeedPost => p !== null));
      return { user, posts, following: s.following.includes(user.id), isViewer: opts.getViewer()?.id === user.id };
    },
    async toggleFollow(userId) {
      await gate('write');
      const s = load();
      const has = s.following.includes(userId);
      s.following = has ? s.following.filter((id) => id !== userId) : [...s.following, userId];
      save(s);
      return !has;
    },
    async getLearn(filter) {
      await gate();
      if (isEmptyMode()) return [];
      return LEARN.filter((l) => !filter?.type || l.type === filter.type);
    },
    async getLearnItem(id) {
      await gate();
      const item = LEARN.find((l) => l.id === id);
      if (!item) throw new ApiError('We couldn’t find that learning item.', 'not_found');
      return item;
    },
    async getOpportunities(filter) {
      await gate();
      if (isEmptyMode()) return [];
      return seedOpportunities(now())
        .filter((o) => !filter?.type || o.type === filter.type)
        .sort((a, b) => a.deadline.localeCompare(b.deadline));
    },
    async getMentors() {
      await gate();
      return { mentors: isEmptyMode() ? [] : MENTORS, requested: load().intros };
    },
    async requestIntro(mentorId) {
      await gate('write');
      if (!MENTORS.some((m) => m.id === mentorId)) throw new ApiError('Mentor not found.', 'not_found');
      const s = load();
      const when = new Date(now()).toISOString();
      s.intros[mentorId] = when;
      save(s);
      return when;
    },
    async getEvents() {
      await gate();
      if (isEmptyMode()) return [];
      const s = load();
      return seedEvents(now())
        .map((e) => {
          const my = s.rsvps[e.id];
          return { ...e, going: e.going + (my === 'yes' ? 1 : 0), ...(my ? { myRsvp: my } : {}) };
        })
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
    async setRsvp(eventId, response) {
      await gate('write');
      const s = load();
      const base = seedEvents(now()).find((e) => e.id === eventId);
      if (!base) throw new ApiError('Event not found.', 'not_found');
      if (response) s.rsvps[eventId] = response; else delete s.rsvps[eventId];
      save(s);
      return { ...base, going: base.going + (response === 'yes' ? 1 : 0), ...(response ? { myRsvp: response } : {}) };
    },
    async getConversations() {
      await gate();
      return isEmptyMode() ? [] : CONVERSATIONS;
    },
    async novaReply(message) {
      await gate('write');
      const m = message.toLowerCase();
      if (/(learn|study|skill|course|practi[sc]e)/.test(m)) return { text: NOVA_SCRIPT.learn };
      if (/(job|intern|scholar|grant|apply|opportunit|cv|resume)/.test(m)) return { text: NOVA_SCRIPT.opportunities };
      if (/(mentor|advice|guidance|introduc)/.test(m)) return { text: NOVA_SCRIPT.mentor };
      return { text: NOVA_SCRIPT.generic };
    },
    resetLocalState() {
      opts.kv.remove(STATE_KEY);
    },
  };
}
