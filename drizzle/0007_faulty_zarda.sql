CREATE TABLE `sketches` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`image_path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sketches_student_idx` ON `sketches` (`student_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `assignment_responses` ADD `sketch_id` text;