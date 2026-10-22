export interface AvatarView { mode: 'avatar' | 'photo' | 'both'; config: Record<string, unknown>; photoUrl: string | null }
/** Mirrors server/services/people.ts PersonCard. */
export interface PersonCard { id: string | null; handle: string | null; displayName: string; headline: string | null; avatar: AvatarView; isSelf: boolean; deleted: boolean; restricted: boolean; isDemo: boolean }

export interface RelationFlags { following: boolean; followedBy: boolean; connection: boolean; blockedByMe: boolean; muted: boolean }
export interface MemberListItem { person: PersonCard; sharedInterests: { key: string; label: string }[]; reason?: string; relation: RelationFlags }
export interface MemberListResponse { items: MemberListItem[]; nextCursor: string | null }
export interface PeopleListResponse { items: PersonCard[]; hidden: boolean }
export interface BlockListResponse { items: PersonCard[] }
