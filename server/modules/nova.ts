import { z } from 'zod';
import type { ModuleDef } from './types';
import { badRequest, conflict, notFound, unprocessable } from '../http/errors';
import { created } from '../http/router';
import { contains, json, uuid } from '../db';
import { aiApi } from '../ai/runtime';
import { analyse, CRISIS_REPLY, CRISIS_RESOURCES, FLAG_DISCLOSURE, flagExchange, purgeExpiredFlags, retentionDays } from '../ai/safety';
import { loadSettings } from '../profile/common';
import { registerEraser, registerExporter } from '../services/erasure';
import { AI_LIMITS, type AiConversationView, type AiMessageView, type AiSendResult } from '../../shared/api/ai';
import type { Services } from '../services';
import type { Db } from '../db';

const id = z.string().uuid();
const msgView = (m: any): AiMessageView => ({ id: m.id, role: m.role, body: m.body, createdAt: m.created_at, meta: json(m.meta, {}) });

/** Removes conversations older than this person's own retention choice (null = keep until deleted). */
export async function purgeOldConversations(db: Db, userId: string, now: Date): Promise<number> {
  const days = (await loadSettings(db, userId)).nova.historyRetentionDays;
  if (!days) return 0;
  const cutoff = new Date(now.getTime() - days * 86400_000).toISOString();
  return (await db.run('DELETE FROM ai_conversations WHERE user_id = $1 AND updated_at < $2 AND pinned = $3', [userId, cutoff, false])).changes;
}

async function convView(db: Db, r: any): Promise<AiConversationView> {
  const last = await db.get<{ body: string }>('SELECT body FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1', [r.id]);
  const n = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_messages WHERE conversation_id = $1', [r.id]);
  return { id: r.id, agentId: r.agent_id, title: r.title, pinned: r.pinned === true || r.pinned === 1, createdAt: r.created_at, updatedAt: r.updated_at, preview: last ? last.body.slice(0, 90) : null, messageCount: Number(n?.n ?? 0) };
}

/** Runs the safety layer then (unless it is a crisis) the specialist. Shared by stored and ephemeral chat. */
async function respond(s: Services, o: { userId: string; agentId: string; history: { role: 'user' | 'assistant'; content: string }[]; conversationId: string | null; messageId: string | null; extraSystem?: string }) {
  const last = o.history[o.history.length - 1]!.content;
  const safety = analyse(last);
  if (safety.severity) await flagExchange(s.db, { userId: o.userId, conversationId: o.conversationId, messageId: o.messageId, agentId: o.agentId, category: safety.category!, severity: safety.severity, excerpt: last, now: s.now() });
  if (safety.severity === 'crisis') {
    return { text: CRISIS_REPLY, mode: 'safety' as const, provider: 'safety', safety: { severity: 'crisis' as const, resources: CRISIS_RESOURCES } };
  }
  const careful = safety.severity === 'elevated' ? 'The person may be going through something hard. Respond with care and without diagnosing. Gently mention that talking to someone they trust or a professional can help.' : '';
  const r = await aiApi.callAgent(s, { agentId: o.agentId, userId: o.userId, messages: o.history, system: [careful, o.extraSystem].filter(Boolean).join('\n') });
  return { text: r.text, mode: r.mode, provider: r.provider, safety: safety.severity ? { severity: 'elevated' as const, resources: CRISIS_RESOURCES.slice(0, 2) } : null };
}

const agentAllowed = async (s: Services, agentId: string) => {
  const a = await aiApi.getAgent(s, agentId);
  if (!a || (a.config as any)?.hidden) throw notFound('That specialist does not exist.');
  return a;
};

export const novaModule: ModuleDef = {
  name: 'nova',
  register(router, s) {
    router.get('/api/ai/info', { auth: 'active' }, async (c) => {
      const st = await loadSettings(c.db, c.me.userId);
      return {
        mode: s.ai.provider === 'demo' ? 'demo' : 'live', provider: s.ai.provider,
        honesty: s.ai.provider === 'demo'
          ? 'No AI model is connected to this FREEVERSE instance. Replies are scripted stand-ins and are labelled “Demo”. Nothing here is real AI yet.'
          : 'Replies come from an AI model. It can be wrong. It is not a doctor, lawyer or therapist.',
        disclosure: FLAG_DISCLOSURE, flagRetentionDays: await retentionDays(c.db), resources: CRISIS_RESOURCES,
        dailyCap: s.config.ai.dailyMessageCap, history: { saveHistory: st.nova.saveHistory, retentionDays: st.nova.historyRetentionDays },
        tools: { journal: st.nova.journalEnabled, goals: st.nova.goalsEnabled, habits: st.nova.habitsEnabled },
      };
    });

    router.get('/api/ai/conversations', { auth: 'active', query: z.object({ q: z.string().trim().max(60).optional(), agent: z.string().max(40).optional() }) }, async (c) => {
      await purgeOldConversations(c.db, c.me.userId, c.now());
      const params: unknown[] = [c.me.userId]; let w = '';
      if (c.query.agent) { params.push(c.query.agent); w += ` AND agent_id = $${params.length}`; }
      if (c.query.q) { params.push(contains(c.query.q)); w += ` AND (lower(title) LIKE $${params.length} ESCAPE '\\' OR EXISTS (SELECT 1 FROM ai_messages m WHERE m.conversation_id = ai_conversations.id AND lower(m.body) LIKE $${params.length} ESCAPE '\\'))`; }
      const rows = await c.db.query<any>(`SELECT * FROM ai_conversations WHERE user_id = $1 AND agent_id <> 'founder-ai'${w} ORDER BY pinned DESC, updated_at DESC LIMIT 200`, params);
      return { items: await Promise.all(rows.map((r) => convView(c.db, r))) };
    });

    router.post('/api/ai/conversations', { auth: 'active', body: z.object({ agentId: z.string().max(40).default('nova'), title: z.string().trim().max(AI_LIMITS.titleMax).optional() }).strict() }, async (c) => {
      if (!(await loadSettings(c.db, c.me.userId)).nova.saveHistory) throw conflict('Conversation history is switched off in your settings. Use a temporary chat instead.', 'history_off');
      await agentAllowed(s, c.body.agentId);
      const n = await c.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_conversations WHERE user_id = $1', [c.me.userId]);
      if (Number(n?.n) >= 300) throw conflict('You have a lot of saved conversations. Delete a few to start a new one.', 'quota_exceeded');
      const cid = uuid(); const now = c.now().toISOString();
      await c.db.run('INSERT INTO ai_conversations (id, user_id, agent_id, title, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)', [cid, c.me.userId, c.body.agentId, c.body.title || 'New conversation', now]);
      return created({ conversation: await convView(c.db, await c.db.get('SELECT * FROM ai_conversations WHERE id = $1', [cid])) });
    });

    router.get('/api/ai/conversations/:id', { auth: 'active' }, async (c) => {
      const cid = id.safeParse(c.params.id);
      const row = cid.success ? await c.db.get<any>('SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2', [cid.data, c.me.userId]) : null;
      if (!row) throw notFound('We couldn’t find that conversation.');
      const msgs = await c.db.query<any>('SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at, id LIMIT 500', [row.id]);
      return { conversation: await convView(c.db, row), messages: msgs.map(msgView) };
    });

    router.patch('/api/ai/conversations/:id', { auth: 'active', body: z.object({ title: z.string().trim().min(1).max(AI_LIMITS.titleMax).optional(), pinned: z.boolean().optional(), agentId: z.string().max(40).optional() }).strict() }, async (c) => {
      const row = await c.db.get<any>('SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2', [c.params.id, c.me.userId]);
      if (!row) throw notFound('We couldn’t find that conversation.');
      if (c.body.agentId) await agentAllowed(s, c.body.agentId);
      await c.db.run('UPDATE ai_conversations SET title = $2, pinned = $3, agent_id = $4 WHERE id = $1', [row.id, c.body.title ?? row.title, c.body.pinned ?? (row.pinned === true || row.pinned === 1), c.body.agentId ?? row.agent_id]);
      return { conversation: await convView(c.db, await c.db.get('SELECT * FROM ai_conversations WHERE id = $1', [row.id])) };
    });

    router.delete('/api/ai/conversations/:id', { auth: 'active' }, async (c) => {
      const r = await c.db.run('DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2', [c.params.id, c.me.userId]);
      if (!r.changes) throw notFound('We couldn’t find that conversation.');
      // Deleting a conversation does not erase a safety flag that is still inside its disclosed retention window (see /api/ai/info).
      return { ok: true, note: 'Conversation deleted. If a safety excerpt was kept, it expires automatically within the disclosed period.' };
    });

    router.post('/api/ai/conversations/delete-all', { auth: 'active', body: z.object({ confirm: z.literal('DELETE ALL') }).strict() }, async (c) => {
      const r = await c.db.run('DELETE FROM ai_conversations WHERE user_id = $1', [c.me.userId]);
      return { ok: true, deleted: r.changes };
    });

    router.post('/api/ai/conversations/:id/messages', {
      auth: 'active',
      body: z.object({ body: z.string().trim().min(1, 'Write a message first.').max(AI_LIMITS.messageMax), attachJournalEntryId: id.optional() }).strict(),
      rate: { key: 'ai:min', limit: 12, windowMs: 60_000 },
    }, async (c) => {
      const me = c.me.userId;
      s.rate.check(`ai:day:${me}`, s.config.ai.dailyMessageCap, 24 * 3600_000);
      const conv = await c.db.get<any>('SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2', [c.params.id, me]);
      if (!conv) throw notFound('We couldn’t find that conversation.');
      let attached = '';
      if (c.body.attachJournalEntryId) {
        if (!(await loadSettings(c.db, me)).nova.journalEnabled) throw conflict('Your journal is switched off.', 'tool_disabled');
        const j = await c.db.get<{ body: string }>('SELECT body FROM journal_entries WHERE id = $1 AND user_id = $2', [c.body.attachJournalEntryId, me]);
        if (!j) throw notFound('We couldn’t find that journal entry.');
        attached = `\n\n[The person chose to share this private journal entry with you for this message]\n${j.body.slice(0, 3000)}`;
      }
      const now = c.now().toISOString(); const umid = uuid();
      await c.db.run('INSERT INTO ai_messages (id, conversation_id, role, body, meta, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [umid, conv.id, 'user', c.body.body, attached ? { attached: 'journal' } : {}, now]);
      const prior = await c.db.query<any>("SELECT role, body FROM ai_messages WHERE conversation_id = $1 AND role IN ('user','assistant') ORDER BY created_at, id", [conv.id]);
      const history = prior.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.body })).slice(-20);
      if (attached) history[history.length - 1]!.content += attached;
      let out;
      try { out = await respond(s, { userId: me, agentId: conv.agent_id, history, conversationId: conv.id, messageId: umid }); }
      catch (e) { await c.db.run('DELETE FROM ai_messages WHERE id = $1', [umid]); throw e; } // nothing half-saved if the specialist could not answer
      const amid = uuid(); const t2 = c.now().toISOString();
      const meta: AiMessageView['meta'] = { mode: out.mode === 'safety' ? undefined : out.mode, provider: out.provider, agentId: conv.agent_id, ...(out.safety ? { safety: out.safety.severity } : {}) };
      await c.db.run('INSERT INTO ai_messages (id, conversation_id, role, body, meta, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [amid, conv.id, out.mode === 'safety' ? 'notice' : 'assistant', out.text, meta, t2]);
      const firstTitle = conv.title === 'New conversation' ? c.body.body.slice(0, 48).replace(/\s+\S*$/, '') || c.body.body.slice(0, 48) : conv.title;
      await c.db.run('UPDATE ai_conversations SET title = $2, updated_at = $3 WHERE id = $1', [conv.id, firstTitle, t2]);
      const um = await c.db.get('SELECT * FROM ai_messages WHERE id = $1', [umid]); const am = await c.db.get('SELECT * FROM ai_messages WHERE id = $1', [amid]);
      return { userMessage: msgView(um), assistantMessage: msgView(am), mode: out.mode, safety: out.safety } satisfies AiSendResult;
    });

    // Temporary chat: nothing is stored (used when history is off). The client keeps the thread in memory.
    router.post('/api/ai/chat', {
      auth: 'active',
      body: z.object({ agentId: z.string().max(40).default('nova'), messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(AI_LIMITS.messageMax) })).min(1).max(20) }).strict(),
      rate: { key: 'ai:min', limit: 12, windowMs: 60_000 },
    }, async (c) => {
      s.rate.check(`ai:day:${c.me.userId}`, s.config.ai.dailyMessageCap, 24 * 3600_000);
      await agentAllowed(s, c.body.agentId);
      if (c.body.messages[c.body.messages.length - 1]!.role !== 'user') throw badRequest('The last message must be yours.');
      const out = await respond(s, { userId: c.me.userId, agentId: c.body.agentId, history: c.body.messages, conversationId: null, messageId: null });
      return { text: out.text, mode: out.mode, safety: out.safety, stored: false };
    });

    registerEraser('nova', async (db, userId) => {
      const conv = await db.run('DELETE FROM ai_conversations WHERE user_id = $1', [userId]); // messages cascade
      // Flags are detached from the person but their minimal excerpt keeps its own expiry (disclosed). Usage rows lose the user link.
      const flags = await db.run('UPDATE ai_safety_flags SET user_id = NULL WHERE user_id = $1', [userId]);
      await db.run('UPDATE ai_usage SET user_id = NULL WHERE user_id = $1', [userId]);
      await db.run('UPDATE moderation_cases SET target_user_id = NULL WHERE target_type = $1 AND target_user_id = $2', ['ai_flag', userId]);
      return { counts: { ai_conversations: conv.changes, safety_flags_detached: flags.changes } };
    });
    registerExporter('nova', async (db, userId) => {
      const convs = await db.query<any>('SELECT id, agent_id, title, created_at FROM ai_conversations WHERE user_id = $1', [userId]);
      return Promise.all(convs.map(async (cv) => ({ ...cv, messages: await db.query('SELECT role, body, created_at FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at', [cv.id]) })));
    });
    void unprocessable; void purgeExpiredFlags;
  },
};
