-- "How I describe myself": many labels per person, from a shared catalogue or custom, each with a stage that can change over time.
-- Self-declared and cosmetic: these rows are never read by authorization.
CREATE TABLE identity_labels (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT,
  is_custom @BOOL NOT NULL DEFAULT @FALSE,
  stage TEXT NOT NULL DEFAULT 'current' CHECK (stage IN ('current','aspiring','exploring')),
  note TEXT,
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('everyone','members','connections','only_me')),
  created_at @TS NOT NULL DEFAULT @NOW,
  updated_at @TS NOT NULL DEFAULT @NOW,
  UNIQUE (user_id, key)
);
CREATE INDEX identity_labels_user_idx ON identity_labels (user_id, stage);
-- A person's own record of how a label changed (for example from "becoming" to "I am").
CREATE TABLE identity_label_events (
  id @ID PRIMARY KEY,
  label_id @ID NOT NULL REFERENCES identity_labels(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  occurred_at @TS NOT NULL DEFAULT @NOW
);
CREATE INDEX identity_label_events_idx ON identity_label_events (label_id, occurred_at);
