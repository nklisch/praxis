import { eq } from "drizzle-orm";
import { z } from "zod";
import type { PraxisDb } from "../db/index.js";
import { configKv } from "../schema.js";

export const COURSE_CREATE_CONFIG_KEY = "course-create";

/** Hard ceiling for the drafter agent's tool-call budget. */
export const COURSE_CREATE_MAX_STEPS_LIMIT = 200;
/** Floor — anything lower is useless for a real course. */
export const COURSE_CREATE_MIN_STEPS = 5;
/** Default — generous; matches the scale of a Medium-density textbook. */
export const COURSE_CREATE_DEFAULT_MAX_STEPS = 200;

export const CourseCreateConfigSchema = z.object({
  /**
   * Max tool-call steps the drafter agent may take in a single
   * `course.start_drafting` run. Each `tool_call` event counts as one step.
   *
   * Bounded at construction by [COURSE_CREATE_MIN_STEPS, COURSE_CREATE_MAX_STEPS_LIMIT].
   * The user can tune this from the course-create tab body's outline-pane header.
   *
   * Why 200 by default: a "Medium" textbook course-create run (15-20 lessons, ~100
   * concepts) requires roughly 190-220 tool calls if every concept, edge,
   * lesson, and lesson-assessment is added one at a time. Batch tools
   * (course.draft_add_concepts etc.) cut that by ~3-5x, but the headroom is
   * still cheap to keep — a hung agent gets aborted by the user, not by
   * silently exhausting the budget.
   */
  maxSteps: z
    .number()
    .int()
    .min(COURSE_CREATE_MIN_STEPS)
    .max(COURSE_CREATE_MAX_STEPS_LIMIT)
    .default(COURSE_CREATE_DEFAULT_MAX_STEPS),
});

export type CourseCreateConfig = z.infer<typeof CourseCreateConfigSchema>;
export const DEFAULT_COURSE_CREATE_CONFIG: CourseCreateConfig = CourseCreateConfigSchema.parse({});

/**
 * Read the course-create config: stored value (if any) merged with defaults.
 * No env overrides — this knob is user-tuned via the UI, not a deployment knob.
 */
export function readCourseCreateConfig(db: PraxisDb): CourseCreateConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, COURSE_CREATE_CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<CourseCreateConfig> | undefined;
  return CourseCreateConfigSchema.parse({ ...DEFAULT_COURSE_CREATE_CONFIG, ...stored });
}

export function writeCourseCreateConfig(db: PraxisDb, config: CourseCreateConfig): void {
  const validated = CourseCreateConfigSchema.parse(config);
  db.insert(configKv)
    .values({ key: COURSE_CREATE_CONFIG_KEY, valueJson: validated, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: validated, updatedAt: new Date() },
    })
    .run();
}
