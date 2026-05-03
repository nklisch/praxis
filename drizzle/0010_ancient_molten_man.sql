CREATE TABLE `course_units` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`order_index` integer NOT NULL,
	`summative_assignment_id` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`summative_assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_units_course_idx` ON `course_units` (`course_id`);--> statement-breakpoint
CREATE TABLE `lesson_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`timing` text NOT NULL,
	`purpose` text NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lesson_assessments_lesson_idx` ON `lesson_assessments` (`lesson_id`);--> statement-breakpoint
CREATE INDEX `lesson_assessments_assignment_idx` ON `lesson_assessments` (`assignment_id`);--> statement-breakpoint
CREATE TABLE `lesson_units` (
	`lesson_id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `course_units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `assignments` ADD `parent_session_id` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `assessment_plan_json` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `parent_session_id` text;