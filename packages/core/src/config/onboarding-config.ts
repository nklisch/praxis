import { eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import { configKv } from "../schema.js";

const CONFIG_KEY = "onboarding";

export interface OnboardingConfig {
  /** ISO timestamp; null means first-run is not yet complete. */
  firstRunCompletedAt: string | null;
}

const DEFAULT_ONBOARDING_CONFIG: OnboardingConfig = {
  firstRunCompletedAt: null,
};

/**
 * Read the onboarding config row, merging stored fields with defaults.
 * On a fresh database (no row), returns the default — `firstRunCompletedAt: null`.
 */
export function readOnboardingConfig(db: PraxisDb): OnboardingConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<OnboardingConfig> | undefined;
  return { ...DEFAULT_ONBOARDING_CONFIG, ...stored };
}

/**
 * Mark first-run as complete by writing the current timestamp.
 * Idempotent — repeated calls update to the latest timestamp via
 * `onConflictDoUpdate` against the unique `key` index.
 */
export function markFirstRunComplete(db: PraxisDb): void {
  const next: OnboardingConfig = {
    firstRunCompletedAt: new Date().toISOString(),
  };
  db.insert(configKv)
    .values({
      key: CONFIG_KEY,
      valueJson: next,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: next, updatedAt: new Date() },
    })
    .run();
}
