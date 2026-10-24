export const LEARN_FORMATS = ['article', 'video', 'infographic', 'audio', 'path', 'course', 'tutorial', 'project', 'quiz', 'challenge', 'reading_list', 'research', 'download', 'book', 'visual'] as const;
export type LearnFormat = (typeof LEARN_FORMATS)[number];
export const LEARN_FORMAT_LABEL: Record<LearnFormat, string> = { article: 'Article', video: 'Video', infographic: 'Infographic', audio: 'Audio', path: 'Learning path', course: 'Course', tutorial: 'Tutorial', project: 'Project', quiz: 'Quiz', challenge: 'Challenge', reading_list: 'Reading list', research: 'Research', download: 'Download', book: 'Book', visual: 'Visual' };
export const OPP_TYPES = ['scholarship', 'internship', 'grant', 'entry_level_job', 'fellowship', 'competition', 'volunteer'] as const;
export type OppType = (typeof OPP_TYPES)[number];
export const OPP_TYPE_LABEL: Record<OppType, string> = { scholarship: 'Scholarship', internship: 'Internship', grant: 'Grant', entry_level_job: 'Entry-level job', fellowship: 'Fellowship', competition: 'Competition', volunteer: 'Volunteering' };
export const TRACK_STATUSES = ['interested', 'applied', 'interviewing', 'offer', 'declined'] as const;
export type TrackStatus = (typeof TRACK_STATUSES)[number];

export type LearnBlock = { t: 'h'; text: string } | { t: 'p'; text: string } | { t: 'list'; items: string[] } | { t: 'step'; title: string; text: string } | { t: 'question'; id: string; prompt: string; options: string[]; answer: number; explain: string } | { t: 'stat'; value: string; label: string } | { t: 'link'; label: string; url: string };

export interface LearnCard { id: string; slug: string; format: LearnFormat; title: string; summary: string; category: string; level: string; minutes: number | null; art: string | null; tags: string[]; isDemo: boolean; saved: boolean; progress: { status: 'in_progress' | 'completed'; percent: number } | null; pathItemCount?: number }
export interface LearnDetail extends LearnCard { body: LearnBlock[]; pathItems?: LearnCard[]; demoNotice: string | null }
export interface LearnList { items: LearnCard[]; total: number; categories: { key: string; count: number }[]; formats: { key: LearnFormat; count: number }[]; notice: string | null }

export interface OpportunityCard { id: string; type: OppType; title: string; organisation: string; description: string; category: string; workMode: string; location: string | null; deadline: string | null; applyUrl: string | null; tags: string[]; isDemo: boolean; saved: boolean; tracking: TrackStatus | null }
export interface MentorCard { id: string; name: string; headline: string; bio: string; expertise: string[]; availabilityNote: string | null; art: string | null; isDemo: boolean; saved: boolean; requested: boolean }
export interface EventCard { id: string; title: string; description: string; category: string; format: string; location: string | null; startsAt: string; endsAt: string | null; capacity: number | null; art: string | null; isDemo: boolean; saved: boolean; myResponse: 'yes' | 'maybe' | 'no' | null; counts: { yes: number; maybe: number } }

export interface UniverseView { id: string; name: string; tagline: string; description: string; status: string; statusLabel: string; today: string[]; route: string | null; basis: string; accent: string; note: string | null; interested: boolean; interestedCount: number }
export interface SearchHit { kind: 'member' | 'community' | 'post' | 'learn' | 'opportunity' | 'event' | 'mentor' | 'page'; id: string; title: string; subtitle: string | null; href: string; isDemo?: boolean }
export interface SearchResponse { q: string; groups: { kind: SearchHit['kind']; label: string; items: SearchHit[] }[]; total: number }
