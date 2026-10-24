// Constants shared by the server and the browser bundle. Keep this file free of server-only imports.

export const MIN_AGE = 18;
export const MAX_AGE = 24; // FREEVERSE v1 is strictly for adults aged 18–24. Widening this is a Constitutional decision.
export const TERMS_VERSION = '2026-10-draft-1';
/** Version recorded for all three legal documents. They are drafts until counsel approves them. */
export const LEGAL_VERSION = TERMS_VERSION;
export const LEGAL_STATUS: 'draft' | 'approved' = 'draft';

export const AUDIENCES = ['everyone', 'members', 'connections', 'only_me'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABEL: Record<Audience, string> = {
  everyone: 'Everyone',
  members: 'Members of FREEVERSE',
  connections: 'Connections only',
  only_me: 'Only me',
};
export const AUDIENCE_HELP: Record<Audience, string> = {
  everyone: 'Anyone who can reach FREEVERSE. Signed-out web pages do not exist yet, so today this behaves like Members.',
  members: 'Any signed-in member who has not blocked you or been blocked by you.',
  connections: 'People you follow who also follow you back.',
  only_me: 'Visible to you alone.',
};

export const POST_KINDS = ['text', 'image', 'link', 'video_link', 'question', 'poll', 'article', 'creative', 'resource', 'event'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const REACTION_KINDS = ['like', 'love', 'insightful', 'celebrate', 'support'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REPORT_CATEGORIES = ['harassment', 'unwanted_contact', 'self_harm_crisis', 'spam', 'impersonation', 'illegal', 'other'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export const REPORT_TARGETS = ['post', 'comment', 'user', 'message'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const TAG_KINDS = ['interest', 'learn_topic', 'content_category', 'participation', 'creative', 'career', 'goal', 'community_interest', 'skill'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export const ARCHETYPES = [
  'student', 'graduate', 'researcher', 'creator', 'gamer', 'professional', 'entrepreneur', 'developer',
  'teacher', 'mentor', 'employer', 'investor', 'organization', 'volunteer', 'community_leader',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const ROLES = ['moderator', 'admin', 'guardian', 'director', 'high_council', 'council', 'founder'] as const;
export type Role = (typeof ROLES)[number];

/** The governance structure is 1–3–7–12–24, followed by citizens (members). */
export const GOVERNANCE_LEVELS = [
  { level: 1, role: 'founder', name: 'Founder', seats: 1 },
  { level: 3, role: 'council', name: 'Council', seats: 3 },
  { level: 7, role: 'high_council', name: 'High Council', seats: 7 },
  { level: 12, role: 'director', name: 'Directors', seats: 12 },
  { level: 24, role: 'guardian', name: 'Guardians', seats: 24 },
] as const;

export const AI_MODES = ['advisory', 'approval_required', 'bounded_autonomy'] as const;
export type AiMode = (typeof AI_MODES)[number];
export const AI_MODE_LABEL: Record<AiMode, string> = {
  advisory: 'Advisory',
  approval_required: 'Approval required',
  bounded_autonomy: 'Bounded autonomy',
};

export const SEVERITIES = ['low', 'medium', 'high'] as const;
export type Risk = (typeof SEVERITIES)[number];

export const REGISTRY_STATES = ['unavailable', 'available', 'configured', 'operational', 'demo'] as const;
export type CapabilityState = (typeof REGISTRY_STATES)[number];

export const LEARN_FORMATS = [
  'article', 'video', 'visual', 'infographic', 'audio', 'path', 'course', 'tutorial', 'project', 'quiz',
  'challenge', 'reading_list', 'research', 'download', 'book',
] as const;
export type LearnFormat = (typeof LEARN_FORMATS)[number];

export const OPPORTUNITY_TYPES = ['scholarship', 'internship', 'grant', 'entry_level_job', 'fellowship', 'competition', 'volunteer'] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const HANDLE_RE = /^[a-z0-9][a-z0-9._]{2,23}$/;
export const POST_MAX = 2000;
export const ARTICLE_MAX = 20000;
export const COMMENT_MAX = 1000;
export const MESSAGE_MAX = 2000;
