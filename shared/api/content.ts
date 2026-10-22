// Wire types for communities, posts, comments, reactions, saved items and notifications.
import type { PersonCard } from './social';
import type { PostKind, ReactionKind, Audience } from '../constants';

export interface CommunityView {
  id: string; slug: string; name: string; description: string; category: string; accent: string | null;
  allowAnonymous: boolean; rules: string[]; isDemo: boolean; memberCount: number; postCount: number;
  viewer: { member: boolean; role: 'member' | 'moderator' | null; showOnProfile: boolean };
}

/** What a viewer sees in place of an author. For anonymous content this carries NO account identifier, ever. */
export type AuthorView =
  | { anonymous: false; person: PersonCard }
  | { anonymous: true; alias: string };

export interface PostMedia { id: string; url: string; altText: string | null; width: number | null; height: number | null }
export interface PollView { options: { label: string; votes: number | null }[]; total: number; votedIndex: number | null; resultsVisible: boolean; closesAt: string | null }

export interface PostView {
  id: string;
  kind: PostKind;
  title: string | null;
  body: string;
  tags: string[];
  visibility: Audience;
  community: { id: string; slug: string; name: string } | null;
  author: AuthorView;
  status: 'published' | 'removed' | 'deleted';
  /** Plain-language note when the content is not shown ("Removed by moderators: harassment"). */
  notice: string | null;
  createdAt: string;
  editedAt: string | null;
  data: Record<string, unknown>;
  media: PostMedia[];
  poll: PollView | null;
  counts: { comments: number; reactions: Partial<Record<ReactionKind, number>>; reactionTotal: number };
  viewer: { mine: boolean; reaction: ReactionKind | null; saved: boolean; canEdit: boolean; canDelete: boolean; canComment: boolean };
  /** Present for the "relevant" sort: a human-readable reason the post is ranked where it is. */
  why?: string[];
}

export interface CommentView {
  id: string; postId: string; parentId: string | null; depth: number;
  author: AuthorView;
  body: string;
  status: 'published' | 'removed' | 'deleted';
  notice: string | null;
  createdAt: string; editedAt: string | null;
  counts: { reactions: Partial<Record<ReactionKind, number>>; reactionTotal: number };
  viewer: { mine: boolean; reaction: ReactionKind | null; canEdit: boolean; canDelete: boolean };
}

export interface FeedResponse { items: PostView[]; nextCursor: string | null; sort: 'recent' | 'relevant' | 'following'; explanation: string }
export interface CommentsResponse { items: CommentView[]; total: number }

export const POST_LIMITS = { titleMax: 140, bodyMax: 5000, commentMax: 2000, tagsMax: 5, tagMax: 24, pollOptionsMin: 2, pollOptionsMax: 6, pollOptionMax: 80, mediaMax: 4, maxDepth: 3 } as const;

export const REACTION_LABEL: Record<ReactionKind, string> = { like: 'Like', love: 'Love', insightful: 'Insightful', celebrate: 'Celebrate', support: 'Support' };

export type SavedKind = 'post' | 'learn' | 'opportunity' | 'event' | 'mentor' | 'community' | 'member';
export interface SavedItemView {
  id: string; kind: SavedKind; refId: string; collectionId: string | null; createdAt: string;
  /** Resolved display data. Null when the saved thing is gone or no longer visible to the viewer. */
  title: string | null; subtitle: string | null; href: string | null; available: boolean;
}
export interface CollectionView { id: string; name: string; count: number }

export interface NotificationView {
  id: string; type: string; createdAt: string; readAt: string | null;
  actor: AuthorView | null;
  text: string; href: string | null;
}
