CREATE TABLE `tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`session_id` text NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tabs_student_open_idx` ON `tabs` (`student_id`,`closed_at`,`sort_order`);--> statement-breakpoint
CREATE INDEX `tabs_session_idx` ON `tabs` (`session_id`);