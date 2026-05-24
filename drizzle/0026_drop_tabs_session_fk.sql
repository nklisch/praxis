-- Drop the foreign key from tabs.session_id → sessions.id.
--
-- Motivation: the empty-session-cleanup lazy-persist design defers session row
-- creation until the first user_message, so tabs.session_id must be insertable
-- before the referenced sessions row exists. Orphan-tab cleanup (tabs rows whose
-- session_id never materialises) is owned by the sweep job in story
-- feature-empty-session-cleanup-lazy-and-sweep.
--
-- SQLite does not support ALTER TABLE DROP CONSTRAINT; we recreate the table.
-- Column list is taken verbatim from the schema definition in
-- packages/memory/src/schema.ts as of this migration.

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
	`closed_at` integer
	-- session_id FK intentionally omitted; orphan cleanup via sweep job
);
--> statement-breakpoint

INSERT INTO `tabs_new`
  (`id`, `student_id`, `kind`, `session_id`, `document_id`, `title`, `sort_order`, `opened_at`, `last_seen_at`, `closed_at`)
SELECT
  `id`, `student_id`, `kind`, `session_id`, `document_id`, `title`, `sort_order`, `opened_at`, `last_seen_at`, `closed_at`
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
