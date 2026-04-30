/**
 * Phase 12: FSRS-5 default parameters.
 *
 * Single source of truth for scheduler configuration.
 * Phase 14 may swap or per-student override these.
 */

export const FSRS_DEFAULTS = {
  /** Request retention: target retention rate (0..1). 0.9 = 90% recall. */
  request_retention: 0.9,
  /** Maximum interval in days. Caps reviews from spreading too far. */
  maximum_interval: 36500,
  /**
   * Fuzzing randomizes intervals slightly to prevent "review thundering herd".
   * Disable in tests for deterministic output.
   */
  enable_fuzz: false,
} as const satisfies {
  request_retention: number;
  maximum_interval: number;
  enable_fuzz: boolean;
};
