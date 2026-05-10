import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { DraftCourseState } from "./types/index.js";

export const configKv = sqliteTable("config_kv", {
  key: text("key").primaryKey(),
  valueJson: text("value_json", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const lockState = sqliteTable("lock_state", {
  installId: text("install_id").primaryKey(),
  hashedCode: text("hashed_code"), // null when unlocked
  salt: text("salt").notNull(),
  setAt: integer("set_at", { mode: "timestamp_ms" }),
  /**
   * Phase 11: timestamp when the lock was most recently set/replaced.
   * NULL if never set. Informational — used to display "lock set on <date>" in the UI.
   * The actual lock check uses `hashedCode IS NOT NULL`.
   */
  lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
});

export const promptOverrides = sqliteTable(
  "prompt_overrides",
  {
    modeId: text("mode_id").notNull(),
    fragmentId: text("fragment_id").notNull(),
    override: text("override").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.modeId, t.fragmentId] }),
  }),
);

/**
 * Phase 11: append-only audit log of configurator actions (memory writes,
 * course/lesson/gate edits, prompt overrides). Makes configurator-driven
 * mutations visible and provenance-tracked.
 */
export const configuratorActions = sqliteTable(
  "configurator_actions",
  {
    id: text("id").primaryKey(),
    configuratorId: text("configurator_id").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    // ConfiguratorAction discriminated union — stored as JSON.
    actionJson: text("action_json", { mode: "json" }).notNull(),
  },
  (t) => ({
    tsIdx: index("configurator_actions_ts_idx").on(t.ts),
  }),
);

/**
 * Durable per-student draft course state for the bootstrap explorer.
 * One row per in-flight draft. Indexed columns support student-scoped
 * list and stale-draft sweep; `state_json` carries the
 * `DraftCourseState` shape so the schema is stable as ProposedCourse
 * evolves through the rest of this epic.
 *
 * Lifecycle:
 *   created       → row inserted; confirmedAt = null, discardedAt = null
 *   active edits  → lastTouchedAt bumped, state_json replaced atomically
 *   confirmed     → confirmedAt set; row retained for audit (gc later)
 *   discarded     → discardedAt set; row retained briefly then gc'd
 *
 * `confirmedAt` and `discardedAt` are mutually exclusive — at most one
 * is non-null. A row with both null is "active."
 */
export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    /** ms epoch — first creation time, immutable. */
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    /** ms epoch — last write or read access. Drives the stale sweep. */
    lastTouchedAt: integer("last_touched_at", { mode: "timestamp_ms" }).notNull(),
    /** Set by confirmDraft on successful persist. */
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    /** Set by discardDraft (manual or sweep). */
    discardedAt: integer("discarded_at", { mode: "timestamp_ms" }),
    /** Resulting course id when confirmed. */
    courseId: text("course_id"),
    /** JSON blob: { proposed: ProposedCourse, documentIds: DocumentId[], ... }. */
    stateJson: text("state_json", { mode: "json" }).$type<DraftCourseState>().notNull(),
  },
  (t) => ({
    studentTouchedIdx: index("drafts_student_touched_idx").on(t.studentId, t.lastTouchedAt),
    activeSweepIdx: index("drafts_active_sweep_idx").on(t.lastTouchedAt),
  }),
);

export const coreSchema = {
  configKv,
  lockState,
  promptOverrides,
  configuratorActions, // ← Phase 11
  drafts, // ← durable-drafts
};
