import type { Audience } from './constants';

/** Profile fields that carry their own audience. Defaults keep sensitive personal data private. */
export const PROFILE_FIELDS = [
  'headline', 'bio', 'pronouns', 'gender', 'age_range', 'interests', 'identities', 'showcase', 'achievements',
  'communities', 'connections', 'learning_progress', 'avatar', 'cover',
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const FIELD_LABEL: Record<ProfileField, string> = {
  headline: 'Headline', bio: 'Bio', pronouns: 'Pronouns', gender: 'Gender', age_range: 'Age range',
  interests: 'Interests', identities: 'Identities (student, creator, …)', showcase: 'Showcase & projects',
  achievements: 'Achievements & credentials', communities: 'Communities you belong to', connections: 'Connections & follows',
  learning_progress: 'Learning progress', avatar: 'Photo and avatar', cover: 'Cover image',
};

/** Which audiences make sense for each field. 'everyone' is never offered for sensitive fields. */
export const FIELD_AUDIENCES: Record<ProfileField, readonly Audience[]> = {
  headline: ['everyone', 'members', 'connections', 'only_me'],
  bio: ['everyone', 'members', 'connections', 'only_me'],
  pronouns: ['members', 'connections', 'only_me'],
  gender: ['connections', 'only_me'],
  age_range: ['connections', 'only_me'],
  interests: ['everyone', 'members', 'connections', 'only_me'],
  identities: ['everyone', 'members', 'connections', 'only_me'],
  showcase: ['everyone', 'members', 'connections', 'only_me'],
  achievements: ['everyone', 'members', 'connections', 'only_me'],
  communities: ['members', 'connections', 'only_me'],
  connections: ['members', 'connections', 'only_me'],
  learning_progress: ['members', 'connections', 'only_me'],
  avatar: ['everyone', 'members', 'connections'],
  cover: ['everyone', 'members', 'connections', 'only_me'],
};

export const SENSITIVE_FIELDS: readonly ProfileField[] = ['gender', 'age_range'];

export interface PrivacySettings {
  preset: 'open' | 'balanced' | 'private' | 'custom';
  profile_visibility: Audience;
  discoverable: boolean;
  who_can_message: 'members' | 'connections' | 'nobody';
  who_can_mention: 'members' | 'connections' | 'nobody';
  online_status_visibility: 'members' | 'connections' | 'only_me';
  default_post_visibility: Audience;
  comments_on_profile: boolean;
  field_visibility: Partial<Record<ProfileField, Audience>>;
}

const BALANCED_FIELDS: Record<ProfileField, Audience> = {
  headline: 'members', bio: 'members', pronouns: 'members', gender: 'only_me', age_range: 'only_me', interests: 'members',
  identities: 'members', showcase: 'members', achievements: 'members', communities: 'members', connections: 'connections',
  learning_progress: 'only_me', avatar: 'members', cover: 'members',
};

export function presetSettings(preset: 'open' | 'balanced' | 'private'): PrivacySettings {
  if (preset === 'open') {
    return {
      preset, profile_visibility: 'everyone', discoverable: true, who_can_message: 'members', who_can_mention: 'members',
      online_status_visibility: 'members', default_post_visibility: 'everyone', comments_on_profile: true,
      field_visibility: { ...BALANCED_FIELDS, headline: 'everyone', bio: 'everyone', interests: 'everyone', identities: 'everyone', showcase: 'everyone', achievements: 'everyone', cover: 'everyone', avatar: 'everyone', communities: 'members', connections: 'members' },
    };
  }
  if (preset === 'private') {
    return {
      preset, profile_visibility: 'connections', discoverable: false, who_can_message: 'connections', who_can_mention: 'connections',
      online_status_visibility: 'only_me', default_post_visibility: 'connections', comments_on_profile: false,
      field_visibility: { ...BALANCED_FIELDS, headline: 'connections', bio: 'connections', pronouns: 'only_me', interests: 'connections', identities: 'connections', showcase: 'connections', achievements: 'connections', communities: 'only_me', connections: 'only_me', avatar: 'connections', cover: 'connections' },
    };
  }
  return {
    preset: 'balanced', profile_visibility: 'members', discoverable: true, who_can_message: 'members', who_can_mention: 'members',
    online_status_visibility: 'connections', default_post_visibility: 'members', comments_on_profile: false,
    field_visibility: { ...BALANCED_FIELDS },
  };
}

export const PRESET_HELP: Record<'open' | 'balanced' | 'private', string> = {
  open: 'Easy to find and talk to. Gender and age range stay private unless you change them.',
  balanced: 'Members can find you and see your profile. Sensitive details and learning progress stay private.',
  private: 'Only your connections see your profile, you are hidden from search, and you are not easy to message.',
};

/** Resolve the audience for one field, falling back to the balanced default. */
export function fieldAudience(s: Pick<PrivacySettings, 'field_visibility'>, f: ProfileField): Audience {
  return s.field_visibility[f] ?? BALANCED_FIELDS[f];
}
