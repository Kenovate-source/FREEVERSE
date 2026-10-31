-- Achievements are computed, never deleted. This only records whether the person chose to show one on their profile.
CREATE TABLE achievement_display (
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  is_public @BOOL NOT NULL DEFAULT @FALSE,
  updated_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (user_id, achievement_id)
);
