# Pattern: Config KV Store

App-wide configuration lives in the `config_kv` SQLite table (schema: `key TEXT PRIMARY KEY, value_json JSON, updated_at INTEGER`). Read merges stored value + defaults + environment overrides. Write upserts by key.

## Rationale

A single table handles all app-level config without requiring schema migrations for each new config key. JSON values are schema-validated at read time via Zod. Environment variables override stored values so CI/scripts can override config without touching the database.

## Examples

### Example 1: Engine config — read with env overrides, write via upsert
**File**: `packages/core/src/config/engine-config.ts`
```typescript
export function readEngineConfig(db: PraxisDb): EngineConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, "engine")).all();
  const stored = rows[0]?.valueJson as Partial<EngineConfig> | undefined;
  const merged = EngineConfigSchema.parse({ ...DEFAULT_ENGINE_CONFIG, ...stored });
  return applyEnvOverrides(merged);  // PRAXIS_ENGINE, PRAXIS_API_KEY, etc. win
}

export function writeEngineConfig(db: PraxisDb, config: EngineConfig): void {
  const validated = EngineConfigSchema.parse(config);
  db.insert(configKv)
    .values({ key: "engine", valueJson: validated, updatedAt: new Date() })
    .onConflictDoUpdate({ target: configKv.key, set: { valueJson: validated, updatedAt: new Date() } })
    .run();
}
```

### Example 2: Default student ID — create-or-read
**File**: `packages/core/src/services/student.ts:7`
```typescript
const KEY = "default_student_id";

export function getOrCreateDefaultStudentId(db: PraxisDb): StudentId {
  const row = db.select().from(configKv).where(eq(configKv.key, KEY)).get();
  if (row) return brandId<"StudentId">(row.valueJson as string);
  const id = uuidv7();
  db.insert(configKv).values({ key: KEY, valueJson: id, updatedAt: new Date() }).run();
  return brandId<"StudentId">(id);
}
```

### Example 3: Table schema — where the table is defined
**File**: `packages/core/src/schema.ts:2`
```typescript
export const configKv = sqliteTable("config_kv", {
  key: text("key").primaryKey(),
  valueJson: text("value_json", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
```

## When to Use

- Any singleton, install-scoped configuration (selected engine, default student ID, installed pack versions, lock code state)
- When the value has a stable default (written only when explicitly changed) and needs env-variable override for CI/scripts

## When NOT to Use

- User-facing structured data (courses, sessions, artifacts) — belongs in its own typed table
- Per-session or per-student ephemeral state — belongs in the session/student data layers

## Common Violations

- Adding new config without a Zod schema for validation — always parse the stored JSON through a schema so malformed stored data fails loudly at read time rather than silently at use
- Reading config_kv without applying env overrides — new config readers should follow the merge pattern: `{ ...defaults, ...storedValue, ...envOverrides }`
