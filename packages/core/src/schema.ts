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
 * Durable per-student draft course state for the drafter.
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

/**
 * Per-mode prompt append rows. Stores user-authored text appended to a specific
 * mode's prompt at the "user-append" position.
 *
 * Key is `modeId` alone — single-student v1. When multi-student lands, this
 * table grows a `studentId` column.
 */
export const modePromptAppends = sqliteTable("mode_prompt_appends", {
  modeId: text("mode_id").primaryKey(),
  text: text("text").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Snapshot of the pre-mutation entity state captured before each
 * AuthoringServiceImpl write. Keyed 1:1 with configurator_actions rows.
 * Enables the ↶ revert affordance in the drafter/configurator chat.
 */
export const configuratorSnapshots = sqliteTable(
  "configurator_snapshots",
  {
    /**
     * Foreign key to configurator_actions.id. Each snapshotted mutation has
     * exactly one row here; un-snapshotted kinds (memory.export, memory.delete_all)
     * have no row.
     */
    actionId: text("action_id").primaryKey(),
    /**
     * Entity kind affected by the original action. Drives the
     * reverse-apply dispatcher in restoreAction.
     */
    entityKind: text("entity_kind").notNull(), // SnapshotEntityKind union
    /**
     * Primary entity id when applicable (courseId / lessonId / gateId /
     * modeId+fragmentId composite). Stored as JSON for composite keys.
     * Null only for "create" sentinel snapshots where reverse-apply is
     * "delete the entity created by the original action."
     */
    entityKeyJson: text("entity_key_json", { mode: "json" }),
    /**
     * Pre-mutation entity shape — full row(s) as JSON. For create-kind
     * snapshots, this is the sentinel `{ schemaVersion: 1, kind: "create" }` so
     * reverse-apply knows to delete-by-id. For batch mutations (set_style)
     * this is an array of prior rows.
     */
    snapshotJson: text("snapshot_json", { mode: "json" }).notNull(),
    /**
     * Set when this snapshot is consumed by a restoreAction call. Null
     * means "available to restore." A second restore of the same actionId
     * returns already_restored.
     */
    restoredAt: integer("restored_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    entityIdx: index("configurator_snapshots_entity_idx").on(t.entityKind),
    restoredAtIdx: index("configurator_snapshots_restored_at_idx").on(t.restoredAt),
  }),
);

export const coreSchema = {
  configKv,
  lockState,
  promptOverrides,
  configuratorActions, // ← Phase 11
  drafts, // ← durable-drafts
  modePromptAppends, // ← prompt-customization-layers
  configuratorSnapshots, // ← snapshot-restore
};
