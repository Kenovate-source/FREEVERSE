-- Remembers which one-off notices (an event reminder, a deadline, an achievement) were already considered, so they are never sent twice.
CREATE TABLE notice_log (
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notice_key TEXT NOT NULL,
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (user_id, notice_key)
);
