CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_touched_at` integer NOT NULL,
	`confirmed_at` integer,
	`discarded_at` integer,
	`course_id` text,
	`state_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `drafts_student_touched_idx` ON `drafts` (`student_id`,`last_touched_at`);--> statement-breakpoint
CREATE INDEX `drafts_active_sweep_idx` ON `drafts` (`last_touched_at`);