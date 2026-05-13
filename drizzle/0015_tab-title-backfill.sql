-- Backfill tab titles for the tutor-tab-rename feature.
-- Mode.displayName is now the source of truth for tab-strip labels.
-- Only bootstrap and study-skills have displayName !== modeId.
-- Note: user-customized tab titles are unconditionally rewritten here.
-- Pre-v1 tradeoff; a future titleSource:'auto'|'user' column can preserve customs.

-- "bootstrap · new course" → "course design · new course"
UPDATE tabs
SET title = 'course design · new course'
WHERE title = 'bootstrap · new course';
--> statement-breakpoint

-- "<courseTitle> · bootstrap" → "<courseTitle> · course design"
UPDATE tabs
SET title = SUBSTR(title, 1, LENGTH(title) - LENGTH(' · bootstrap'))
         || ' · course design'
WHERE title LIKE '% · bootstrap';
--> statement-breakpoint

-- "study-skills · ..." or "... · study-skills" → use "study skills" (with space)
UPDATE tabs
SET title = REPLACE(title, 'study-skills', 'study skills')
WHERE title LIKE 'study-skills · %' OR title LIKE '% · study-skills';
