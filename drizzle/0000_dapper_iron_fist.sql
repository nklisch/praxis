CREATE TABLE `config_kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lock_state` (
	`install_id` text PRIMARY KEY NOT NULL,
	`hashed_code` text,
	`salt` text NOT NULL,
	`set_at` integer
);
--> statement-breakpoint
CREATE TABLE `prompt_overrides` (
	`mode_id` text NOT NULL,
	`fragment_id` text NOT NULL,
	`override` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`mode_id`, `fragment_id`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`items_json` text NOT NULL,
	`concept_ids_json` text NOT NULL,
	`assigned_at` integer NOT NULL,
	`submitted_at` integer,
	`grade_json` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assignments_course_idx` ON `assignments` (`course_id`);--> statement-breakpoint
CREATE TABLE `concept_map_drawings` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`course_id` text,
	`scene_json` text NOT NULL,
	`concept_links_json` text NOT NULL,
	`divergences_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `concept_maps_student_course_idx` ON `concept_map_drawings` (`student_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`subject` text NOT NULL,
	`grade_level` text NOT NULL,
	`source_json` text NOT NULL,
	`concept_graph_id` text NOT NULL,
	`thresholds_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `courses_student_idx` ON `courses` (`student_id`);--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`text` text NOT NULL,
	`locator_json` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_chunks_doc_idx` ON `document_chunks` (`document_id`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`ingested_at` integer NOT NULL,
	`manifest_json` text NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_student_idx` ON `documents` (`student_id`);--> statement-breakpoint
CREATE TABLE `flashcards` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`concept_id` text,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`review_state_json` text NOT NULL,
	`source_json` text NOT NULL,
	`next_review_at` integer
);
--> statement-breakpoint
CREATE INDEX `flashcards_student_due_idx` ON `flashcards` (`student_id`,`next_review_at`);--> statement-breakpoint
CREATE INDEX `flashcards_concept_idx` ON `flashcards` (`concept_id`);--> statement-breakpoint
CREATE TABLE `gates` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`guards_json` text NOT NULL,
	`prerequisites_json` text NOT NULL,
	`success_criteria_json` text NOT NULL,
	`state_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gates_course_idx` ON `gates` (`course_id`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`order_index` integer NOT NULL,
	`concept_ids_json` text NOT NULL,
	`references_json` text NOT NULL,
	`suggested_strategy` text NOT NULL,
	`estimated_minutes` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lessons_course_idx` ON `lessons` (`course_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`context_json` text NOT NULL,
	`format` text NOT NULL,
	`body` text,
	`sketch_scene_json` text,
	`links_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notes_student_idx` ON `notes` (`student_id`);--> statement-breakpoint
CREATE TABLE `affective_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`ts` integer NOT NULL,
	`source` text NOT NULL,
	`engagement_milli` integer NOT NULL,
	`frustration_milli` integer NOT NULL,
	`confidence_milli` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affect_student_time_idx` ON `affective_samples` (`student_id`,`ts`);--> statement-breakpoint
CREATE TABLE `episodic_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`ts` integer NOT NULL,
	`engine_id` text NOT NULL,
	`mode_id` text NOT NULL,
	`turn_index` integer NOT NULL,
	`event_json` text NOT NULL,
	`artifact_snapshot_ids_json` text,
	`redacted_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `episodic_session_time_idx` ON `episodic_events` (`session_id`,`ts`);--> statement-breakpoint
CREATE INDEX `episodic_student_time_idx` ON `episodic_events` (`student_id`,`ts`);--> statement-breakpoint
CREATE TABLE `misconceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`description` text NOT NULL,
	`error_form` text NOT NULL,
	`remediation_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`status` text NOT NULL,
	`first_observed_at` integer NOT NULL,
	`last_observed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `misconceptions_student_idx` ON `misconceptions` (`student_id`);--> statement-breakpoint
CREATE INDEX `misconceptions_concept_idx` ON `misconceptions` (`concept_id`);--> statement-breakpoint
CREATE TABLE `procedural_strategies` (
	`student_id` text NOT NULL,
	`strategy_id` text NOT NULL,
	`preference_milli` integer NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`student_id`, `strategy_id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`course_id` text,
	`mode_id` text NOT NULL,
	`engine_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE INDEX `sessions_student_time_idx` ON `sessions` (`student_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `student_mastery` (
	`student_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`p_known_milli` integer NOT NULL,
	`uncertainty_milli` integer NOT NULL,
	`effective_p_known_milli` integer NOT NULL,
	`last_practiced_at` integer,
	`evidence_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`student_id`, `concept_id`)
);
--> statement-breakpoint
CREATE INDEX `mastery_student_idx` ON `student_mastery` (`student_id`);--> statement-breakpoint
CREATE TABLE `concept_graphs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`standards_body` text,
	`standards_version` text,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`graph_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`aliases_json` text NOT NULL,
	`standards_tags_json` text NOT NULL,
	FOREIGN KEY (`graph_id`) REFERENCES `concept_graphs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `concepts_graph_name_idx` ON `concepts` (`graph_id`,`name`);--> statement-breakpoint
CREATE TABLE `prerequisite_edges` (
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`strength_milli` integer NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`from_id`, `to_id`),
	FOREIGN KEY (`from_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `edges_from_idx` ON `prerequisite_edges` (`from_id`);--> statement-breakpoint
CREATE INDEX `edges_to_idx` ON `prerequisite_edges` (`to_id`);