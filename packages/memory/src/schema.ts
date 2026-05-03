import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    courseId: text("course_id"),
    /** Phase 8: bound assignment for quiz/homework/exam sessions. Nullable. */
    assignmentId: text("assignment_id"),
    modeId: text("mode_id").notNull(),
    engineId: text("engine_id").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    /**
     * Phase 16: parent session that spawned this child session.
     * Set when spawnFromAssignment opens a quiz/homework/exam session from a
     * teach-mode tutor session. Nullable for top-level sessions. On parent
     * session delete, set to null (cascade not supported in SQLite for
     * set-null; application logic handles orphan cleanup).
     */
    parentSessionId: text("parent_session_id"),
  },
  (t) => ({
    studentTimeIdx: index("sessions_student_time_idx").on(t.studentId, t.startedAt),
  }),
);

export const episodicEvents = sqliteTable(
  "episodic_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    engineId: text("engine_id").notNull(),
    modeId: text("mode_id").notNull(),
    turnIndex: integer("turn_index").notNull(),
    eventJson: text("event_json", { mode: "json" }).notNull(), // EngineEvent
    artifactSnapshotIdsJson: text("artifact_snapshot_ids_json", { mode: "json" }),
    redactedAt: integer("redacted_at", { mode: "timestamp_ms" }), // soft-delete projection-only
  },
  (t) => ({
    sessionTimeIdx: index("episodic_session_time_idx").on(t.sessionId, t.ts),
    studentTimeIdx: index("episodic_student_time_idx").on(t.studentId, t.ts),
  }),
);

export const studentMastery = sqliteTable(
  "student_mastery",
  {
    studentId: text("student_id").notNull(),
    conceptId: text("concept_id").notNull(),
    pKnown: integer("p_known_milli").notNull(), // 0..1000 (millified)
    uncertainty: integer("uncertainty_milli").notNull(),
    effectivePKnown: integer("effective_p_known_milli").notNull(),
    lastPracticedAt: integer("last_practiced_at", { mode: "timestamp_ms" }),
    evidenceJson: text("evidence_json", { mode: "json" }).notNull(), // EventId[]
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.conceptId] }),
    studentIdx: index("mastery_student_idx").on(t.studentId),
  }),
);

export const proceduralStrategies = sqliteTable(
  "procedural_strategies",
  {
    studentId: text("student_id").notNull(),
    strategyId: text("strategy_id").notNull(),
    preferenceMilli: integer("preference_milli").notNull(), // -1000..1000
    evidenceCount: integer("evidence_count").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.strategyId] }),
  }),
);

export const affectiveSamples = sqliteTable(
  "affective_samples",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    source: text("source", { enum: ["model-inferred", "explicit-checkin"] }).notNull(),
    engagementMilli: integer("engagement_milli").notNull(),
    frustrationMilli: integer("frustration_milli").notNull(),
    confidenceMilli: integer("confidence_milli").notNull(),
  },
  (t) => ({
    studentTimeIdx: index("affect_student_time_idx").on(t.studentId, t.ts),
  }),
);

export const misconceptions = sqliteTable(
  "misconceptions",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    conceptId: text("concept_id").notNull(),
    description: text("description").notNull(),
    errorForm: text("error_form").notNull(),
    remediationJson: text("remediation_json", { mode: "json" }).notNull(),
    evidenceJson: text("evidence_json", { mode: "json" }).notNull(),
    status: text("status", { enum: ["active", "remediated", "manually-cleared"] }).notNull(),
    firstObservedAt: integer("first_observed_at", { mode: "timestamp_ms" }).notNull(),
    lastObservedAt: integer("last_observed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentIdx: index("misconceptions_student_idx").on(t.studentId),
    conceptIdx: index("misconceptions_concept_idx").on(t.conceptId),
  }),
);

/** Phase 14: Tab strip persistence. One row per open/closed tab. */
export const tabs = sqliteTable(
  "tabs",
  {
    id: text("id").primaryKey(), // uuidv7
    studentId: text("student_id").notNull(),
    /** The session this tab is bound to. Cascade-delete if the session is deleted. */
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Auto-generated display title, e.g. "algebra · teach" or "teach · new chat". */
    title: text("title").notNull(),
    /** Visual ordering — higher = further right in the strip. */
    sortOrder: integer("sort_order").notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
    /** Updated each time the tab is focused. Used to restore the last-focused tab on reload. */
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    /** Set when the user closes the tab. Closed tabs vanish from the strip but stay in the archive. */
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    studentOpenIdx: index("tabs_student_open_idx").on(t.studentId, t.closedAt, t.sortOrder),
    sessionIdx: index("tabs_session_idx").on(t.sessionId),
  }),
);

/** Phase 15b: Student-authored concept maps with auto-versioning. */
export const conceptMaps = sqliteTable(
  "concept_maps",
  {
    id: text("id").primaryKey(), // uuidv7
    studentId: text("student_id").notNull(),
    /** Course the map is anchored to. NOT optional in v1. */
    courseId: text("course_id").notNull(),
    /** Display title. e.g. "whole course", "linear equations", "word problems". */
    title: text("title").notNull(),
    /** Live tldraw snapshot — the editable working copy. */
    sceneJson: text("scene_json", { mode: "json" }).notNull(),
    /**
     * Element-to-concept bindings. Array of { elementId, conceptId, confidence }.
     * Stored as JSON for v1 (single-row, small N). A separate table is overkill.
     */
    conceptLinksJson: text("concept_links_json", { mode: "json" }).notNull().default("[]"),
    /**
     * ConceptMapDivergence[] from the most-recent indexer run. Null until first
     * session-end indexer pass after the map is created.
     */
    divergencesJson: text("divergences_json", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentCourseIdx: index("concept_maps_student_course_idx").on(t.studentId, t.courseId),
  }),
);

/** Phase 15b: Version history for concept maps — immutable snapshots. */
export const conceptMapVersions = sqliteTable(
  "concept_map_versions",
  {
    id: text("id").primaryKey(), // uuidv7
    conceptMapId: text("concept_map_id")
      .notNull()
      .references(() => conceptMaps.id, { onDelete: "cascade" }),
    /** Snapshot of the scene + links at this version. */
    sceneJson: text("scene_json", { mode: "json" }).notNull(),
    conceptLinksJson: text("concept_links_json", { mode: "json" }).notNull(),
    /** Set when auto-snapshot fires; null when this is the very first row. */
    sessionId: text("session_id"),
    snapshotAt: integer("snapshot_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    mapTimeIdx: index("concept_map_versions_map_time_idx").on(t.conceptMapId, t.snapshotAt),
  }),
);

/** Phase 15a: Content-addressed sketch storage. */
export const sketches = sqliteTable(
  "sketches",
  {
    /**
     * SHA-256 hex of the snapshot JSON. Content-addressed — identical drawings
     * dedupe naturally. Use this id everywhere a sketch is referenced.
     */
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    /** Tldraw snapshot JSON (full document), serialized. */
    snapshotJson: text("snapshot_json", { mode: "json" }).notNull(),
    /**
     * Relative path under FsSketchStore root for the rendered PNG.
     * Format: `<id-prefix-2>/<id>.png` (sharded 2-char prefix to avoid one-dir-many-files).
     */
    imagePath: text("image_path").notNull(),
    /** Width/height in pixels of the rendered PNG. */
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentIdx: index("sketches_student_idx").on(t.studentId, t.createdAt),
  }),
);

export const memorySchema = {
  sessions,
  episodicEvents,
  studentMastery,
  proceduralStrategies,
  affectiveSamples,
  misconceptions,
  tabs,
  conceptMaps,
  conceptMapVersions,
  sketches,
};
