-- Habits: when they happen. Times are stored 24-hour (HH:MM, so AM/PM can never be ambiguous) with the IANA time zone
-- they were set in; days are weekday numbers 0 (Sunday) to 6, comma separated, empty meaning every day.
ALTER TABLE habits ADD COLUMN days TEXT NOT NULL DEFAULT '';
ALTER TABLE habits ADD COLUMN time_of_day TEXT;
ALTER TABLE habits ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE habits ADD COLUMN reminder @BOOL NOT NULL DEFAULT @FALSE;
