CREATE TABLE `assignment_responses` (
	`assignment_id` text NOT NULL,
	`item_id` text NOT NULL,
	`response` text NOT NULL,
	`work` text,
	`recorded_at` integer NOT NULL,
	PRIMARY KEY(`assignment_id`, `item_id`),
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assignment_responses_assignment_idx` ON `assignment_responses` (`assignment_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `assignment_id` text;