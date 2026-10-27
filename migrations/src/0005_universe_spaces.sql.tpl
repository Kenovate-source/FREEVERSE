-- Universe spaces: posts can belong to a Universe and a template; "I'm in" participation; single-player game scores.
ALTER TABLE posts ADD COLUMN universe TEXT;
ALTER TABLE posts ADD COLUMN template TEXT;
ALTER TABLE posts ADD COLUMN facet TEXT;
CREATE INDEX posts_universe_idx ON posts (universe, template, facet, created_at);

CREATE TABLE post_participation (
  post_id @ID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX post_participation_user_idx ON post_participation (user_id);

CREATE TABLE game_scores (
  id @ID PRIMARY KEY,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  score INTEGER NOT NULL,
  show_name @BOOL NOT NULL DEFAULT @FALSE,
  created_at @TS NOT NULL DEFAULT @NOW
);
CREATE INDEX game_scores_game_idx ON game_scores (game, score);
CREATE INDEX game_scores_user_idx ON game_scores (user_id, game);
