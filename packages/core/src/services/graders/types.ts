/**
 * Grader port types — the ItemGrader port and its supporting shapes.
 *
 * The grader port is the boundary between the AssignmentService (orchestrator)
 * and the kind-specific graders (adapters). Adapters implement ItemGrader;
 * the registry maps kind → adapter.
 */

import type { AssignmentItem, AssignmentResponse, GraderTier } from "../../types/artifacts.js";
import type { CodeSandbox, Engine, Logger, SymPyService } from "../../types/index.js";

/**
 * Result of grading a single item. `score` is null when the grader cannot
 * produce a score (e.g. exam free-response item with no rubric, or a
 * parse error from the sympy service → needs-human-review).
 */
export interface GraderResult {
  /** 0..1 aggregate. */
  score: number | null;
  feedback: string;
  tier: GraderTier;
  /** Per-criterion breakdown when a rubric was involved. Score is integer 0-10. */
  perCriterion?: Array<{
    criterionId: string;
    /** 0-10 integer (the agent's native scale). */
    score: number;
    rationale: string;
    source: "rubric" | "work-rubric";
  }>;
  /** Set when an LLM call produced this result; lets indexers trace evidence. */
  evidenceEventIds?: string[];
}

/**
 * Runtime context passed to every grader. Mode affects which graders are
 * allowed (exam excludes approach-feedback; free-response requires rubric).
 */
export interface GraderContext {
  log: Logger;
  services: GraderServices;
  /** Mode the assignment is being taken in. */
  mode: "quiz" | "homework" | "exam";
}

/**
 * External services a grader may need. Populated by AssignmentServiceDeps at
 * construction time; same instances as the broader ServiceDeps.
 */
export interface GraderServices {
  /** For MathGrader — calls SymPy checkSolution. */
  sympy: SymPyService;
  /** For CodeGrader — runs test cases in isolation. */
  sandbox: CodeSandbox;
  /**
   * Resolves an active engine for one-shot rubric / approach-feedback runs.
   * Same closure pattern as Phase 6 bootstrapEngineResolver and Phase 7
   * MisconceptionIndexerDeps.engineResolver.
   */
  engineResolver: () => Engine;
}

/**
 * ItemGrader port — implemented by each kind-specific grader class.
 * Graders are lightweight stateless classes (no DB access, no side effects).
 * The registry maps AssignmentItem.kind → ItemGrader.
 */
export interface ItemGrader {
  /** The kind of AssignmentItem this grader handles. Must match registry key. */
  readonly kind: AssignmentItem["kind"];
  grade(input: {
    item: AssignmentItem;
    /** null when the student didn't answer this item. */
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult>;
}
