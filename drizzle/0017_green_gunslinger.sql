CREATE TABLE `configurator_snapshots` (
	`action_id` text PRIMARY KEY NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_key_json` text,
	`snapshot_json` text NOT NULL,
	`restored_at` integer
);
--> statement-breakpoint
CREATE INDEX `configurator_snapshots_entity_idx` ON `configurator_snapshots` (`entity_kind`);--> statement-breakpoint
CREATE INDEX `configurator_snapshots_restored_at_idx` ON `configurator_snapshots` (`restored_at`);