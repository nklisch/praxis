import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    gradeLevel: text("grade_level").notNull(),
    sourceJson: text("source_json", { mode: "json" }).notNull(), // CourseSource
    conceptGraphId: text("concept_graph_id").notNull(),
    thresholdsJson: text("thresholds_json", { mode: "json" }).notNull(), // ThresholdConfig
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentIdx: index("courses_student_idx").on(t.studentId),
  }),
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    orderIndex: integer("order_index").notNull(),
    conceptIdsJson: text("concept_ids_json", { mode: "json" }).notNull(),
    referencesJson: text("references_json", { mode: "json" }).notNull(),
    suggestedStrategy: text("suggested_strategy").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull(),
  },
  (t) => ({
    courseIdx: index("lessons_course_idx").on(t.courseId),
  }),
);

export const assignments = sqliteTable(
  "assignments",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["quiz", "homework", "exam"] }).notNull(),
    title: text("title").notNull(),
    itemsJson: text("items_json", { mode: "json" }).notNull(),
    conceptIdsJson: text("concept_ids_json", { mode: "json" }).notNull(),
    assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    gradeJson: text("grade_json", { mode: "json" }),
  },
  (t) => ({
    courseIdx: index("assignments_course_idx").on(t.courseId),
  }),
);

export const gates = sqliteTable(
  "gates",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    guardsJson: text("guards_json", { mode: "json" }).notNull(), // GateTarget
    prerequisitesJson: text("prerequisites_json", { mode: "json" }).notNull(), // GateId[]
    successCriteriaJson: text("success_criteria_json", { mode: "json" }).notNull(),
    stateJson: text("state_json", { mode: "json" }).notNull(), // GateState
    evidenceJson: text("evidence_json", { mode: "json" }).notNull(),
  },
  (t) => ({
    courseIdx: index("gates_course_idx").on(t.courseId),
  }),
);

export const flashcards = sqliteTable(
  "flashcards",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    conceptId: text("concept_id"),
    front: text("front").notNull(),
    back: text("back").notNull(),
    reviewStateJson: text("review_state_json", { mode: "json" }).notNull(),
    sourceJson: text("source_json", { mode: "json" }).notNull(),
    nextReviewAt: integer("next_review_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    studentDueIdx: index("flashcards_student_due_idx").on(t.studentId, t.nextReviewAt),
    conceptIdx: index("flashcards_concept_idx").on(t.conceptId),
  }),
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    contextJson: text("context_json", { mode: "json" }).notNull(),
    format: text("format", {
      enum: ["cornell", "feynman", "free", "outline", "sketch"],
    }).notNull(),
    body: text("body"),
    sketchSceneJson: text("sketch_scene_json", { mode: "json" }),
    linksJson: text("links_json", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentIdx: index("notes_student_idx").on(t.studentId),
  }),
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    ingestedAt: integer("ingested_at", { mode: "timestamp_ms" }).notNull(),
    manifestJson: text("manifest_json", { mode: "json" }).notNull(),
    chunkCount: integer("chunk_count").notNull().default(0),
  },
  (t) => ({
    studentIdx: index("documents_student_idx").on(t.studentId),
  }),
);

export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    locatorJson: text("locator_json", { mode: "json" }).notNull(),
  },
  (t) => ({
    documentIdx: index("document_chunks_doc_idx").on(t.documentId, t.chunkIndex),
  }),
);

// ─── Phase 16: Course ↔ Document attachment ──────────────────────────────────

export const courseDocuments = sqliteTable(
  "course_documents",
  {
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    attachedAt: integer("attached_at", { mode: "timestamp_ms" }).notNull(),
    /**
     * Where the attachment came from. "bootstrap" = seed list passed to the
     * explorer; "manual" = user attached via UI picker; "ingestion" = the
     * document was uploaded while a course was in scope.
     */
    source: text("source", { enum: ["bootstrap", "manual", "ingestion"] }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.courseId, t.documentId] }),
    courseIdx: index("course_documents_course_idx").on(t.courseId),
    documentIdx: index("course_documents_document_idx").on(t.documentId),
  }),
);

// ─── Phase 6: Per-student progress tables ────────────────────────────────────

export const lessonProgress = sqliteTable(
  "lesson_progress",
  {
    studentId: text("student_id").notNull(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["not_started", "in_progress", "completed"] }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.lessonId] }),
    studentIdx: index("lesson_progress_student_idx").on(t.studentId),
  }),
);

export const conceptProgress = sqliteTable(
  "concept_progress",
  {
    studentId: text("student_id").notNull(),
    // FK to concepts.id (in @praxis/curriculum); cross-package FK omitted to keep schema modular.
    // Both schemas compose into the same SQLite file; cleanup is handled programmatically.
    conceptId: text("concept_id").notNull(),
    studiedAt: integer("studied_at", { mode: "timestamp_ms" }).notNull(),
    evidenceJson: text("evidence_json", { mode: "json" }).notNull(), // string[] of event IDs
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.conceptId] }),
    studentIdx: index("concept_progress_student_idx").on(t.studentId),
  }),
);

// ─── Phase 8: Assignment responses (resumable per-item state) ─────────────────

export const assignmentResponses = sqliteTable(
  "assignment_responses",
  {
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    response: text("response").notNull(),
    /** Phase 8: optional shown work; null when item has no workRubric. */
    work: text("work"),
    /**
     * Phase 15a: optional sketch reference. Nullable; references sketches.id
     * but no FK constraint (deduplication-friendly — sketches are content-addressed).
     */
    sketchId: text("sketch_id"),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.assignmentId, t.itemId] }),
    assignmentIdx: index("assignment_responses_assignment_idx").on(t.assignmentId),
  }),
);

// ─── Phase 9: Gate unlock event log ──────────────────────────────────────────

export const gateUnlockEvents = sqliteTable(
  "gate_unlock_events",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    gateId: text("gate_id")
      .notNull()
      .references(() => gates.id, { onDelete: "cascade" }),
    unlockedAt: integer("unlocked_at", { mode: "timestamp_ms" }).notNull(),
    /** Optional evidence pointers (event ids, assignment ids). */
    evidenceJson: text("evidence_json", { mode: "json" }),
    /** Timestamp the student viewed this in /courses; null if never viewed. */
    viewedAt: integer("viewed_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    studentCourseIdx: index("gate_unlock_events_student_course_idx").on(t.studentId, t.courseId),
    gateIdx: index("gate_unlock_events_gate_idx").on(t.gateId),
  }),
);

/**
 * Aggregate export so the DB module can spread all artifact tables into the
 * Drizzle schema map.
 */
export const artifactsSchema = {
  courses,
  lessons,
  assignments,
  gates,
  flashcards,
  notes,
  documents,
  documentChunks,
  lessonProgress, // ← Phase 6
  conceptProgress, // ← Phase 6
  assignmentResponses, // ← Phase 8
  gateUnlockEvents, // ← Phase 9
  courseDocuments, // ← Phase 16
};
