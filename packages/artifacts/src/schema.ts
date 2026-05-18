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
    /**
     * Phase 16: serialized AssessmentPlan. Null for courses bootstrapped
     * before Phase 16. Written by persistDraft when the explorer produces a
     * plan; immutable after that except through configure-mode tooling.
     */
    assessmentPlanJson: text("assessment_plan_json", { mode: "json" }),
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
    /**
     * Phase 16: the teach-mode session that authored this assignment via
     * assignment.create. Null for bootstrap-time scheduled assessments or
     * configurator-authored assessments without an active session.
     * On submit, this is the target for the system_note notification.
     */
    parentSessionId: text("parent_session_id"),
    /**
     * Optional exam time limit in minutes. Null for untimed assignments.
     * When set on an exam, the UI renders a countdown and auto-submits
     * at expiry (measured from assignedAt).
     */
    durationMinutes: integer("duration_minutes"),
  },
  (t) => ({
    courseIdx: index("assignments_course_idx").on(t.courseId),
  }),
);

// ─── Phase 16: Course units + assessment plan ─────────────────────────────────

export const courseUnits = sqliteTable(
  "course_units",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Optional editorial blurb describing this unit's theme. */
    summary: text("summary"),
    orderIndex: integer("order_index").notNull(),
    /**
     * Optional summative assessment (e.g. unit exam, midterm) that lives at
     * the end of this unit. Null when the unit has no summative.
     */
    summativeAssignmentId: text("summative_assignment_id").references(() => assignments.id),
  },
  (t) => ({
    courseIdx: index("course_units_course_idx").on(t.courseId),
  }),
);

/**
 * Join table: lesson ↔ unit (1:1). A lesson belongs to exactly one unit.
 * The primaryKey IS the lessonId — one row per lesson. Absence = unit-less
 * lesson (legacy course or pre-unit course). Using a join table instead of a
 * unitId FK on lessons keeps the lessons schema clean for courses predating units.
 */
export const lessonUnits = sqliteTable("lesson_units", {
  lessonId: text("lesson_id")
    .primaryKey()
    .references(() => lessons.id, { onDelete: "cascade" }),
  unitId: text("unit_id")
    .notNull()
    .references(() => courseUnits.id, { onDelete: "cascade" }),
});

/**
 * Scheduled assessment per lesson. Each row says: run this assignment at this
 * point relative to the lesson for this purpose.
 */
export const lessonAssessments = sqliteTable(
  "lesson_assessments",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    /**
     * When in the lesson flow this assessment runs:
     * - "before" = readiness check before the lesson
     * - "after"  = practice/checkpoint after the lesson
     * - "interleaved" = woven in during the lesson
     */
    timing: text("timing", {
      enum: ["before", "after", "interleaved"],
    }).notNull(),
    /**
     * Pedagogical purpose:
     * - "readiness"   = check prerequisites before teaching
     * - "practice"    = deliberate practice after instruction
     * - "checkpoint"  = verify mastery before advancing
     */
    purpose: text("purpose", {
      enum: ["readiness", "practice", "checkpoint"],
    }).notNull(),
  },
  (t) => ({
    lessonIdx: index("lesson_assessments_lesson_idx").on(t.lessonId),
    assignmentIdx: index("lesson_assessments_assignment_idx").on(t.assignmentId),
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

// ─── Document scoping (polymorphic) ───────────────────────────────────────

export const documentScopes = sqliteTable(
  "document_scopes",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /**
     * Scope kind discriminator. Extensible without schema migration —
     * adding a new kind only requires service-layer changes plus a UI
     * surface. Current kinds: 'course' (attached to a course),
     * 'session' (attached to a specific session, typically a
     * bootstrap exploration that hasn't been confirmed into a course).
     */
    scopeKind: text("scope_kind", { enum: ["course", "session"] }).notNull(),
    /**
     * Polymorphic reference. No DB-level FK — service-layer validation
     * checks existence on write. Deleted parents leave orphaned rows by
     * design; surfaced under the Orphaned library tab.
     */
    scopeId: text("scope_id").notNull(),
    attachedAt: integer("attached_at", { mode: "timestamp_ms" }).notNull(),
    source: text("source", {
      enum: ["bootstrap", "manual", "ingestion"],
    }).notNull(),
    /**
     * Optional passage range for session-scoped documents opened via
     * "ask Praxis about this passage". Null for course-scoped attachments
     * and full-document session attachments. JSON shape: { startOffset, endOffset }.
     */
    passageRangeJson: text("passage_range_json", { mode: "json" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.documentId, t.scopeKind, t.scopeId] }),
    scopeIdx: index("document_scopes_scope_idx").on(t.scopeKind, t.scopeId),
    documentIdx: index("document_scopes_document_idx").on(t.documentId),
  }),
);

// ─── Document citations ───────────────────────────────────────────────────────

/**
 * Per-turn citation records. When the tutor references a specific document
 * passage in a teach session, a row is inserted here so the document viewer
 * can render `†` markers on cited ranges.
 *
 * Access patterns:
 *  - read by documentId → render highlights in DocumentTabBody
 *  - read by citingSessionId → "what did this session cite?" (future)
 */
export const documentCitations = sqliteTable(
  "document_citations",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** The session in which this citation was produced. */
    citingSessionId: text("citing_session_id").notNull(),
    /** Optional turn id for fine-grained linkback to the exact tutor turn. */
    citingTurnId: text("citing_turn_id"),
    /** Character offset (inclusive) in the document's full text. */
    startOffset: integer("start_offset").notNull(),
    /** Character offset (exclusive) in the document's full text. */
    endOffset: integer("end_offset").notNull(),
    /** Optional captured snippet for display without re-fetching the document. */
    citedText: text("cited_text"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    docIdx: index("citations_doc_idx").on(t.documentId),
    sessionIdx: index("citations_session_idx").on(t.citingSessionId),
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
    /**
     * Confidence band — formative signal captured per item in quiz mode.
     * Null when the student did not select a confidence level (always optional).
     * Feed to the procedural-memory indexer as a self-assessment signal.
     */
    confidence: text("confidence", {
      enum: ["guessed", "unsure", "pretty_sure", "certain"],
    }),
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
  documentScopes,
  courseUnits, // ← Phase 16
  lessonUnits, // ← Phase 16
  lessonAssessments, // ← Phase 16
  documentCitations,
};
