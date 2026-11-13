// Settings and privacy API shapes. Other workers read user_settings.nova / notifications: keep key names exactly as below.
import type { Audience } from '../constants';
import type { PrivacySettings, ProfileField } from '../privacy';
import { DEFAULT_AI_STYLE, STYLE_NOTE_MAX, isStyleValue, type AiStyle, type StyleKey } from '../ai-style';

export interface NotificationSettings { comments: boolean; replies: boolean; reactions: boolean; follows: boolean; mentions: boolean; messages: boolean; message_request: boolean; system: boolean; events: boolean; opportunities: boolean; learning: boolean; achievements: boolean; ai: boolean; announcements: boolean; safety: boolean }
/** Allowed values for the messaging choices. The server refuses anything else, and the settings page builds its menus from these. */
export const MSG_CHOICES = {
  requestsFrom: ['everyone', 'followers', 'nobody'], requestHandling: ['allow', 'filter', 'restrict'], lastActiveVisibility: ['members', 'connections', 'nobody'],
  defaultExpiry: ['never', '24h', '7d', '30d'], archiveBehaviour: ['stay', 'return'], deleteWindow: ['anytime', '24h', '1h'],
  chatTheme: ['default', 'calm', 'contrast'], bubbleStyle: ['rounded', 'square', 'minimal'], chatBackground: ['plain', 'soft', 'dots'], chatTextSize: ['sm', 'md', 'lg'],
  organisation: ['recent', 'unread_first'], defaultView: ['all', 'unread'],
} as const;
export type MsgChoice<K extends keyof typeof MSG_CHOICES> = (typeof MSG_CHOICES)[K][number];
export interface MessagingSettings {
  readReceipts: boolean; /** Older yes/no form of requestsFrom: false means nobody. */ allowMessageRequests: boolean;
  /** Enter sends the message (Shift+Enter adds a line). */ enterToSend: boolean; density: 'comfortable' | 'compact';
  requestsFrom: MsgChoice<'requestsFrom'>; requestHandling: MsgChoice<'requestHandling'>; lastActiveVisibility: MsgChoice<'lastActiveVisibility'>;
  defaultExpiry: MsgChoice<'defaultExpiry'>; allowReactions: boolean; allowReplies: boolean; archiveBehaviour: MsgChoice<'archiveBehaviour'>; deleteWindow: MsgChoice<'deleteWindow'>;
  quietEnabled: boolean; quietStart: string; quietEnd: string; /** Minutes east of UTC, set from the device so quiet hours follow the person's own clock. */ quietOffset: number;
  chatTheme: MsgChoice<'chatTheme'>; bubbleStyle: MsgChoice<'bubbleStyle'>; chatBackground: MsgChoice<'chatBackground'>; chatTextSize: MsgChoice<'chatTextSize'>;
  organisation: MsgChoice<'organisation'>; defaultView: MsgChoice<'defaultView'>; linkWarnings: boolean;
}
/** Pointer style for the default arrow only. Links, buttons and text fields keep their normal cursors, and touch devices never get one. */
export const CURSOR_STYLES = ['standard', 'graduate', 'creator-pen', 'creator-brush', 'developer', 'entrepreneur'] as const;
export type CursorStyle = (typeof CURSOR_STYLES)[number];
export interface AccessibilitySettings { textSize: 'sm' | 'md' | 'lg' | 'xl'; reduceMotion: boolean; decorativeMotion?: 'auto' | 'full' | 'reduced' | 'off'; cursor?: CursorStyle; highContrast: boolean; calmBackground: boolean; underlineLinks: boolean }
export interface NovaSettings extends AiStyle { journalEnabled: boolean; goalsEnabled: boolean; habitsEnabled: boolean; historyRetentionDays: null | 30 | 90 | 365; saveHistory: boolean }

export interface Settings { notifications: NotificationSettings; messaging: MessagingSettings; accessibility: AccessibilitySettings; nova: NovaSettings }
export type SettingsPatch = { [K in keyof Settings]?: Partial<Settings[K]> };

export const DEFAULT_SETTINGS: Settings = {
  notifications: { comments: true, replies: true, reactions: true, follows: true, mentions: true, messages: true, message_request: true, system: true, events: true, opportunities: true, learning: true, achievements: true, ai: true, announcements: true, safety: true },
  messaging: {
    readReceipts: true, allowMessageRequests: true, enterToSend: false, density: 'comfortable', requestsFrom: 'everyone', requestHandling: 'allow', lastActiveVisibility: 'connections',
    defaultExpiry: 'never', allowReactions: true, allowReplies: true, archiveBehaviour: 'return', deleteWindow: 'anytime', quietEnabled: false, quietStart: '22:00', quietEnd: '07:00', quietOffset: 0,
    chatTheme: 'default', bubbleStyle: 'rounded', chatBackground: 'plain', chatTextSize: 'md', organisation: 'recent', defaultView: 'all', linkWarnings: true,
  },
  accessibility: { textSize: 'md', reduceMotion: false, decorativeMotion: 'auto', cursor: 'standard', highContrast: false, calmBackground: false, underlineLinks: false },
  nova: { journalEnabled: false, goalsEnabled: false, habitsEnabled: false, historyRetentionDays: null, saveHistory: true, ...DEFAULT_AI_STYLE },
};

/** Merges stored (possibly partial / older) values over the defaults. Unknown keys are dropped. Usable on the server. */
export function mergeSettings(stored: Partial<Record<keyof Settings, unknown>> | null | undefined): Settings {
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
  for (const cat of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const s = (stored?.[cat] ?? {}) as Record<string, unknown>;
    const target = out[cat] as unknown as Record<string, unknown>;
    for (const k of Object.keys(target)) {
      if (!(k in s)) continue;
      const v = s[k];
      if (k === 'historyRetentionDays') { if (v === null || v === 30 || v === 90 || v === 365) target[k] = v; }
      else if (k === 'styleNote') { if (typeof v === 'string') target[k] = v.slice(0, STYLE_NOTE_MAX); }
      else if (k === 'tone' || k === 'formality' || k === 'humor' || k === 'detail' || k === 'coaching') { if (isStyleValue(k as StyleKey, v)) target[k] = v; }
      else if (k in MSG_CHOICES) { if ((MSG_CHOICES[k as keyof typeof MSG_CHOICES] as readonly unknown[]).includes(v)) target[k] = v; }
      else if (k === 'quietStart' || k === 'quietEnd') { if (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) target[k] = v; }
      else if (k === 'quietOffset') { if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 840) target[k] = v; }
      else if (k === 'density') { if (v === 'comfortable' || v === 'compact') target[k] = v; }
      else if (k === 'textSize') { if (v === 'sm' || v === 'md' || v === 'lg' || v === 'xl') target[k] = v; }
      else if (k === 'decorativeMotion') { if (v === 'auto' || v === 'full' || v === 'reduced' || v === 'off') target[k] = v; }
      else if (k === 'cursor') { if ((CURSOR_STYLES as readonly unknown[]).includes(v)) target[k] = v; }
      else if (typeof v === 'boolean') target[k] = v;
    }
  }
  return out;
}

export interface PrivacyView extends PrivacySettings {
  /** Plain-language explanation of what each control does right now, keyed by setting name or `field:<name>`. */
  effects: Record<string, string>;
  fieldAudiences: Record<ProfileField, readonly Audience[]>;
}
export type PrivacyPatch = Partial<Omit<PrivacySettings, 'preset'>>;

/** Are we inside this person's quiet hours at `now`? The window may wrap midnight. Pure, so the server and tests agree. */
export function inQuietHours(m: Pick<MessagingSettings, 'quietEnabled' | 'quietStart' | 'quietEnd' | 'quietOffset'>, now: Date): boolean {
  if (!m.quietEnabled) return false;
  const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const local = (((now.getUTCHours() * 60 + now.getUTCMinutes() + m.quietOffset) % 1440) + 1440) % 1440;
  const a = mins(m.quietStart), b = mins(m.quietEnd);
  if (a === b) return false;
  return a < b ? local >= a && local < b : local >= a || local < b;
}
export const EXPIRY_MS = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 } as const;
export const DELETE_WINDOW_MS = { '24h': 86_400_000, '1h': 3_600_000 } as const;
