export const POLL_ELIGIBILITY = [
  ['citizens', 'All citizens', 'Every active member of FREEVERSE.'],
  ['governance', 'Governance members', 'People who currently hold a Council, High Council, Director or Guardian role with access not paused.'],
  ['community', 'One community’s members', 'Members of a single community.'],
] as const;
export const POLL_LIMITS = { titleMin: 5, titleMax: 120, descMin: 10, descMax: 1500, optionsMin: 2, optionsMax: 8, optionMax: 80, minHours: 1, maxDays: 60, decisionMin: 10, decisionMax: 600 } as const;
export type PollState = 'draft' | 'open' | 'closed' | 'cancelled';
export const POLL_STATE_LABEL: Record<PollState, string> = { draft: 'Draft (not published)', open: 'Open for voting', closed: 'Closed', cancelled: 'Cancelled' };
export interface PollOption { id: string; label: string; votes: number | null }
export interface PollView {
  id: string; title: string; description: string; state: PollState; eligibility: string; eligibilityText: string; communityName: string | null; closesAt: string | null; openedAt: string | null;
  options: PollOption[]; turnout: { votes: number; eligible: number }; viewer: { eligible: boolean; votedOptionId: string | null }; decision: string | null; decidedAt: string | null; cancelReason: string | null;
  advisory: string; resultsNote: string;
}
