import type { PersonCard } from './social';

export interface ConversationView {
  id: string;
  other: PersonCard; // "Deleted account" when the other person's account is gone
  status: 'accepted' | 'request' | 'declined';
  /** True when this person started it and the other has not accepted yet. */
  awaitingAcceptance: boolean;
  unread: number;
  lastMessage: { preview: string; at: string; mine: boolean } | null;
  canSend: boolean;
  cannotSendReason: string | null;
}
export interface MessageView { id: string; mine: boolean; body: string; at: string; deleted: boolean; seen: boolean }
export const MESSAGE_LIMITS = { bodyMax: 2000 } as const;
