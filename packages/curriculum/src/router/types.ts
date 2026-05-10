import type {
  ConceptId,
  CourseStateSnapshot,
  LessonId,
  StrategyId,
  Timestamp,
} from "@praxis/core/types";

/** Inputs the router needs to make a suggestion. */
export interface RouterInput {
  snapshot: CourseStateSnapshot;
  /** Per-concept effective decay-aware mastery (0..1). Concepts not in the map default to 0. */
  masteryByConceptId: ReadonlyMap<string, number>;
  /** Per-concept BKT uncertainty (0..1). Concepts not in the map default to 0.5 (max uncertainty). */
  uncertaintyByConceptId: ReadonlyMap<string, number>;
  /** Per-concept last-practiced timestamp (ms). Concepts not in the map have never been practiced. */
  lastPracticedByConceptId: ReadonlyMap<string, Timestamp>;
  /** Wall clock now — caller supplies so the router stays a pure function. */
  now: Timestamp;
  /** Decay constant from the active course's threshold config (days). */
  decayDays: number;

  // ── Phase 18 additions ─────────────────────────────────────────────────────
  /**
   * Per-strategy preference + evidence count, from the procedural
   * indexer's projection. The router weights preferences by
   * `evidenceCount` — preferences with fewer than `proceduralMinEvidence`
   * (config; default 5) data points are treated as noisy and skipped.
   * Optional: when undefined, the router uses the lesson's
   * `suggestedStrategy` as-is.
   */
  proceduralStrategies?: ReadonlyMap<string, { preference: number; evidenceCount: number }>;
  /**
   * Rolling baseline averages for engagement / frustration / confidence.
   * Optional: when undefined, the router skips difficulty modulation
   * and mode-transition suggestions.
   */
  affectiveBaseline?: { engagement: number; frustration: number; confidence: number };
  /**
   * Most-recent affect samples (most-recent first). The router averages
   * the first K (config; default 3) when computing spike / ease detection.
   * Optional: when undefined or empty, the router skips difficulty
   * modulation and mode-transition suggestions.
   */
  recentAffect?: ReadonlyArray<{
    engagement: number;
    frustration: number;
    confidence: number;
  }>;
}

export type RouterReason =
  | "next-in-order" // current lesson, next un-studied concept
  | "frontier" // current lesson, highest uncertainty among partially-known concepts
  | "review" // earlier concept whose mastery has decayed below threshold
  | "interleave" // earlier concept at high mastery, due for practice to maintain retention
  | "all-complete"; // course-wide nothing remains

/** A specific concept the router recommends. */
export interface ConceptCandidate {
  conceptId: ConceptId;
  name: string;
  description: string;
  lessonId: LessonId;
  reason: RouterReason;
  /** Numeric score the router used to pick this; useful for debugging + Phase 14 evals. */
  score: number;
  masteryNow: number;
  uncertainty: number;
}

export interface RouterSuggestion {
  /**
   * The single concept the router recommends teaching/practicing now.
   * Null when the course is fully complete or has no current lesson.
   */
  primary: ConceptCandidate | null;
  /** Up to N decayed concepts to review before / during the primary. */
  reviews: ConceptCandidate[];
  /** Up to N earlier concepts to interleave during practice. */
  interleaves: ConceptCandidate[];

  // ── Phase 18 additions ─────────────────────────────────────────────────────
  /**
   * The teaching strategy the router recommends for the primary concept.
   * Defaults to the current lesson's `suggestedStrategy`; overridden by
   * procedural preferences when evidence is sufficient, or by frustration
   * fallback to a low-cognitive-load strategy.
   */
  suggestedStrategy: StrategyId;
  /**
   * Difficulty modulation hint:
   * - `"easier"`: frustration spike detected — back off difficulty.
   * - `"harder"`: sustained ease detected — push difficulty.
   * - `"normal"`: neither signal detected (or insufficient affective data).
   *
   * The tutor reads this and adjusts its `assignment.create` /
   * `quick_check.*` calls (item count, complexity) accordingly. The
   * tools themselves don't change shape.
   */
  difficultyHint: "easier" | "normal" | "harder";
  /**
   * Mode-transition suggestion:
   * - `"study-skills"`: sustained high frustration; the tutor should
   *   propose a study-skills coaching session via
   *   `course.suggest_alternative` (or weave the suggestion into chat).
   * - `null`: no transition recommended.
   *
   * v1 only suggests `study-skills`; the field is structured as a
   * mode-id-or-null union for future extensions.
   */
  suggestedModeTransition: "study-skills" | null;
}
