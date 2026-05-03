import { eq } from "drizzle-orm";
import { z } from "zod";
import type { PraxisDb } from "../db/index.js";
import { configKv } from "../schema.js";
import { LOG_LEVELS, type LogLevel } from "../types/common.js";

export const LOGGING_CONFIG_KEY = "logging";

export const LoggingConfigSchema = z.object({
  /** Minimum level recorded. Records below this level are dropped. */
  level: z.enum(LOG_LEVELS).default("info"),
  /**
   * When true, write JSONL records to `userData/logs/praxis.log` (rotated).
   * Default: false in packaged builds (honors SPEC.md "no telemetry by default"),
   * true in dev (set by buildServices when `app.isPackaged === false`).
   */
  fileEnabled: z.boolean().default(false),
  /**
   * When true, the `prompt`, `messages`, and `modelOutput` fields may appear
   * in logs at debug level. When false (default), those field values are
   * replaced with the literal string "[REDACTED]" before any record is emitted.
   */
  prompts: z.boolean().default(false),
  /** Max single rotated file size in MB. */
  maxFileSizeMb: z.number().int().positive().default(10),
  /** Max number of rotated files retained. Older files are deleted. */
  maxFiles: z.number().int().positive().default(5),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = LoggingConfigSchema.parse({});

/**
 * Read the resolved logging config: stored value (if any) merged with defaults,
 * then environment overrides applied.
 *
 * Environment overrides:
 * - PRAXIS_LOG_LEVEL=debug|info|warn|error
 * - PRAXIS_LOG_FILE=1|0   → forces fileEnabled true|false
 * - PRAXIS_LOG_PROMPTS=1  → enables prompt logging at debug
 *
 * The optional `isPackaged` argument flips the `fileEnabled` default for dev:
 * when isPackaged === false and no stored value or env override is set,
 * fileEnabled defaults to true.
 */
export function readLoggingConfig(db: PraxisDb, opts?: { isPackaged?: boolean }): LoggingConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, LOGGING_CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<LoggingConfig> | undefined;
  const devDefault = opts?.isPackaged === false ? { fileEnabled: true } : {};
  const merged = LoggingConfigSchema.parse({
    ...DEFAULT_LOGGING_CONFIG,
    ...devDefault,
    ...stored,
  });
  return applyEnvOverrides(merged);
}

export function writeLoggingConfig(db: PraxisDb, config: LoggingConfig): void {
  const validated = LoggingConfigSchema.parse(config);
  db.insert(configKv)
    .values({ key: LOGGING_CONFIG_KEY, valueJson: validated, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: validated, updatedAt: new Date() },
    })
    .run();
}

function applyEnvOverrides(base: LoggingConfig): LoggingConfig {
  const env = process.env;
  const cand: LoggingConfig = { ...base };
  if (env.PRAXIS_LOG_LEVEL) {
    cand.level = LoggingConfigSchema.shape.level.parse(env.PRAXIS_LOG_LEVEL) as LogLevel;
  }
  if (env.PRAXIS_LOG_FILE === "1") cand.fileEnabled = true;
  if (env.PRAXIS_LOG_FILE === "0") cand.fileEnabled = false;
  if (env.PRAXIS_LOG_PROMPTS === "1") cand.prompts = true;
  return cand;
}
