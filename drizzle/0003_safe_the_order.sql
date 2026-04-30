CREATE TABLE `gate_unlock_events` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`course_id` text NOT NULL,
	`gate_id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	`evidence_json` text,
	`viewed_at` integer,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gate_unlock_events_student_course_idx` ON `gate_unlock_events` (`student_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `gate_unlock_events_gate_idx` ON `gate_unlock_events` (`gate_id`);