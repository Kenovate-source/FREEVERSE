-- Product suggestions from citizens. Private by default: the author sees their own and its public updates; a small review group sees the queue.
CREATE TABLE suggestions (
  id @ID PRIMARY KEY,
  author_id @ID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('feature','improvement','usability','accessibility','identity','communities','universes','ai','safety_privacy','other')),
  area TEXT,
  extra TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','planned','in_progress','completed','declined','merged')),
  merged_into @ID REFERENCES suggestions(id) ON DELETE SET NULL,
  created_at @TS NOT NULL DEFAULT @NOW,
  updated_at @TS NOT NULL DEFAULT @NOW
);
CREATE INDEX suggestions_author_idx ON suggestions (author_id, created_at);
CREATE INDEX suggestions_status_idx ON suggestions (status, created_at);

CREATE TABLE suggestion_updates (
  id @ID PRIMARY KEY,
  suggestion_id @ID NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  actor_id @ID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT,
  public_note TEXT,
  internal_note TEXT,
  created_at @TS NOT NULL DEFAULT @NOW
);
CREATE INDEX suggestion_updates_idx ON suggestion_updates (suggestion_id, created_at);
