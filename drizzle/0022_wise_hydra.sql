ALTER TABLE `notes` ADD `session_id` text;--> statement-breakpoint
CREATE INDEX `notes_session_idx` ON `notes` (`session_id`);--> statement-breakpoint
UPDATE `notes` SET `session_id` = json_extract(`context_json`, '$.sessionId')
  WHERE json_extract(`context_json`, '$.sessionId') IS NOT NULL;