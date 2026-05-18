-- Rename mode id 'bootstrap' → 'course-create' across all live rows.
-- Historical (already-ended) sessions and episodic events retain 'bootstrap'
-- as an audit record of the mode the session ran under at the time.
--
-- NOTE: tabs do not store mode_id directly — they join sessions for it.
-- Only sessions, prompt_overrides, mode_prompt_appends, and document_scopes
-- need direct updates.

-- Backfill live (non-ended) sessions
UPDATE sessions
  SET mode_id = 'course-create'
  WHERE mode_id = 'bootstrap' AND ended_at IS NULL;--> statement-breakpoint

-- Per-mode prompt overrides and appends
UPDATE prompt_overrides
  SET mode_id = 'course-create'
  WHERE mode_id = 'bootstrap';--> statement-breakpoint
UPDATE mode_prompt_appends
  SET mode_id = 'course-create'
  WHERE mode_id = 'bootstrap';--> statement-breakpoint

-- document_scopes.source is the polymorphic attribution; backfill all rows
UPDATE document_scopes
  SET source = 'course-create'
  WHERE source = 'bootstrap';
