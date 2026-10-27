import { useEffect } from 'react';
import { api } from '../api/client';
import { browserKV } from '../lib/kv';
const kv = browserKV('local');
import { useSession } from './session';
import type { AccessibilitySettings } from '../../shared/api/settings';
import { setPrefs } from '../motion/store';

/** Applies appearance and accessibility choices as data attributes on <html>; styles.css reads them. */
export function applyA11y(a: Partial<AccessibilitySettings>) {
  const r = document.documentElement;
  r.dataset.text = a.textSize ?? 'md'; r.dataset.motion = a.reduceMotion ? 'reduce' : 'full'; r.dataset.contrast = a.highContrast ? 'high' : 'normal';
  setPrefs({ pref: a.decorativeMotion ?? 'full', reduceAll: !!a.reduceMotion });
  r.dataset.calm = a.calmBackground ? 'on' : 'off'; r.dataset.links = a.underlineLinks ? 'underline' : 'default';
  try { kv.set('a11y', JSON.stringify(a)); } catch { /* storage unavailable: the server copy still applies */ }
}
export function A11yApplier() {
  const { status, me } = useSession();
  useEffect(() => { try { const v = kv.get('a11y'); if (v) applyA11y(JSON.parse(v)); } catch { /* ignore */ } }, []);
  useEffect(() => { if (status === 'in' && me?.status === 'active') api.get<{ settings: { accessibility: AccessibilitySettings } }>('/api/settings').then((r) => applyA11y(r.settings.accessibility)).catch(() => {}); }, [status, me?.status]);
  return null;
}

/** The visitor's stored accessibility choices (also used before sign-in, so the landing page can offer a motion control). */
export function getStoredA11y(): Partial<AccessibilitySettings> { try { const v = kv.get('a11y'); return v ? JSON.parse(v) : {}; } catch { return {}; } }
export function setDecorativeMotion(v: 'full' | 'reduced' | 'off') { const next = { ...getStoredA11y(), decorativeMotion: v }; applyA11y(next); return next; }
