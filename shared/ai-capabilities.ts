// What the assistants can take in and give back, stated honestly. Add a row here when a new input or output type is genuinely built;
// nothing in the interface may offer a capability that is not listed as available.
export type CapState = 'available' | 'device' | 'unavailable';
export interface InputCapability { id: string; label: string; state: CapState; detail: string }

export const AI_INPUTS: readonly InputCapability[] = [
  { id: 'text', label: 'Text conversation', state: 'available', detail: 'Type a message. Replies are text.' },
  { id: 'history', label: 'Conversation history', state: 'available', detail: 'Saved only if you keep history on. You choose how long it is kept and can delete it any time.' },
  { id: 'style', label: 'Tone and style preferences', state: 'available', detail: 'Your choices change wording only. They never change safety rules or what an assistant can access.' },
  { id: 'journal', label: 'Attach one journal entry', state: 'available', detail: 'Only an entry you pick, for that one message, and only if you turned the journal on.' },
  { id: 'read_aloud', label: 'Read replies aloud', state: 'device', detail: 'Uses the voices built into your own device and browser. Which voices exist depends on your device; FREEVERSE does not supply voices.' },
  { id: 'voice_in', label: 'Voice input and voice notes', state: 'unavailable', detail: 'Needs a speech-to-text provider and a decision on audio privacy. Not built. Use your keyboard’s dictation if your device has one.' },
  { id: 'image', label: 'Image input', state: 'unavailable', detail: 'Needs a provider that accepts images plus image moderation. Not built.' },
  { id: 'video', label: 'Video input', state: 'unavailable', detail: 'Not built, and not planned until image input and moderation exist.' },
  { id: 'documents', label: 'Document upload', state: 'unavailable', detail: 'Not built. Paste the text you want help with.' },
  { id: 'links', label: 'Opening links', state: 'unavailable', detail: 'Assistants do not fetch web pages. Paste the text instead.' },
];

export const CAP_LABEL: Record<CapState, string> = { available: 'Available', device: 'Depends on your device', unavailable: 'Not available yet' };

/** Plain-language view of an assistant's data permissions (from its tool permissions). */
export function permissionSummary(perms: { tool: string; allowed: boolean }[]): { can: string[]; cannot: string[] } {
  const can: string[] = []; const cannot: string[] = [];
  for (const p of perms) {
    if (p.tool === 'catalog.search') (p.allowed ? can : cannot).push('Search the public Learn, Opportunities, Events and Mentors catalogue');
    else if (p.tool === 'journal.attach') (p.allowed ? can : cannot).push('Read a journal entry only when you attach it to a message');
    else if (p.tool === 'private.messages_journals') (p.allowed ? can : cannot).push('Read your private messages or journals on its own');
    else if (p.tool === 'platform.write') (p.allowed ? can : cannot).push('Change anything on FREEVERSE');
    else if (p.tool === 'moderation.decide') (p.allowed ? can : cannot).push('Decide moderation outcomes');
    else if (p.tool === 'platform.read_aggregates') (p.allowed ? can : cannot).push('Read platform-wide counts (no private content)');
  }
  return { can, cannot };
}
