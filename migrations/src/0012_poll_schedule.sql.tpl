-- Polls can be scheduled to open later, and eligible people are told when a poll opens, closes or is decided.
-- opens_at: when voting starts (NULL = opened at publish). *_notified_at make the notification sweep idempotent.
ALTER TABLE gov_polls ADD COLUMN opens_at @TS;
ALTER TABLE gov_polls ADD COLUMN open_notified_at @TS;
ALTER TABLE gov_polls ADD COLUMN close_notified_at @TS;
ALTER TABLE gov_polls ADD COLUMN decision_notified_at @TS;
