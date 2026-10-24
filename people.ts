import type { Services } from './index';
import { bool, json, placeholders } from '../db';
import { relations, audienceAllows, type Relation } from '../policy/visibility';
import { fieldAudience, type PrivacySettings } from '../../shared/privacy';
import { signedMediaUrl } from './media-urls';

export interface AvatarView {
  mode: 'avatar' | 'photo' | 'both';
  /** Avatar builder configuration (see shared/avatar.ts). Always present so a default can be drawn. */
  config: Record<string, unknown>;
  /** Short-lived signed URL, present only when the viewer is allowed to see the photo. */
  photoUrl: string | null;
}

/** The public face of a person, as one viewer is allowed to see it. Used by every module that shows someone else. */
export interface PersonCard {
  id: string | null;
  handle: string | null;
  displayName: string;
  headline: string | null;
  avatar: AvatarView;
  isSelf: boolean;
  /** True when the account no longer exists. Shown as a neutral "Deleted account". */
  deleted: boolean;
  /** True when a block (either direction) means the viewer should see nothing about this person. */
  restricted: boolean;
  /** True for fictional seeded demo members. The UI must label them. */
  isDemo: boolean;
}

const NEUTRAL_AVATAR: AvatarView = { mode: 'avatar', config: { seed: 'neutral' }, photoUrl: null };
export const deletedCard = (): PersonCard => ({ id: null, handle: null, displayName: 'Deleted account', headline: null, avatar: NEUTRAL_AVATAR, isSelf: false, deleted: true, restricted: false, isDemo: false });

/**
 * Batch-loads cards for many people. Respects blocks, account status, and the per-field audience of avatar and headline.
 * NEVER call this for the author of anonymous content.
 */
export async function personCards(s: Services, viewerId: string, userIds: (string | null)[]): Promise<Map<string, PersonCard>> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  const out = new Map<string, PersonCard>();
  if (!ids.length) return out;
  const rows = await s.db.query<any>(
    `SELECT u.id, u.status, u.is_demo, u.handle, u.display_name, p.headline, p.avatar_mode, p.avatar_config, p.avatar_media_id,
            pr.field_visibility, pr.profile_visibility
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN user_privacy pr ON pr.user_id = u.id
      WHERE u.id IN (${placeholders(1, ids.length)})`, ids);
  const rel = await relations(s.db, viewerId, ids);
  const byId = new Map<string, any>(rows.map((r: any) => [r.id, r]));
  for (const id of ids) {
    const r = byId.get(id);
    const rl: Relation = rel.get(id)!;
    if (!r || r.status === 'deleted') { out.set(id, deletedCard()); continue; }
    if (rl.blocked && !rl.self) { out.set(id, { ...deletedCard(), displayName: 'Unavailable member', deleted: false, restricted: true }); continue; }
    const priv: Pick<PrivacySettings, 'field_visibility'> = { field_visibility: json(r.field_visibility, {}) };
    const showAvatar = audienceAllows(fieldAudience(priv, 'avatar'), rl);
    const showHeadline = audienceAllows(fieldAudience(priv, 'headline'), rl);
    const mode = (r.avatar_mode ?? 'avatar') as AvatarView['mode'];
    const photoOk = showAvatar && r.avatar_media_id && mode !== 'avatar';
    out.set(id, {
      id, handle: r.handle ?? null, displayName: r.display_name ?? 'Member', headline: showHeadline ? r.headline ?? null : null,
      avatar: {
        mode: photoOk ? mode : 'avatar',
        config: json<Record<string, unknown>>(r.avatar_config, {}),
        photoUrl: photoOk ? signedMediaUrl(s, viewerId, r.avatar_media_id) : null,
      },
      isSelf: rl.self, deleted: false, restricted: false, isDemo: bool(r.is_demo),
    });
  }
  return out;
}
void bool;
