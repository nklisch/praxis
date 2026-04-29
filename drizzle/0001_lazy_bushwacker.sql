CREATE TABLE `concept_progress` (
	`student_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`studied_at` integer NOT NULL,
	`evidence_json` text NOT NULL,
	PRIMARY KEY(`student_id`, `concept_id`)
);
--> statement-breakpoint
CREATE INDEX `concept_progress_student_idx` ON `concept_progress` (`student_id`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`student_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	PRIMARY KEY(`student_id`, `lesson_id`),
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lesson_progress_student_idx` ON `lesson_progress` (`student_id`);