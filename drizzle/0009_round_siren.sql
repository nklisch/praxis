CREATE TABLE `course_documents` (
	`course_id` text NOT NULL,
	`document_id` text NOT NULL,
	`attached_at` integer NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`course_id`, `document_id`),
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_documents_course_idx` ON `course_documents` (`course_id`);--> statement-breakpoint
CREATE INDEX `course_documents_document_idx` ON `course_documents` (`document_id`);