/**
 * Phase 10: Adaptive router configuration — single source of truth for all
 * tunable routing parameters. Phase 14 evals will tune these defaults.
 *
 * Per-student overrides are deferred to Phase 11 (editor-mode config).
 */
export interface RouterConfig {
  /**
   * How aggressively to weight BKT uncertainty when picking the primary concept.
   * Higher values favor high-uncertainty concepts; lower values favor low-mastery ones.
   * Range: 0..1. Default: 0.6.
   */
  frontierWeight: number;

  /**
   * Mastery floor below which a studied concept is eligible for review (after decay).
   * Concepts below this threshold appear in `reviews`.
   * Range: 0..1. Default: 0.5.
   */
  reviewThreshold: number;

  /**
   * Maximum number of review concepts in a single suggestion.
   * Default: 1.
   */
  maxReviews: number;

  /**
   * Maximum number of interleave concepts in a single suggestion.
   * Default: 1.
   */
  maxInterleaves: number;

  /**
   * Minimum mastery for a concept to be eligible for interleaving.
   * Concept is "strong but at risk of fading" above this threshold.
   * Range: 0..1. Default: 0.7.
   */
  interleaveMinMastery: number;

  /**
   * Minimum number of days since last practice for a concept to qualify
   * for interleaving. Below this it was practiced recently enough.
   * Default: 5.
   */
  interleaveMinDays: number;

  /**
   * Mastery ceiling above which a concept is considered fully mastered
   * (no longer eligible as primary for current-lesson picks).
   * Default: 0.85.
   */
  masteredThreshold: number;
}

/**
 * Default routing parameters. Exported `as const` so downstream code can
 * reference individual fields as literal types when needed.
 */
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  frontierWeight: 0.6,
  reviewThreshold: 0.5,
  maxReviews: 1,
  maxInterleaves: 1,
  interleaveMinMastery: 0.7,
  interleaveMinDays: 5,
  masteredThreshold: 0.85,
} as const satisfies RouterConfig;
