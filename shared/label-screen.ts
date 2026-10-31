// Screens short self-chosen labels (custom interests, aspirations, headlines, display names) for abuse before they are
// stored and shown to other people. This is a deliberately conservative first line, not a moderation system: it catches
// clear slurs and threats after undoing common obfuscation (spacing, punctuation, leetspeak, repeated letters). Anything
// it misses can still be reported, and moderators can hide it. A label is never silently altered; the person is told.
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
const BLOCKED = ['nigger', 'nigga', 'faggot', 'retard', 'kike', 'chink', 'spic', 'tranny', 'rapist', 'killyourself', 'kys', 'nazi', 'whore', 'cunt'];
// Only these are long and unambiguous enough to match inside a longer run of letters. Everything else must be a whole
// word (or the whole label), so "retardant", "skyscraper" and "Scunthorpe" are never refused.
const SUBSTRING_OK = new Set(['nigger', 'nigga', 'faggot', 'killyourself']);

export function normalizeLabel(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[0134578@$!]/g, (c) => LEET[c] ?? c).replace(/[^a-z\s]/g, '').replace(/(.)\1{2,}/g, '$1$1');
}
/** Returns a plain-language reason when the label should be refused, otherwise null. */
export function screenLabel(text: string): string | null {
  const n = normalizeLabel(text); const squashed = n.replace(/\s+/g, ''); const words = n.split(/\s+/).filter(Boolean);
  const msg = 'That wording isn’t allowed on FREEVERSE. Please choose a different label.';
  for (const term of BLOCKED) if (words.includes(term) || squashed === term || (SUBSTRING_OK.has(term) && squashed.includes(term))) return msg;
  return null;
}
