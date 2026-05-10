import { eq } from "drizzle-orm";
import { z } from "zod";
import type { PraxisDb } from "../db/index.js";
import { configKv } from "../schema.js";

export const BOOTSTRAP_CONFIG_KEY = "bootstrap";

/** Hard ceiling for the explore agent's tool-call budget. */
export const BOOTSTRAP_MAX_STEPS_LIMIT = 200;
/** Floor — anything lower is useless for a real course. */
export const BOOTSTRAP_MIN_STEPS = 5;
/** Default — generous; matches the scale of a Medium-density textbook. */
export const BOOTSTRAP_DEFAULT_MAX_STEPS = 200;

export const BootstrapConfigSchema = z.object({
  /**
   * Max tool-call steps the explore agent may take in a single
   * `course.start_exploration` run. Each `tool_call` event counts as one step.
   *
   * Bounded at construction by [BOOTSTRAP_MIN_STEPS, BOOTSTRAP_MAX_STEPS_LIMIT].
   * The user can tune this from the bootstrap tab body's outline-pane header.
   *
   * Why 200 by default: a "Medium" textbook bootstrap (15-20 lessons, ~100
   * concepts) requires roughly 190-220 tool calls if every concept, edge,
   * lesson, and lesson-assessment is added one at a time. Batch tools
   * (course.draft_add_concepts etc.) cut that by ~3-5x, but the headroom is
   * still cheap to keep — a hung agent gets aborted by the user, not by
   * silently exhausting the budget.
   */
  maxSteps: z
    .number()
    .int()
    .min(BOOTSTRAP_MIN_STEPS)
    .max(BOOTSTRAP_MAX_STEPS_LIMIT)
    .default(BOOTSTRAP_DEFAULT_MAX_STEPS),
});

export type BootstrapConfig = z.infer<typeof BootstrapConfigSchema>;
export const DEFAULT_BOOTSTRAP_CONFIG: BootstrapConfig = BootstrapConfigSchema.parse({});

/**
 * Read the bootstrap config: stored value (if any) merged with defaults.
 * No env overrides — this knob is user-tuned via the UI, not a deployment knob.
 */
export function readBootstrapConfig(db: PraxisDb): BootstrapConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, BOOTSTRAP_CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<BootstrapConfig> | undefined;
  return BootstrapConfigSchema.parse({ ...DEFAULT_BOOTSTRAP_CONFIG, ...stored });
}

export function writeBootstrapConfig(db: PraxisDb, config: BootstrapConfig): void {
  const validated = BootstrapConfigSchema.parse(config);
  db.insert(configKv)
    .values({ key: BOOTSTRAP_CONFIG_KEY, valueJson: validated, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: validated, updatedAt: new Date() },
    })
    .run();
}
