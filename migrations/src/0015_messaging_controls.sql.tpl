-- Messaging controls: replies, reactions, archive, per-conversation mute, filtered requests and message expiry.
-- Each column is optional and defaults to today's behaviour, so older rows and older code keep working.
ALTER TABLE messages ADD COLUMN reply_to_id @ID;
ALTER TABLE messages ADD COLUMN expires_at @TS;
CREATE INDEX messages_expiry_idx ON messages (expires_at);
ALTER TABLE conversation_members ADD COLUMN archived_at @TS;
ALTER TABLE conversation_members ADD COLUMN muted @BOOL NOT NULL DEFAULT @FALSE;
ALTER TABLE conversation_members ADD COLUMN filtered @BOOL NOT NULL DEFAULT @FALSE;
CREATE TABLE message_reactions (
  message_id @ID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id @ID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('like','heart','laugh','thanks','think')),
  created_at @TS NOT NULL DEFAULT @NOW,
  PRIMARY KEY (message_id, user_id)
);
