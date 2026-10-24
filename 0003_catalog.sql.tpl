-- FREEVERSE schema, part 3: curated catalog (Learn, Opportunities, Mentors, Events) and per-person state on it.
-- Catalog rows seeded by the application are flagged is_demo: they are illustrative, not a live catalogue.

CREATE TABLE learn_items (
  id @ID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL CHECK (format IN ('article','video','infographic','audio','path','course','tutorial','project','quiz','challenge','reading_list','research','download','book','visual')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body @JSON NOT NULL DEFAULT '[]',
  category TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner','intermediate','advanced','all')),
  minutes INTEGER,
  art TEXT,
  tags @JSON NOT NULL DEFAULT '[]',
  is_demo @BOOL NOT NULL DEFAULT @TRUE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft','archived')),
  created_at @TS NOT NULL DEFAULT @NOW
);
CREATE INDEX learn_items_category_idx ON learn_items (category);

CREATE TABLE learn_path_items (
  path_id @ID NOT NULL REFERENCES learn_items(id) ON DELETE CASCADE,
  item_id @ID NOT NULL REFERENCES learn_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (path_id, item_id)
);

CREATE TABLE learn_progress (
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id @ID NOT NULL REFERENCES learn_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  percent INTEGER NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  data @JSON NOT NULL DEFAULT '{}',
  updated_at @TS NOT NULL DEFAULT @NOW,
  completed_at @TS,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE opportunities (
  id @ID PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('scholarship','internship','grant','entry_level_job','fellowship','competition','volunteer')),
  title TEXT NOT NULL,
  organisation TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  work_mode TEXT NOT NULL DEFAULT 'remote' CHECK (work_mode IN ('remote','hybrid','on_site')),
  location TEXT,
  deadline TEXT,
  apply_url TEXT,
  tags @JSON NOT NULL DEFAULT '[]',
  is_demo @BOOL NOT NULL DEFAULT @TRUE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','closed','draft')),
  created_at @TS NOT NULL DEFAULT @NOW
);

CREATE TABLE opportunity_tracking (
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id @ID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('interested','applied','interviewing','offer','declined')),
  updated_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE TABLE mentors (
  id @ID PRIMARY KEY,
  name TEXT NOT NULL,
  headline TEXT NOT NULL,
  bio TEXT NOT NULL,
  expertise @JSON NOT NULL DEFAULT '[]',
  availability_note TEXT,
  art TEXT,
  is_demo @BOOL NOT NULL DEFAULT @TRUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused'))
);

CREATE TABLE mentor_requests (
  id @ID PRIMARY KEY,
  user_id @ID REFERENCES users(id) ON DELETE CASCADE,
  mentor_id @ID NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','facilitated','closed')),
  created_at @TS NOT NULL DEFAULT @NOW,
  UNIQUE (user_id, mentor_id)
);

CREATE TABLE events (
  id @ID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('virtual','in_person','hybrid')),
  location TEXT,
  starts_at @TS NOT NULL,
  ends_at @TS,
  capacity INTEGER,
  art TEXT,
  is_demo @BOOL NOT NULL DEFAULT @TRUE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','cancelled','draft'))
);
CREATE INDEX events_start_idx ON events (starts_at);

CREATE TABLE event_rsvps (
  event_id @ID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('yes','maybe','no')),
  updated_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (event_id, user_id)
);

-- "Tell me when this exists": real, persisted interest in planned areas (Marketplace, Games, Watch, Calls, ...).
CREATE TABLE feature_interest (
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (user_id, feature_key)
);
