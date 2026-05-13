-- Add kind and document_id columns to tabs, and make session_id nullable,
-- to support document-bound tabs alongside session-bound tabs.
--
-- SQLite does not support ALTER COLUMN, so we recreate the table:
--   1. Create the new shape.
--   2. Copy existing rows (all session-tabs; kind = 'session').
--   3. Drop the old table.
--   4. Rename the new table.
--   5. Recreate indexes.
--
-- After migration:
--   kind TEXT NOT NULL DEFAULT 'session'  — discriminator
--   document_id TEXT                      — set for kind='document', NULL for kind='session'
--   session_id TEXT                       — nullable; set for kind='session', NULL for kind='document'

PRAGMA foreign_keys = OFF;
--> statement-breakpoint

CREATE TABLE `tabs_new` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`kind` text NOT NULL DEFAULT 'session',
	`session_id` text,
	`document_id` text,
	`title` text NOT NULL,
	`sort_order` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

INSERT INTO `tabs_new`
  (`id`, `student_id`, `kind`, `session_id`, `document_id`, `title`, `sort_order`, `opened_at`, `last_seen_at`, `closed_at`)
SELECT
  `id`, `student_id`, 'session', `session_id`, NULL, `title`, `sort_order`, `opened_at`, `last_seen_at`, `closed_at`
FROM `tabs`;
--> statement-breakpoint

DROP TABLE `tabs`;
--> statement-breakpoint

ALTER TABLE `tabs_new` RENAME TO `tabs`;
--> statement-breakpoint

CREATE INDEX `tabs_student_open_idx` ON `tabs` (`student_id`, `closed_at`, `sort_order`);
--> statement-breakpoint
CREATE INDEX `tabs_session_idx` ON `tabs` (`session_id`);
--> statement-breakpoint
CREATE INDEX `tabs_document_idx` ON `tabs` (`document_id`);
--> statement-breakpoint

PRAGMA foreign_keys = ON;
