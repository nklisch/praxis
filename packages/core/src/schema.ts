import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const coreSchema = {
  configKv,
  lockState,
  promptOverrides,
  configuratorActions, // ← Phase 11
};
