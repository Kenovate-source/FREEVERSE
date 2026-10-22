import type { CapabilityState } from '../constants';

export interface AiConversationView { id: string; agentId: string; title: string; pinned: boolean; createdAt: string; updatedAt: string; preview: string | null; messageCount: number }
export interface AiMessageView { id: string; role: 'user' | 'assistant' | 'notice'; body: string; createdAt: string; meta: { mode?: 'live' | 'demo'; provider?: string; agentId?: string; safety?: 'crisis' | 'elevated'; attached?: 'journal' } }
export interface CrisisResource { label: string; detail: string; url?: string }
export interface AiSendResult { userMessage: AiMessageView | null; assistantMessage: AiMessageView; mode: 'live' | 'demo' | 'safety'; safety: null | { severity: 'crisis' | 'elevated'; resources: CrisisResource[] } }
export const AI_LIMITS = { messageMax: 4000, titleMax: 80 } as const;

export interface AgentCard {
  id: string; name: string; title: string; tagline: string; responsibilities: string[]; state: CapabilityState; available: boolean; unavailableReason?: string; enabled: boolean;
  capabilities: { id: string; label: string; state: CapabilityState; detail: string }[];
  toolPermissions: { tool: string; allowed: boolean; note?: string }[];
}
