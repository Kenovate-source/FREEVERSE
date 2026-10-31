-- Community configuration set by the people who run a community, and join requests for approval-only communities.
ALTER TABLE communities ADD COLUMN join_policy TEXT NOT NULL DEFAULT 'open';
ALTER TABLE communities ADD COLUMN post_policy TEXT NOT NULL DEFAULT 'members';
ALTER TABLE communities ADD COLUMN comment_policy TEXT NOT NULL DEFAULT 'members';
ALTER TABLE communities ADD COLUMN allow_links @BOOL NOT NULL DEFAULT @TRUE;
ALTER TABLE communities ADD COLUMN discoverable @BOOL NOT NULL DEFAULT @TRUE;
ALTER TABLE communities ADD COLUMN pinned_note TEXT;
ALTER TABLE communities ADD COLUMN created_by @ID;

CREATE TABLE community_join_requests (
  community_id @ID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  created_at @TS NOT NULL DEFAULT @NOW,
  decided_by @ID,
  decided_at @TS,
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_join_requests_status_idx ON community_join_requests (community_id, status);
