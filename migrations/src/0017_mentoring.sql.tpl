-- Real mentors. A member applies, a reviewer approves, then they appear in the directory and receive requests.
-- Demo mentors keep working exactly as before: user_id stays empty and review_status stays 'approved'.
ALTER TABLE mentors ADD COLUMN user_id @ID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE mentors ADD COLUMN review_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE mentors ADD COLUMN reviewed_by @ID;
ALTER TABLE mentors ADD COLUMN reviewed_at @TS;
ALTER TABLE mentors ADD COLUMN review_note TEXT;
ALTER TABLE mentors ADD COLUMN capacity INTEGER NOT NULL DEFAULT 3;
ALTER TABLE mentors ADD COLUMN submitted_at @TS;
CREATE UNIQUE INDEX mentors_user_idx ON mentors (user_id);
CREATE INDEX mentors_review_idx ON mentors (review_status);
-- A mentor's answer to a request. status stays received / facilitated (accepted) / closed (declined or ended).
ALTER TABLE mentor_requests ADD COLUMN reply TEXT;
ALTER TABLE mentor_requests ADD COLUMN responded_at @TS;
