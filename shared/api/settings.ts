// Settings and privacy API shapes. Other workers read user_settings.nova / notifications: keep key names exactly as below.
import type { Audience } from '../constants';
import type { PrivacySettings, ProfileField } from '../privacy';

export interface NotificationSettings { comments: boolean; replies: boolean; reactions: boolean; follows: boolean; mentions: boolean; messages: boolean; message_request: boolean; system: boolean; events: boolean }
export interface MessagingSettings { readReceipts: boolean; allowMessageRequests: boolean; /** Enter sends the message (Shift+Enter adds a line). */ enterToSend: boolean; density: 'comfortable' | 'compact' }
export interface AccessibilitySettings { textSize: 'sm' | 'md' | 'lg' | 'xl'; reduceMotion: boolean; decorativeMotion?: 'auto' | 'full' | 'reduced' | 'off'; highContrast: boolean; calmBackground: boolean; underlineLinks: boolean }
export interface NovaSettings { journalEnabled: boolean; goalsEnabled: boolean; habitsEnabled: boolean; historyRetentionDays: null | 30 | 90 | 365; saveHistory: boolean }

export interface Settings { notifications: NotificationSettings; messaging: MessagingSettings; accessibility: AccessibilitySettings; nova: NovaSettings }
export type SettingsPatch = { [K in keyof Settings]?: Partial<Settings[K]> };

export const DEFAULT_SETTINGS: Settings = {
  notifications: { comments: true, replies: true, reactions: true, follows: true, mentions: true, messages: true, message_request: true, system: true, events: true },
  messaging: { readReceipts: true, allowMessageRequests: true, enterToSend: false, density: 'comfortable' },
  accessibility: { textSize: 'md', reduceMotion: false, decorativeMotion: 'auto', highContrast: false, calmBackground: false, underlineLinks: false },
  nova: { journalEnabled: false, goalsEnabled: false, habitsEnabled: false, historyRetentionDays: null, saveHistory: true },
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
      else if (k === 'density') { if (v === 'comfortable' || v === 'compact') target[k] = v; }
      else if (k === 'textSize') { if (v === 'sm' || v === 'md' || v === 'lg' || v === 'xl') target[k] = v; }
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
