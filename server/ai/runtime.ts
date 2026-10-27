import type { Services } from '../services';
import { json } from '../db';
import { uuid } from '../db';
import { HttpError } from '../http/errors';
import { KEYWORDS } from './agents';
import { loadAgent, loadAgents } from './registry';
import { AiProviderError } from './providers';
import type { AgentDef, AgentView, AiRuntimeApi, CapabilityId, CapabilityStatus, RouteDecision, CallAgentOptions, CallAgentResult } from './runtime-types';
import type { CapabilityState } from '../../shared/constants';
import { audit } from '../services/audit';

const TEXT_CAPS: [CapabilityId, string][] = [
  ['text.chat', 'Conversation'], ['text.write', 'Writing and rewriting'], ['text.summarize', 'Summarising'], ['translate', 'Translation'], ['research', 'Research help'],
  ['education', 'Learning support'], ['career', 'Career guidance'], ['entrepreneurship', 'Startup guidance'], ['governance.policy', 'Policy explanation'],
  ['security.moderation', 'Safety guidance'], ['wellbeing.nondiagnostic', 'Non-diagnostic wellbeing support'], ['recommendations', 'Recommendations'], ['planning', 'Planning'], ['code', 'Code help'], ['creative.design', 'Creative and design ideas'],
];
const NO_ADAPTER: [CapabilityId, string][] = [
  ['image.generate', 'Image generation'], ['image.understand', 'Image understanding'], ['video.generate', 'Video generation'], ['video.understand', 'Video understanding'],
  ['audio.speech', 'Speech'], ['audio.music', 'Music'], ['audio.transcribe', 'Transcription'], ['games', 'Games'], ['robotics.simulation', 'Robotics simulation'],
];
const RANK: Record<CapabilityState, number> = { unavailable: 0, available: 1, demo: 2, configured: 3, operational: 4 };

async function healthOk(s: Services, key: string): Promise<boolean> {
  const r = await s.db.get<{ value: unknown }>('SELECT value FROM platform_config WHERE key = $1', [`ai.health.${key}`]);
  const v = json<{ ok?: boolean; at?: string }>(r?.value, {});
  return !!v.ok && !!v.at && s.now().getTime() - new Date(v.at).getTime() < 24 * 3600_000;
}

async function capabilityMatrix(s: Services): Promise<CapabilityStatus[]> {
  const live = s.ai.provider === 'anthropic';
  const op = live && (await healthOk(s, 'anthropic'));
  const out: CapabilityStatus[] = [];
  for (const [id, label] of TEXT_CAPS) {
    out.push(live
      ? { id, label, state: op ? 'operational' : 'configured', provider: 'anthropic', detail: op ? 'A live round-trip to the model succeeded in the last 24 hours.' : 'An API key is configured, but no live round-trip has been verified yet. Run the health check.' }
      : { id, label, state: 'demo', provider: 'demo', detail: 'No AI model is connected. Replies are scripted stand-ins and always labelled as demo.' });
  }
  for (const [id, label] of NO_ADAPTER) out.push({ id, label, state: 'unavailable', detail: 'No integration exists for this in the current release. It can be added behind the provider interface.' });
  return out;
}

function view(a: AgentDef, matrix: CapabilityStatus[]): AgentView {
  const states = a.capabilities.map((c) => matrix.find((m) => m.id === c)).filter((x): x is CapabilityStatus => !!x);
  const best = states.reduce<CapabilityState>((b, c) => (RANK[c.state] > RANK[b] ? c.state : b), 'unavailable');
  const chatState = states.find((c) => c.id === 'text.chat')?.state ?? best;
  const available = a.enabled && RANK[chatState] >= RANK.demo;
  return { ...a, state: best, capabilityStates: states, available, ...(available ? {} : { unavailableReason: !a.enabled ? 'This specialist is switched off right now.' : 'Its capabilities have no working integration yet.' }) };
}

function score(text: string, id: string): number {
  const t = text.toLowerCase();
  return (KEYWORDS[id] ?? []).reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0);
}

export const SYSTEM_BASE =
  'You are an AI specialist inside FREEVERSE, a platform for adults aged 18 and over. Always be honest that you are an AI. Be warm, concise and practical. ' +
  'Never pretend to have taken an action, looked something up, or accessed anyone’s data unless it is explicitly given to you in this conversation. ' +
  'Do not diagnose or give medical, legal or financial instructions as if you were a professional; explain options and suggest qualified help. ' +
  'Do not encourage dependence on you; encourage people and real-world support. If someone may be in danger, encourage contacting local emergency services and someone they trust.';

async function catalogContext(s: Services, agent: AgentDef, text: string): Promise<string> {
  if (!agent.toolPermissions.some((p) => p.tool === 'catalog.search' && p.allowed)) return '';
  const words = text.toLowerCase().match(/[a-z]{4,}/g)?.slice(0, 6) ?? [];
  if (!words.length) return '';
  const like = `%${words[0]}%`;
  const items = await s.db.query<{ title: string; summary: string }>("SELECT title, summary FROM learn_items WHERE status = 'published' AND (lower(title) LIKE $1 OR lower(summary) LIKE $1) LIMIT 3", [like]);
  const opps = await s.db.query<{ title: string; organisation: string }>("SELECT title, organisation FROM opportunities WHERE status = 'published' AND (lower(title) LIKE $1 OR lower(description) LIKE $1) LIMIT 3", [like]);
  if (!items.length && !opps.length) return '';
  return `\n\nFREEVERSE catalogue results you may mention (illustrative demo catalogue; do not claim they are verified):\n${items.map((i) => `- Learn: ${i.title}`).join('\n')}\n${opps.map((o) => `- Opportunity: ${o.title} (${o.organisation})`).join('\n')}`;
}

export const aiApi: AiRuntimeApi = {
  async listAgents(s) { const m = await capabilityMatrix(s); return (await loadAgents(s.db, { includeHidden: true })).map((a) => view(a, m)); },
  async getAgent(s, id) { const a = await loadAgent(s.db, id); return a ? view(a, await capabilityMatrix(s)) : null; },
  capabilityMatrix,

  async route(s, text) {
    const m = await capabilityMatrix(s);
    const agents = (await loadAgents(s.db)).map((a) => view(a, m));
    const scored = agents.map((a) => ({ agentId: a.id, score: score(text, a.id) })).sort((x, y) => y.score - x.score);
    const best = scored[0];
    if (!best || best.score === 0) return { agentId: 'nova', confidence: 0.2, reason: 'No specialist stood out, so the everyday companion (Nova) is suggested.', alternatives: scored.slice(0, 3).map((x) => ({ agentId: x.agentId, score: 0 })) };
    const top = agents.find((a) => a.id === best.agentId)!;
    const total = scored.reduce((n, x) => n + x.score, 0);
    const decision: RouteDecision = { agentId: top.id, confidence: Math.min(0.95, best.score / total), reason: `Your message matches ${top.name}’s area: ${top.title}.`, alternatives: scored.slice(1, 4).filter((x) => x.score > 0) };
    if (!top.available) decision.unavailable = { agentId: top.id, reason: top.unavailableReason ?? 'Currently unavailable.' };
    return decision;
  },

  async callAgent(s, o: CallAgentOptions): Promise<CallAgentResult> {
    const agent = await aiApi.getAgent(s, o.agentId);
    if (!agent) throw new HttpError(404, 'agent_not_found', 'That specialist does not exist.');
    if (!agent.available) throw new HttpError(503, 'agent_unavailable', agent.unavailableReason ?? 'That specialist is unavailable.');
    const capability = o.capability ?? 'text.chat';
    const cap = agent.capabilityStates.find((c) => c.id === capability);
    if (!cap || cap.state === 'unavailable') throw new HttpError(503, 'capability_unavailable', 'That capability has no working integration yet.');
    const lastUser = [...o.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const started = Date.now();
    const usage = async (outcome: 'ok' | 'error' | 'blocked' | 'unavailable', mode: 'live' | 'demo', provider: string) =>
      s.db.run('INSERT INTO ai_usage (id, agent_id, user_id, capability, provider, mode, outcome, latency_ms, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [uuid(), agent.id, o.userId, capability, provider, mode, outcome, Date.now() - started, s.now().toISOString()]);
    try {
      const system = `${SYSTEM_BASE}\nYou are ${agent.name}, specialising in ${agent.title}. Your responsibilities: ${agent.responsibilities.join('; ')}.${o.system ? `\n${o.system}` : ''}${await catalogContext(s, agent, lastUser)}`;
      const r = await s.ai.complete({ agentId: agent.id, system, messages: o.messages.slice(-20), model: agent.model });
      await usage('ok', r.mode, r.provider);
      return { text: r.text, agentId: agent.id, provider: r.provider, model: r.model, mode: r.mode, capability };
    } catch (e) {
      await usage('error', s.ai.provider === 'demo' ? 'demo' : 'live', s.ai.provider);
      if (e instanceof AiProviderError) throw new HttpError(503, e.code, e.message);
      throw e;
    }
  },

  async checkHealth(s, agentId) {
    const a = await aiApi.getAgent(s, agentId);
    if (!a) return { ok: false, detail: 'Unknown specialist.' };
    if (s.ai.provider === 'demo') return { ok: false, detail: 'Demo mode: there is no live provider to check. Set ANTHROPIC_API_KEY and AI_PROVIDER=anthropic to enable one.' };
    try {
      await s.ai.complete({ agentId, system: 'Reply with the single word: ok', messages: [{ role: 'user', content: 'ping' }], maxTokens: 8, model: a.model });
      await s.db.run('INSERT INTO platform_config (key, value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at', ['ai.health.anthropic', { ok: true, at: s.now().toISOString() }, s.now().toISOString()]);
      return { ok: true, detail: 'A live round-trip succeeded.' };
    } catch (e) {
      await s.db.run('INSERT INTO platform_config (key, value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at', ['ai.health.anthropic', { ok: false, at: s.now().toISOString() }, s.now().toISOString()]);
      return { ok: false, detail: e instanceof Error ? e.message : 'The check failed.' };
    }
  },
};

export async function delegate(s: Services, o: { from: string; to: string; task: { title: string; prompt: string }; proposalId?: string | null; actorId?: string | null }) {
  const id = uuid(); const nowIso = s.now().toISOString();
  const target = await aiApi.getAgent(s, o.to);
  if (!target || !target.available) {
    await s.db.run("INSERT INTO ai_delegations (id, from_agent, to_agent, proposal_id, task, status, result, created_at, completed_at) VALUES ($1,$2,$3,$4,$5,'unavailable',$6,$7,$7)", [id, o.from, o.to, o.proposalId ?? null, o.task, { reason: target?.unavailableReason ?? 'Unknown specialist.' }, nowIso]);
    return { id, status: 'unavailable' as const, text: null, reason: target?.unavailableReason ?? 'Unknown specialist.', mode: null };
  }
  try {
    const r = await aiApi.callAgent(s, { agentId: o.to, userId: null, messages: [{ role: 'user', content: o.task.prompt }], system: `This is a delegated task from ${o.from} for the Founder. Be concise and state clearly what is fact and what is assumption.` });
    await s.db.run("INSERT INTO ai_delegations (id, from_agent, to_agent, proposal_id, task, status, result, created_at, completed_at) VALUES ($1,$2,$3,$4,$5,'completed',$6,$7,$7)", [id, o.from, o.to, o.proposalId ?? null, o.task, { text: r.text, mode: r.mode }, nowIso]);
    return { id, status: 'completed' as const, text: r.text, reason: null, mode: r.mode };
  } catch (e) {
    await s.db.run("INSERT INTO ai_delegations (id, from_agent, to_agent, proposal_id, task, status, result, created_at, completed_at) VALUES ($1,$2,$3,$4,$5,'failed',$6,$7,$7)", [id, o.from, o.to, o.proposalId ?? null, o.task, { error: e instanceof Error ? e.message : 'failed' }, nowIso]);
    return { id, status: 'failed' as const, text: null, reason: e instanceof Error ? e.message : 'failed', mode: null };
  }
}
void audit;
