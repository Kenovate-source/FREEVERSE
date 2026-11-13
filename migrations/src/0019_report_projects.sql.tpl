-- Projects can be reported and reviewed like posts. The CHECK lists of target types gain 'project'.
--@pg-begin
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('post','comment','user','message','project'));
ALTER TABLE moderation_cases DROP CONSTRAINT IF EXISTS moderation_cases_target_type_check;
ALTER TABLE moderation_cases ADD CONSTRAINT moderation_cases_target_type_check CHECK (target_type IN ('post','comment','user','message','ai_flag','project'));
--@pg-end
--@sqlite-begin
-- SQLite can't alter a CHECK in place; this is the documented schema-text edit (https://www.sqlite.org/lang_altertable.html#otheralter).
PRAGMA writable_schema = ON;
UPDATE sqlite_master SET sql = replace(sql, '''message'')),', '''message'',''project'')),') WHERE type = 'table' AND name = 'reports';
UPDATE sqlite_master SET sql = replace(sql, '''ai_flag'')),', '''ai_flag'',''project'')),') WHERE type = 'table' AND name = 'moderation_cases';
-- Changing the schema version makes every open connection re-read the edited schema.
PRAGMA schema_version = 1000000;
PRAGMA writable_schema = OFF;
--@sqlite-end
