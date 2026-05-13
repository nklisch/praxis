-- Create the polymorphic document_scopes table
CREATE TABLE `document_scopes` (
	`document_id` text NOT NULL,
	`scope_kind` text NOT NULL,
	`scope_id` text NOT NULL,
	`attached_at` integer NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`document_id`, `scope_kind`, `scope_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_scopes_scope_idx` ON `document_scopes` (`scope_kind`,`scope_id`);
--> statement-breakpoint
CREATE INDEX `document_scopes_document_idx` ON `document_scopes` (`document_id`);
--> statement-breakpoint

-- Manual: copy existing rows from course_documents into document_scopes
INSERT INTO `document_scopes`
  (`document_id`, `scope_kind`, `scope_id`, `attached_at`, `source`)
SELECT `document_id`, 'course', `course_id`, `attached_at`, `source`
FROM `course_documents`;
--> statement-breakpoint

-- Manual: drop the old table (after data is safely copied above)
DROP TABLE `course_documents`;
