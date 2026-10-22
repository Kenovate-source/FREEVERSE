import type { Services } from '../services';
import type { Db } from '../db';
import { bool, json } from '../db';
import { FOUNDER_AI, FOUNDING_AGENTS } from './agents';
import type { AgentDef } from './runtime-types';
import { audit } from '../services/audit';

const fromRow = (r: any): AgentDef => ({
  id: r.id, name: r.name, title: r.title, tagline: r.tagline, responsibilities: json(r.responsibilities, []), capabilities: json(r.capabilities, []), toolPermissions: json(r.tool_permissions, []),
  provider: r.provider ?? null, model: r.model ?? null, enabled: bool(r.enabled), isFounding: bool(r.is_founding), sortOrder: Number(r.sort_order), config: json(r.config, {}),
});

export async function seedAgents(s: Services): Promise<void> {
  const nowIso = s.now().toISOString();
  for (const a of [...FOUNDING_AGENTS, FOUNDER_AI]) {
    if (await s.db.get('SELECT 1 AS x FROM ai_agents WHERE id = $1', [a.id])) continue;
    await s.db.run(
      `INSERT INTO ai_agents (id, name, title, tagline, responsibilities, capabilities, tool_permissions, provider, model, enabled, is_founding, sort_order, config, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [a.id, a.name, a.title, a.tagline, a.responsibilities, a.capabilities, a.toolPermissions, a.provider, a.model, a.enabled, a.isFounding, a.sortOrder, a.config, nowIso]);
  }
}

export async function loadAgents(db: Db, opts: { includeHidden?: boolean } = {}): Promise<AgentDef[]> {
  const rows = await db.query<any>('SELECT * FROM ai_agents ORDER BY sort_order, name');
  return rows.map(fromRow).filter((a) => opts.includeHidden || !(a.config as any).hidden);
}
export async function loadAgent(db: Db, id: string): Promise<AgentDef | null> {
  const r = await db.get<any>('SELECT * FROM ai_agents WHERE id = $1', [id]);
  return r ? fromRow(r) : null;
}

/** Enable or disable a specialist. Audited. The Founder AI itself cannot be disabled from here (its boundaries are a high-impact change). */
export async function setAgentEnabled(s: Services, agentId: string, enabled: boolean, actorId: string, reason: string): Promise<void> {
  const a = await loadAgent(s.db, agentId);
  if (!a) throw new Error('unknown agent');
  await s.db.run('UPDATE ai_agents SET enabled = $2, updated_by = $3, updated_at = $4 WHERE id = $1', [agentId, enabled, actorId, s.now().toISOString()]);
  await audit(s.db, { actorId, action: enabled ? 'ai.agent_enabled' : 'ai.agent_disabled', targetType: 'ai_agent', targetId: agentId, reason }, s.now());
}

export interface AgentInput { id: string; name: string; title: string; tagline?: string; responsibilities: string[]; capabilities: string[]; toolPermissions?: { tool: string; allowed: boolean; note?: string }[]; provider?: string | null; model?: string | null; sortOrder?: number }

/** Add a new specialist or update an existing one. Founding specialists keep their identity (name/id) but may be reconfigured. */
export async function upsertAgent(s: Services, a: AgentInput, actorId: string, reason: string): Promise<'created' | 'updated'> {
  const existing = await loadAgent(s.db, a.id);
  const nowIso = s.now().toISOString();
  if (existing) {
    await s.db.run(
      `UPDATE ai_agents SET title = $2, tagline = $3, responsibilities = $4, capabilities = $5, tool_permissions = $6, provider = $7, model = $8, sort_order = $9, updated_by = $10, updated_at = $11 WHERE id = $1`,
      [a.id, a.title, a.tagline ?? existing.tagline, a.responsibilities, a.capabilities, a.toolPermissions ?? existing.toolPermissions, a.provider ?? null, a.model ?? null, a.sortOrder ?? existing.sortOrder, actorId, nowIso]);
  } else {
    await s.db.run(
      `INSERT INTO ai_agents (id, name, title, tagline, responsibilities, capabilities, tool_permissions, provider, model, enabled, is_founding, sort_order, config, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [a.id, a.name, a.title, a.tagline ?? '', a.responsibilities, a.capabilities, a.toolPermissions ?? [{ tool: 'private.messages_journals', allowed: false }], a.provider ?? null, a.model ?? null, false, false, a.sortOrder ?? 200, {}, actorId, nowIso]);
  }
  await audit(s.db, { actorId, action: existing ? 'ai.agent_updated' : 'ai.agent_added', targetType: 'ai_agent', targetId: a.id, reason }, s.now());
  return existing ? 'updated' : 'created';
}
