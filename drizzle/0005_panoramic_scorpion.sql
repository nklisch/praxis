CREATE TABLE `configurator_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`configurator_id` text NOT NULL,
	`ts` integer NOT NULL,
	`action_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `configurator_actions_ts_idx` ON `configurator_actions` (`ts`);--> statement-breakpoint
ALTER TABLE `lock_state` ADD `locked_at` integer;