export const SUGGESTION_CATEGORIES = [
  ['feature', 'A new feature'], ['improvement', 'Improve something that exists'], ['usability', 'Ease of use'], ['accessibility', 'Accessibility'], ['identity', 'Identity experiences'],
  ['communities', 'Communities'], ['universes', 'Universes'], ['ai', 'AI'], ['safety_privacy', 'Safety and privacy'], ['other', 'Something else'],
] as const;
export const SUGGESTION_STATUSES = [
  ['submitted', 'Submitted', 'Received. Not reviewed yet.'], ['under_review', 'Under review', 'Someone is looking at it.'], ['planned', 'Planned', 'We intend to do this. No date is promised.'],
  ['in_progress', 'In progress', 'Work has started.'], ['completed', 'Completed', 'This has shipped.'], ['declined', 'Declined', 'We decided not to do this, with a reason where we can give one.'], ['merged', 'Merged', 'Combined with a similar suggestion.'],
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number][0];
export const SUGGESTION_LIMITS = { titleMin: 5, titleMax: 100, bodyMin: 20, bodyMax: 2000, extraMax: 1000, areaMax: 60, perDay: 10 } as const;
export const statusLabel = (s: string) => SUGGESTION_STATUSES.find((x) => x[0] === s)?.[1] ?? s;
export const categoryLabel = (c: string) => SUGGESTION_CATEGORIES.find((x) => x[0] === c)?.[1] ?? c;

export interface SuggestionUpdateView { id: string; status: SuggestionStatus | null; note: string | null; at: string }
export interface SuggestionView { id: string; title: string; body: string; category: string; area: string | null; extra: string | null; status: SuggestionStatus; mergedInto: { id: string; title: string } | null; createdAt: string; updatedAt: string; updates: SuggestionUpdateView[] }
export interface StaffSuggestionView extends Omit<SuggestionView, 'updates'> { author: { handle: string } | null; updates: (SuggestionUpdateView & { internalNote: string | null; by: string | null })[] }

const STOP = new Set('the and for with that this have from your you are was but not can could should would add make more please want like when what which will also into about they them their there just than then some any all our out has had how its use using able allow'.split(' '));
export const keywordsOf = (t: string): string[] => [...new Set((t.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)))];
/** Groups suggestions that share several significant words. Plain word overlap, not AI: a hint for a human to check. */
export function groupSimilar<T extends { id: string; title: string; body: string }>(items: T[], minShared = 3): T[][] {
  const kw = items.map((i) => new Set(keywordsOf(`${i.title} ${i.title} ${i.body}`))); const parent = items.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) { let n = 0; for (const w of kw[a]!) if (kw[b]!.has(w)) n++; if (n >= minShared) parent[find(a)] = find(b); }
  const groups = new Map<number, T[]>(); items.forEach((it, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), it]); });
  return [...groups.values()].filter((g) => g.length > 1);
}
