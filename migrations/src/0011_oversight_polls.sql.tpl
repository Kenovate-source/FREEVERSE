-- Restricting access without removing an appointment, community oversight, and advisory polls with explicit eligibility.
ALTER TABLE role_grants ADD COLUMN restricted_at @TS;
ALTER TABLE role_grants ADD COLUMN restricted_by @ID;
ALTER TABLE role_grants ADD COLUMN restricted_reason TEXT;

ALTER TABLE communities ADD COLUMN restricted_at @TS;
ALTER TABLE communities ADD COLUMN restricted_by @ID;
ALTER TABLE communities ADD COLUMN restricted_reason TEXT;
ALTER TABLE communities ADD COLUMN restricted_prev @JSON;

-- Governance polls. (poll_votes already belongs to post polls, so these tables are prefixed gov_.)
CREATE TABLE gov_polls (
  id @ID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  eligibility TEXT NOT NULL CHECK (eligibility IN ('citizens','governance','community')),
  community_id @ID REFERENCES communities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','cancelled')),
  closes_at @TS,
  opened_at @TS,
  decision TEXT,
  decided_at @TS,
  cancel_reason TEXT,
  created_by @ID REFERENCES users(id) ON DELETE SET NULL,
  created_at @TS NOT NULL DEFAULT @NOW
);
CREATE TABLE gov_poll_options (
  id @ID PRIMARY KEY,
  poll_id @ID NOT NULL REFERENCES gov_polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
-- One vote per person per poll. Results are shown as totals only; who voted for what is never exposed.
CREATE TABLE gov_poll_votes (
  poll_id @ID NOT NULL REFERENCES gov_polls(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id @ID NOT NULL REFERENCES gov_poll_options(id) ON DELETE CASCADE,
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (poll_id, user_id)
);
CREATE INDEX gov_poll_options_idx ON gov_poll_options (poll_id, sort_order);
