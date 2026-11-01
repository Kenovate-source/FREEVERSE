import { useEffect, useState } from 'react';
import { Button } from '../ui/kit';

// Read-aloud uses the speech voices that ship with the person's own device or browser. Nothing is sent to FREEVERSE or an AI provider,
// and the list of voices (and how each one sounds or is described) is whatever the device offers. The choice is stored on this device only.
const KEY = 'fv.voice';
export interface VoicePref { name: string; rate: number }
export const loadVoicePref = (): VoicePref => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v && typeof v.name === 'string' && typeof v.rate === 'number') return { name: v.name, rate: Math.min(1.6, Math.max(0.6, v.rate)) }; } catch { /* storage unavailable */ } return { name: '', rate: 1 }; };
export const saveVoicePref = (p: VoicePref) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } };
export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export function useVoices(): SpeechSynthesisVoice[] {
  const [v, setV] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => { if (!speechSupported()) return; const load = () => setV(window.speechSynthesis.getVoices()); load(); window.speechSynthesis.addEventListener?.('voiceschanged', load); return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load); }, []);
  return v;
}

export function speak(text: string, pref: VoicePref, onEnd?: () => void): void {
  if (!speechSupported()) return; window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 4000)); const voice = window.speechSynthesis.getVoices().find((x) => x.name === pref.name); if (voice) { u.voice = voice; u.lang = voice.lang; } u.rate = pref.rate; u.onend = () => onEnd?.(); u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function ReadAloud({ text }: { text: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => () => { if (speechSupported()) window.speechSynthesis.cancel(); }, []);
  if (!speechSupported()) return null;
  return <Button size="sm" variant="ghost" aria-pressed={on} onClick={() => { if (on) { window.speechSynthesis.cancel(); setOn(false); } else { setOn(true); speak(text, loadVoicePref(), () => setOn(false)); } }}>{on ? 'Stop reading' : 'Read aloud'}</Button>;
}
