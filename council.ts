import { z } from 'zod';
import type { ModuleDef } from './types';
import { conflict, notFound } from '../http/errors';
import { aiApi } from '../ai/runtime';
import { seedAgents, setAgentEnabled, upsertAgent } from '../ai/registry';
import { audit } from '../services/audit';
import type { AgentCard } from '../../shared/api/ai';
import type { AgentView } from '../ai/runtime-types';

const card = (a: AgentView): AgentCard => ({
  id: a.id, name: a.name, title: a.title, tagline: a.tagline, responsibilities: a.responsibilities, state: a.state, available: a.available, unavailableReason: a.unavailableReason, enabled: a.enabled,
  capabilities: a.capabilityStates.map((c) => ({ id: c.id, label: c.label, state: c.state, detail: c.detail })), toolPermissions: a.toolPermissions,
});

const AGENT_ID = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/);

export const councilModule: ModuleDef = {
  name: 'council',
  async seed(s) { await seedAgents(s); },
  register(router, s) {
    router.get('/api/council', { auth: 'active' }, async () => {
      const agents = (await aiApi.listAgents(s)).filter((a) => !(a.config as any).hidden);
      return {
        agents: agents.map(card),
        honesty: s.ai.provider === 'demo'
          ? 'The AI Council is set up, but no AI model is connected, so every specialist answers in clearly labelled demo mode. Nothing is hidden: states below show exactly what works.'
          : 'The AI Council is connected to a model provider. Specialists can be wrong; they never take actions for you.',
        states: { unavailable: 'No integration exists.', available: 'Code exists but is not configured.', configured: 'Credentials present, not yet verified.', operational: 'Verified recently.', demo: 'Scripted stand-in only.' },
      };
    });

    router.get('/api/council/capabilities', { auth: 'active' }, async () => ({ capabilities: await aiApi.capabilityMatrix(s) }));

    router.post('/api/council/route', { auth: 'active', body: z.object({ text: z.string().trim().min(1).max(2000) }).strict(), rate: { key: 'council:route', limit: 60, windowMs: 60_000 } }, async (c) => {
      const d = await aiApi.route(s, c.body.text);
      const agent = d.agentId ? await aiApi.getAgent(s, d.agentId) : null;
      return { decision: d, agent: agent ? card(agent) : null };
    });

    // ───────── oversight (Founder and Council) ─────────
    router.get('/api/council/admin', { auth: { perm: 'ai.council.view' } }, async (c) => {
      const agents = await aiApi.listAgents(s);
      const since = new Date(c.now().getTime() - 7 * 86400_000).toISOString();
      const usage = await c.db.query<any>('SELECT agent_id, outcome, mode, COUNT(*) AS n FROM ai_usage WHERE occurred_at > $1 GROUP BY agent_id, outcome, mode', [since]);
      const delegations = await c.db.query<any>('SELECT id, from_agent, to_agent, status, created_at FROM ai_delegations ORDER BY created_at DESC LIMIT 20');
      return {
        agents: agents.map((a) => ({ ...card(a), hidden: !!(a.config as any).hidden, isFounding: a.isFounding, provider: a.provider, model: a.model })),
        usage: usage.map((u) => ({ agentId: u.agent_id, outcome: u.outcome, mode: u.mode, count: Number(u.n) })),
        delegations: delegations.map((d) => ({ id: d.id, from: d.from_agent, to: d.to_agent, status: d.status, at: d.created_at })),
        provider: s.ai.provider,
        windowDays: 7,
      };
    });

    router.post('/api/council/agents/:id/enabled', { auth: { perm: 'ai.council.manage' }, body: z.object({ enabled: z.boolean(), reason: z.string().trim().min(5).max(300) }).strict() }, async (c) => {
      const a = await aiApi.getAgent(s, c.params.id!);
      if (!a) throw notFound('Unknown specialist.');
      if (a.id === 'founder-ai') throw conflict('The Founder AI is managed through its own autonomy settings.', 'use_founder_ai_settings');
      await setAgentEnabled(s, a.id, c.body.enabled, c.me.userId, c.body.reason);
      return { agent: card((await aiApi.getAgent(s, a.id))!) };
    });

    router.put('/api/council/agents/:id', {
      auth: { perm: 'ai.council.manage' },
      body: z.object({
        name: z.string().trim().min(2).max(30), title: z.string().trim().min(3).max(60), tagline: z.string().trim().max(120).optional(),
        responsibilities: z.array(z.string().trim().min(3).max(160)).min(1).max(8), capabilities: z.array(z.string()).min(1).max(15),
        toolPermissions: z.array(z.object({ tool: z.string().max(60), allowed: z.boolean(), note: z.string().max(160).optional() })).max(12).optional(),
        provider: z.string().max(30).nullable().optional(), model: z.string().max(60).nullable().optional(), reason: z.string().trim().min(5).max(300),
      }).strict(),
    }, async (c) => {
      const id = AGENT_ID.safeParse(c.params.id);
      if (!id.success) throw conflict('Use lowercase letters, numbers and dashes for the specialist id.', 'invalid_id');
      if (id.data === 'founder-ai') throw conflict('The Founder AI cannot be edited here.', 'protected');
      await c.requireStepUp(); // changing what an AI may do is a sensitive change
      const known = new Set((await aiApi.capabilityMatrix(s)).map((m) => m.id as string));
      const bad = c.body.capabilities.filter((x) => !known.has(x));
      if (bad.length) throw conflict(`Unknown capabilities: ${bad.join(', ')}.`, 'unknown_capability');
      const { reason, ...rest } = c.body;
      const result = await upsertAgent(s, { id: id.data, ...rest }, c.me.userId, reason);
      return { result, agent: card((await aiApi.getAgent(s, id.data))!) };
    });

    router.post('/api/council/agents/:id/health', { auth: { perm: 'ai.council.manage' }, rate: { key: 'council:health', limit: 10, windowMs: 60_000 } }, async (c) => {
      const r = await aiApi.checkHealth(s, c.params.id!);
      await audit(c.db, { actorId: c.me.userId, action: 'ai.health_check', targetType: 'ai_agent', targetId: c.params.id, outcome: r.ok ? 'success' : 'failed' }, c.now());
      return r;
    });
  },
};
