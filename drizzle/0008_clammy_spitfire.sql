CREATE TABLE `concept_map_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_map_id` text NOT NULL,
	`scene_json` text NOT NULL,
	`concept_links_json` text NOT NULL,
	`session_id` text,
	`snapshot_at` integer NOT NULL,
	FOREIGN KEY (`concept_map_id`) REFERENCES `concept_maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `concept_map_versions_map_time_idx` ON `concept_map_versions` (`concept_map_id`,`snapshot_at`);--> statement-breakpoint
CREATE TABLE `concept_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`scene_json` text NOT NULL,
	`concept_links_json` text DEFAULT '[]' NOT NULL,
	`divergences_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `concept_maps_student_course_idx` ON `concept_maps` (`student_id`,`course_id`);