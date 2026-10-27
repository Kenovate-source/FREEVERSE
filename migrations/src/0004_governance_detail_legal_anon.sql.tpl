-- Governance seat definitions (scope, reporting line, permission boundaries), legal acceptance records and anonymous-posting controls.
ALTER TABLE governance_seats ADD COLUMN seat_key TEXT;
ALTER TABLE governance_seats ADD COLUMN scope TEXT;
ALTER TABLE governance_seats ADD COLUMN reports_to TEXT;
ALTER TABLE governance_seats ADD COLUMN boundaries TEXT;
ALTER TABLE governance_seats ADD COLUMN area TEXT;
ALTER TABLE governance_seats ADD COLUMN defaults_version INTEGER;

-- Which version of each legal document a member accepted, and when. Append-only.
CREATE TABLE legal_acceptances (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document TEXT NOT NULL CHECK (document IN ('terms','privacy','community_rules')),
  version TEXT NOT NULL,
  accepted_at @TS NOT NULL DEFAULT @NOW,
  UNIQUE (user_id, document, version)
);
CREATE INDEX legal_acceptances_user_idx ON legal_acceptances (user_id);
