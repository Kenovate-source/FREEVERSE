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
  archived: boolean;
  /** Notifications for this conversation are muted. */
  muted: boolean;
  /** A request the recipient's settings sorted into "Filtered". Only ever true on the recipient's side. */
  filtered: boolean;
  /** What the other person lets you see. null means they keep it private (or it isn't known). */
  presence: { online: boolean | null; lastActive: string | null } | null;
}
export const REACTIONS = [{ id: 'like', label: 'Like', glyph: '👍' }, { id: 'heart', label: 'Love', glyph: '❤️' }, { id: 'laugh', label: 'Funny', glyph: '😂' }, { id: 'thanks', label: 'Thanks', glyph: '🙏' }, { id: 'think', label: 'Thinking', glyph: '🤔' }] as const;
export type ReactionId = (typeof REACTIONS)[number]['id'];
export interface MessageView {
  id: string; mine: boolean; body: string; at: string; deleted: boolean; seen: boolean;
  replyTo?: { id: string; preview: string; mine: boolean } | null;
  reactions?: { emoji: ReactionId; count: number; mine: boolean }[];
  /** When this message disappears, if its sender chose an expiry. */
  expiresAt?: string | null;
  /** Mine only: can I still remove it for both of us under my own delete window? */
  canDelete?: boolean;
}
export const MESSAGE_LIMITS = { bodyMax: 2000 } as const;
