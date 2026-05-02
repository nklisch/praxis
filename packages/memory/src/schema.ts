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

export const memorySchema = {
  sessions,
  episodicEvents,
  studentMastery,
  proceduralStrategies,
  affectiveSamples,
  misconceptions,
  tabs,
};
