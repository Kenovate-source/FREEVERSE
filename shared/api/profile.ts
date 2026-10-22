import type { Audience, TagKind } from '../constants';
import type { ProfileField } from '../privacy';
import type { AvatarConfig } from '../avatar';
import type { AvatarView, PersonCard, RelationFlags } from './social';

export const GENDER_OPTIONS = [
  { value: 'woman', label: 'Woman' }, { value: 'man', label: 'Man' }, { value: 'non_binary', label: 'Non-binary' },
  { value: 'self_described', label: 'I’ll describe it myself' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;
export type GenderValue = (typeof GENDER_OPTIONS)[number]['value'];

export interface TagItem { key: string; label: string; category: string | null; isCustom: boolean }
export type Personalization = Record<TagKind, TagItem[]>;

/** My own editable profile, including private fields. */
export interface MyProfile {
  handle: string; displayName: string; headline: string | null; bio: string | null; pronouns: string | null;
  gender: GenderValue | null; genderSelfDescription: string | null; accent: string | null;
  avatar: { mode: 'avatar' | 'photo' | 'both'; config: AvatarConfig; photoMediaId: string | null; photoUrl: string | null };
  cover: { mode: 'preset' | 'image'; presetId: string | null; mediaId: string | null; imageUrl: string | null };
}

export interface ProfilePatch { displayName?: string; handle?: string; headline?: string | null; bio?: string | null; pronouns?: string | null; gender?: GenderValue | null; genderSelfDescription?: string | null; accent?: string | null }
export interface AvatarPut { mode: 'avatar' | 'photo' | 'both'; config?: AvatarConfig; photoMediaId?: string | null }
export interface CoverPut { mode: 'preset' | 'image'; presetId?: string | null; mediaId?: string | null }

/** A profile as one viewer is allowed to see it. Fields are omitted (undefined), never sent as hidden placeholders. */
export interface MemberProfile {
  restricted: boolean; // true: viewer may not open this profile; only the stub fields below are present
  person: PersonCard;
  relation: RelationFlags;
  bio?: string | null;
  pronouns?: string | null;
  gender?: string | null;
  ageBand?: string | null;
  cover?: { mode: 'preset' | 'image'; presetId: string | null; imageUrl: string | null };
  interests?: { key: string; label: string; category: string | null }[];
  counts?: { followers: number; following: number; connections: number };
  online?: boolean;
  /** Which of your own fields this person could see is not exposed; this is only what they can see of theirs. */
  accent?: string | null;
}

export interface InterestCatalogResponse {
  categories: { id: string; label: string }[];
  interests: { key: string; label: string; category: string }[];
  suggestions: Record<Exclude<TagKind, 'interest' | 'skill'>, { key: string; label: string }[]>;
  limits: { perKind: number; customLabelMax: number };
}
export type PersonalizationPut = { kind: TagKind; items: { key?: string; label: string; category?: string | null; isCustom?: boolean }[] };
export type { AvatarView, Audience, ProfileField };
