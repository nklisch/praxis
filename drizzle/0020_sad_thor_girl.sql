CREATE TABLE `document_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`citing_session_id` text NOT NULL,
	`citing_turn_id` text,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`cited_text` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `citations_doc_idx` ON `document_citations` (`document_id`);--> statement-breakpoint
CREATE INDEX `citations_session_idx` ON `document_citations` (`citing_session_id`);--> statement-breakpoint
ALTER TABLE `document_scopes` ADD `passage_range_json` text;