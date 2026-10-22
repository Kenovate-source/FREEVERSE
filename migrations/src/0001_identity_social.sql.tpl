-- FREEVERSE schema, part 1: accounts, auth identities, profiles, privacy, social graph, content, messaging.
-- AUTHORING FORMAT: this template is rendered by scripts/render-migrations.mjs into plain SQL for each dialect
-- (migrations/postgres/*.sql and migrations/sqlite/*.sql). Edit the template, then run `npm run db:render`.
-- Tokens: @ID @TS @JSON @BOOL @NOW @TRUE @FALSE. Lines starting with --@pg or --@sqlite are dialect-only.
-- Conventions: ids are application-generated UUIDs; timestamps are ISO-8601 (timestamptz on PostgreSQL, TEXT on SQLite);
-- booleans are boolean / INTEGER 0|1; JSON is jsonb / TEXT. Money is not stored anywhere in this release.

-- ───────────────────────────── accounts ─────────────────────────────
CREATE TABLE users (
  id @ID PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending_eligibility'
    CHECK (status IN ('pending_eligibility','active','ineligible','suspended','deleted')),
  handle TEXT,
  display_name TEXT,
  -- Eligibility (Decision 4): only month + year are ever stored. The exact day is used transiently and discarded.
  birth_month INTEGER CHECK (birth_month BETWEEN 1 AND 12),
  birth_year INTEGER CHECK (birth_year BETWEEN 1900 AND 2100),
  age_check_method TEXT CHECK (age_check_method IN ('self_declared_birthdate')),
  age_check_status TEXT CHECK (age_check_status IN ('self_attested','verified')),
  age_attested_at @TS,
  eligibility_attempts INTEGER NOT NULL DEFAULT 0,
  -- 'founder': the Founder may be over 24. No other exemption exists. Recorded so it is visible in review.
  eligibility_exemption TEXT CHECK (eligibility_exemption IN ('founder')),
  terms_version TEXT,
  terms_accepted_at @TS,
  onboarding_path TEXT CHECK (onboarding_path IN ('identity_first','guided_discovery')),
  onboarding_step TEXT,
  onboarding_data @JSON NOT NULL DEFAULT '{}',
  onboarding_completed_at @TS,
  suspended_until @TS,
  created_at @TS NOT NULL DEFAULT @NOW,
  updated_at @TS NOT NULL DEFAULT @NOW,
  last_seen_at @TS,
  deleted_at @TS,
  -- Fictional demo members seeded for development/demonstration; always labelled as demo in the UI.
  is_demo @BOOL NOT NULL DEFAULT @FALSE
);
CREATE UNIQUE INDEX users_handle_uq ON users (handle) WHERE handle IS NOT NULL;
CREATE INDEX users_status_idx ON users (status);

-- Links a FREEVERSE user to a login at an authentication provider (ADR-003). Passwords are never stored here.
CREATE TABLE auth_identities (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('dev','supabase')),
  subject TEXT NOT NULL,
  email TEXT,
  email_verified @BOOL NOT NULL DEFAULT @FALSE,
  created_at @TS NOT NULL DEFAULT @NOW,
  last_sign_in_at @TS,
  UNIQUE (provider, subject)
);
CREATE INDEX auth_identities_user_idx ON auth_identities (user_id);
CREATE INDEX auth_identities_email_idx ON auth_identities (email);

-- Accounts and sessions for the local DEVELOPMENT auth provider only (passwords are NOT stored or checked).
-- Unused when AUTH_PROVIDER=supabase; the dev provider refuses to run in production.
CREATE TABLE dev_accounts (
  subject @ID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at @TS NOT NULL DEFAULT @NOW
);
CREATE TABLE dev_sessions (
  token_hash TEXT PRIMARY KEY,
  subject @ID NOT NULL REFERENCES dev_accounts(subject) ON DELETE CASCADE,
  created_at @TS NOT NULL DEFAULT @NOW,
  expires_at @TS NOT NULL
);

-- Short-lived re-authentication grants for sensitive actions (autonomy changes, approvals, appointments).
CREATE TABLE step_up_grants (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at @TS NOT NULL DEFAULT @NOW,
  expires_at @TS NOT NULL
);

-- ───────────────────────────── media ─────────────────────────────
CREATE TABLE media (
  id @ID PRIMARY KEY,
  owner_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('avatar','cover','post','showcase')),
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  storage_key TEXT NOT NULL,
  alt_text TEXT,
  created_at @TS NOT NULL DEFAULT @NOW,
  deleted_at @TS
);
CREATE INDEX media_owner_idx ON media (owner_id);

-- ───────────────────────────── profile, privacy, settings ─────────────────────────────
CREATE TABLE profiles (
  user_id @ID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT,
  bio TEXT,
  pronouns TEXT,
  gender TEXT,
  gender_self_description TEXT,
  avatar_mode TEXT NOT NULL DEFAULT 'avatar' CHECK (avatar_mode IN ('avatar','photo','both')),
  avatar_config @JSON NOT NULL DEFAULT '{}',
  avatar_media_id @ID REFERENCES media(id) ON DELETE SET NULL,
  cover_mode TEXT NOT NULL DEFAULT 'preset' CHECK (cover_mode IN ('preset','image')),
  cover_preset TEXT,
  cover_media_id @ID REFERENCES media(id) ON DELETE SET NULL,
  accent TEXT,
  created_at @TS NOT NULL DEFAULT @NOW,
  updated_at @TS NOT NULL DEFAULT @NOW
);

-- Queryable privacy controls are columns; the per-field audience map lives in field_visibility (JSON).
CREATE TABLE user_privacy (
  user_id @ID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preset TEXT NOT NULL DEFAULT 'balanced' CHECK (preset IN ('open','balanced','private','custom')),
  profile_visibility TEXT NOT NULL DEFAULT 'members' CHECK (profile_visibility IN ('everyone','members','connections','only_me')),
  discoverable @BOOL NOT NULL DEFAULT @TRUE,
  who_can_message TEXT NOT NULL DEFAULT 'members' CHECK (who_can_message IN ('members','connections','nobody')),
  who_can_mention TEXT NOT NULL DEFAULT 'members' CHECK (who_can_mention IN ('members','connections','nobody')),
  online_status_visibility TEXT NOT NULL DEFAULT 'connections' CHECK (online_status_visibility IN ('members','connections','only_me')),
  default_post_visibility TEXT NOT NULL DEFAULT 'members' CHECK (default_post_visibility IN ('everyone','members','connections','only_me')),
  comments_on_profile @BOOL NOT NULL DEFAULT @FALSE,
  field_visibility @JSON NOT NULL DEFAULT '{}',
  updated_at @TS NOT NULL DEFAULT @NOW
);

CREATE TABLE user_settings (
  user_id @ID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notifications @JSON NOT NULL DEFAULT '{}',
  messaging @JSON NOT NULL DEFAULT '{}',
  accessibility @JSON NOT NULL DEFAULT '{}',
  nova @JSON NOT NULL DEFAULT '{}',
  updated_at @TS NOT NULL DEFAULT @NOW
);

-- Personalization: interests, topics to learn, goals etc. all share one table, distinguished by kind.
CREATE TABLE user_tags (
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('interest','learn_topic','content_category','participation','creative','career','goal','community_interest','skill')),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT,
  is_custom @BOOL NOT NULL DEFAULT @FALSE,
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (user_id, kind, key)
);
CREATE INDEX user_tags_key_idx ON user_tags (kind, key);

-- ───────────────────────────── identities (archetypes) & evolving profile ─────────────────────────────
CREATE TABLE user_identities (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archetype TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','removed')),
  is_primary @BOOL NOT NULL DEFAULT @FALSE,
  headline TEXT,
  data @JSON NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('everyone','members','connections','only_me')),
  created_at @TS NOT NULL DEFAULT @NOW,
  updated_at @TS NOT NULL DEFAULT @NOW,
  removed_at @TS
);
CREATE UNIQUE INDEX user_identities_one_live_uq ON user_identities (user_id, archetype) WHERE status <> 'removed';
CREATE INDEX user_identities_user_idx ON user_identities (user_id);

-- Things a profile shows: projects, publications, achievements, credentials, experience... evidence_type keeps
-- self-declared claims distinct from platform-recorded and verified ones.
CREATE TABLE profile_entries (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_id @ID REFERENCES user_identities(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('project','publication','achievement','credential','experience','skill','showcase','contribution','mentoring','venture','research_output','game_highlight')),
  title TEXT NOT NULL,
  description TEXT,
  link TEXT,
  media_id @ID REFERENCES media(id) ON DELETE SET NULL,
  data @JSON NOT NULL DEFAULT '{}',
  occurred_on TEXT,
  evidence_type TEXT NOT NULL DEFAULT 'self_declared' CHECK (evidence_type IN ('self_declared','platform_recorded','verified')),
  evidence_ref TEXT,
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('everyone','members','connections','only_me')),
  pinned @BOOL NOT NULL DEFAULT @FALSE,
  created_at @TS NOT NULL DEFAULT @NOW,
  updated_at @TS NOT NULL DEFAULT @NOW
);
CREATE INDEX profile_entries_user_idx ON profile_entries (user_id, kind);

-- Evidence-based suggestions: never applied automatically, the person accepts or dismisses them.
CREATE TABLE profile_suggestions (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  draft @JSON NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed')),
  created_at @TS NOT NULL DEFAULT @NOW,
  decided_at @TS,
  UNIQUE (user_id, evidence_ref, kind)
);

-- ───────────────────────────── social graph ─────────────────────────────
CREATE TABLE follows (
  follower_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee_idx ON follows (followee_id);

CREATE TABLE blocks (
  blocker_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE mutes (
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (user_id, muted_id),
  CHECK (user_id <> muted_id)
);

-- ───────────────────────────── communities & content ─────────────────────────────
CREATE TABLE communities (
  id @ID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  allow_anonymous @BOOL NOT NULL DEFAULT @FALSE,
  rules @JSON NOT NULL DEFAULT '[]',
  accent TEXT,
  is_demo @BOOL NOT NULL DEFAULT @FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at @TS NOT NULL DEFAULT @NOW
);

CREATE TABLE community_members (
  community_id @ID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator')),
  show_on_profile @BOOL NOT NULL DEFAULT @TRUE,
  joined_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_members_user_idx ON community_members (user_id);

-- author_id is ALWAYS recorded (abuse prevention, moderation, account deletion). is_anonymous only controls what
-- ordinary viewers are shown; serializers must never emit author_id for anonymous rows.
CREATE TABLE posts (
  id @ID PRIMARY KEY,
  author_id @ID REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','link','video_link','question','poll','article','creative','resource','event')),
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  community_id @ID REFERENCES communities(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('everyone','members','connections','only_me')),
  is_anonymous @BOOL NOT NULL DEFAULT @FALSE,
  data @JSON NOT NULL DEFAULT '{}',
  tags @JSON NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','removed','deleted')),
  removed_reason TEXT,
  created_at @TS NOT NULL DEFAULT @NOW,
  edited_at @TS,
  deleted_at @TS,
  CHECK (is_anonymous = @FALSE OR community_id IS NOT NULL)
);
CREATE INDEX posts_created_idx ON posts (created_at);
CREATE INDEX posts_author_idx ON posts (author_id, created_at);
CREATE INDEX posts_community_idx ON posts (community_id, created_at);

CREATE TABLE post_media (
  post_id @ID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id @ID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, media_id)
);

CREATE TABLE poll_votes (
  post_id @ID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (post_id, user_id)
);

-- author_id becomes NULL when an account is deleted but replies from other people must stay readable (tombstone).
CREATE TABLE comments (
  id @ID PRIMARY KEY,
  post_id @ID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id @ID REFERENCES comments(id) ON DELETE CASCADE,
  author_id @ID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_anonymous @BOOL NOT NULL DEFAULT @FALSE,
  depth INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','removed','deleted')),
  created_at @TS NOT NULL DEFAULT @NOW,
  edited_at @TS,
  deleted_at @TS
);
CREATE INDEX comments_post_idx ON comments (post_id, created_at);
CREATE INDEX comments_author_idx ON comments (author_id);

-- Stable pseudonyms inside one thread ("Anonymous member 3"). alias_no 0 is the anonymous original poster.
CREATE TABLE post_anon_aliases (
  post_id @ID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias_no INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id),
  UNIQUE (post_id, alias_no)
);

CREATE TABLE reactions (
  target_type TEXT NOT NULL CHECK (target_type IN ('post','comment')),
  target_id @ID NOT NULL,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('like','love','insightful','celebrate','support')),
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (target_type, target_id, user_id)
);
CREATE INDEX reactions_target_idx ON reactions (target_type, target_id);

CREATE TABLE collections (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at @TS NOT NULL DEFAULT @NOW,
  UNIQUE (user_id, name)
);

CREATE TABLE saved_items (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('post','learn','opportunity','event','mentor','community','member')),
  ref_id @ID NOT NULL,
  collection_id @ID REFERENCES collections(id) ON DELETE SET NULL,
  created_at @TS NOT NULL DEFAULT @NOW,
  UNIQUE (user_id, kind, ref_id)
);

CREATE TABLE notifications (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_id @ID REFERENCES users(id) ON DELETE CASCADE,
  actor_anonymous @BOOL NOT NULL DEFAULT @FALSE,
  target_type TEXT,
  target_id @ID,
  data @JSON NOT NULL DEFAULT '{}',
  created_at @TS NOT NULL DEFAULT @NOW,
  read_at @TS
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at);

-- ───────────────────────────── direct messages ─────────────────────────────
CREATE TABLE conversations (
  id @ID PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct')),
  direct_key TEXT UNIQUE,
  created_at @TS NOT NULL DEFAULT @NOW,
  last_message_at @TS
);

-- status 'request' = the recipient has not yet accepted a first message from someone they don't follow (Trust & Safety Policy).
CREATE TABLE conversation_members (
  conversation_id @ID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','request','declined')),
  last_read_at @TS,
  joined_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members (user_id);

-- sender_id is NULL after the sender deletes their account: the message stays for continuity under a neutral identity.
CREATE TABLE messages (
  id @ID PRIMARY KEY,
  conversation_id @ID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id @ID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at @TS NOT NULL DEFAULT @NOW,
  deleted_at @TS
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
