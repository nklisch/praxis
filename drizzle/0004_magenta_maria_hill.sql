CREATE TABLE `pack_imports` (
	`pack_id` text NOT NULL,
	`version` text NOT NULL,
	`concept_graph_id` text NOT NULL,
	`imported_at` integer NOT NULL,
	PRIMARY KEY(`pack_id`, `version`),
	FOREIGN KEY (`concept_graph_id`) REFERENCES `concept_graphs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pack_imports_graph_idx` ON `pack_imports` (`concept_graph_id`);