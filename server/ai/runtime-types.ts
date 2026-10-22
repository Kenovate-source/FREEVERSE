// FROZEN CONTRACT between the AI worker (implements server/ai/runtime.ts) and the Founder-AI/governance worker (consumes it).
// Do not change signatures without updating both sides.
import type { Services } from '../services';
import type { CapabilityState } from '../../shared/constants';

export type CapabilityId =
  | 'text.chat' | 'text.write' | 'text.summarize' | 'translate' | 'research' | 'education' | 'career' | 'entrepreneurship'
  | 'governance.policy' | 'security.moderation' | 'wellbeing.nondiagnostic' | 'recommendations' | 'planning'
  | 'image.generate' | 'image.understand' | 'video.generate' | 'video.understand' | 'audio.speech' | 'audio.music' | 'audio.transcribe'
  | 'games' | 'code' | 'robotics.simulation' | 'creative.design';

export interface CapabilityStatus {
  id: CapabilityId;
  label: string;
  /** unavailable: no integration exists. available: integration code exists but is not configured.
   *  configured: credentials present but not verified. operational: a health check succeeded recently.
   *  demo: only a scripted stand-in exists (never presented as real AI). */
  state: CapabilityState;
  detail: string;
  provider?: string;
}

export interface ToolPermission { tool: string; allowed: boolean; note?: string }

export interface AgentDef {
  id: string; // e.g. 'athena', 'nova', 'founder-ai'
  name: string;
  title: string; // e.g. 'Learning & Research'
  tagline: string;
  responsibilities: string[];
  capabilities: CapabilityId[];
  toolPermissions: ToolPermission[];
  provider: string | null;
  model: string | null;
  enabled: boolean;
  isFounding: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
}

export interface AgentView extends AgentDef {
  /** Overall state = the best state among its capabilities that the agent can use right now. */
  state: CapabilityState;
  capabilityStates: CapabilityStatus[];
  available: boolean;
  unavailableReason?: string;
}

export interface RouteDecision {
  agentId: string | null;
  confidence: number; // 0..1
  reason: string;
  alternatives: { agentId: string; score: number }[];
  /** Set when the best specialist exists but cannot currently serve (disabled / capability unavailable). */
  unavailable?: { agentId: string; reason: string };
}

export interface CallAgentOptions {
  agentId: string;
  userId: string | null;
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Extra system instructions appended after the agent's own. */
  system?: string;
  capability?: CapabilityId;
}

export interface CallAgentResult {
  text: string;
  agentId: string;
  provider: string; // 'demo' | 'anthropic' | ...
  model: string;
  /** 'demo' = scripted reply, not a real AI. Callers must label it. */
  mode: 'live' | 'demo';
  capability: CapabilityId;
  blocked?: { reason: string };
}

export interface AiRuntimeApi {
  listAgents(s: Services): Promise<AgentView[]>;
  getAgent(s: Services, id: string): Promise<AgentView | null>;
  route(s: Services, text: string): Promise<RouteDecision>;
  capabilityMatrix(s: Services): Promise<CapabilityStatus[]>;
  callAgent(s: Services, o: CallAgentOptions): Promise<CallAgentResult>;
  /** Performs a real provider round-trip if configured; records the result so state can become 'operational'. */
  checkHealth(s: Services, agentId: string): Promise<{ ok: boolean; detail: string }>;
}
