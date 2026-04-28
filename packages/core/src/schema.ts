import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const coreSchema = {
  configKv,
  lockState,
  promptOverrides,
};
