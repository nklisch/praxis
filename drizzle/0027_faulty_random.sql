CREATE TABLE `term_first_occurrences` (
	`student_id` text NOT NULL,
	`term_normalized` text NOT NULL,
	`first_seen_session_id` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	PRIMARY KEY(`student_id`, `term_normalized`)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`kind` text DEFAULT 'session' NOT NULL,
	`session_id` text,
	`document_id` text,
	`title` text NOT NULL,
	`sort_order` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_tabs`("id", "student_id", "kind", "session_id", "document_id", "title", "sort_order", "opened_at", "last_seen_at", "closed_at") SELECT "id", "student_id", "kind", "session_id", "document_id", "title", "sort_order", "opened_at", "last_seen_at", "closed_at" FROM `tabs`;--> statement-breakpoint
DROP TABLE `tabs`;--> statement-breakpoint
ALTER TABLE `__new_tabs` RENAME TO `tabs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `tabs_student_open_idx` ON `tabs` (`student_id`,`closed_at`,`sort_order`);--> statement-breakpoint
CREATE INDEX `tabs_session_idx` ON `tabs` (`session_id`);--> statement-breakpoint
CREATE INDEX `tabs_document_idx` ON `tabs` (`document_id`);