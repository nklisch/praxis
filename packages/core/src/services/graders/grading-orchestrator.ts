/**
 * GradingOrchestrator — sub-service that owns the per-item grading loop.
 *
 * Extracted from AssignmentServiceImpl.submit() (lines 546–654) so the grading
 * logic can be unit-tested and reused independently of the DB write / notification
 * side-effects in submit(). Step 4 of the grading-extraction refactor wires
 * AssignmentServiceImpl to delegate to this orchestrator.
 *
 * Phase 3 dependency exception: this file is in services/ and may import
 * @praxis/engines transitively (via rubric-agent.ts → runOneShot).
 */

import type {
  Assignment,
  AssignmentResponse,
  Grade,
  GradeItem,
  Logger,
} from "../../types/index.js";
import { enrichWithApproachFeedback } from "./approach-feedback.js";
import { blendDeterministicAndWorkRubric } from "./blending.js";
import { buildGraderRegistry } from "./registry.js";
import { runRubricAgent } from "./rubric-agent.js";
import type { GraderContext, GraderServices } from "./types.js";

// ─── Public interface ──────────────────────────────────────────────────────────

export interface GradingOrchestratorDeps {
  log: Logger;
  graderServices: GraderServices;
  /**
   * Whether to run the approach-feedback enrichment pass for incorrect items
   * that have no rubric / workRubric. Defaults to `true` when omitted.
   */
  enableApproachFeedback?: boolean;
}

export interface GradingOrchestrator {
  gradeAssignment(input: {
    assignment: Assignment;
    responses: AssignmentResponse[];
    mode: "quiz" | "homework" | "exam";
  }): Promise<Grade>;
}

// ─── Implementation ────────────────────────────────────────────────────────────

export class GradingOrchestratorImpl implements GradingOrchestrator {
  private readonly registry: ReturnType<typeof buildGraderRegistry>;

  constructor(private readonly deps: GradingOrchestratorDeps) {
    // buildGraderRegistry() is synchronous; construct once at startup.
    this.registry = buildGraderRegistry();
  }

  async gradeAssignment(input: {
    assignment: Assignment;
    responses: AssignmentResponse[];
    mode: "quiz" | "homework" | "exam";
  }): Promise<Grade> {
    const { assignment, responses, mode } = input;

    // Build a lookup map from the responses array (mirrors the closure in submit()).
    const responseByItemId = new Map(responses.map((r) => [r.itemId, r]));

    const ctx: GraderContext = {
      log: this.deps.log,
      services: this.deps.graderServices,
      mode,
    };

    const perItem: GradeItem[] = [];
    let totalScore = 0;
    let scoredItemCount = 0;
    let highestTier: GradeItem["gradedBy"] = "deterministic";

    for (const item of assignment.items) {
      const grader = this.registry[item.kind];
      const response = responseByItemId.get(item.id) ?? null;

      // 1. Run the kind-specific grader.
      let finalResult = await grader.grade({ item, response, ctx });

      // 2a. workRubric blending — only for math/code items with workRubric set
      //     AND when the student submitted non-empty work text.
      if (
        "workRubric" in item &&
        item.workRubric &&
        (item.kind === "math" || item.kind === "code") &&
        response &&
        response.work !== undefined &&
        response.work.trim() !== ""
      ) {
        const workResult = await runRubricAgent({
          item,
          rubric: item.workRubric,
          text: response.work,
          source: "work-rubric",
          ctx,
        });
        const primaryWeight = item.primaryWeight ?? (mode === "exam" ? 1.0 : 0.5);
        finalResult = blendDeterministicAndWorkRubric(finalResult, workResult, primaryWeight);
      }

      // 2b. requireReasoning blending — for single-choice / multi-select / two-tier
      //     when requireReasoning is set and the student submitted non-empty work.
      if (
        "requireReasoning" in item &&
        item.requireReasoning &&
        item.reasoningRubric &&
        response &&
        response.work !== undefined &&
        response.work.trim() !== ""
      ) {
        const reasoningResult = await runRubricAgent({
          item,
          rubric: item.reasoningRubric,
          text: response.work,
          source: "reasoning-rubric",
          ctx,
        });
        const primaryWeight = item.primaryWeight ?? (mode === "exam" ? 1.0 : 0.5);
        finalResult = blendDeterministicAndWorkRubric(finalResult, reasoningResult, primaryWeight);
      }

      // 2c. Misconception evidence — for two-tier items where tier-2 was wrong
      //     and the grader returned a misconceptionId.
      if (finalResult.misconceptionId) {
        // TODO Phase 17.5: write misconception evidence via ctx.services.memory.recordMisconception
        // The grader already surfaced the misconceptionId; the assignment service
        // needs access to studentId + conceptId to complete the write. Those are
        // available on the Assignment but not yet threaded into GraderContext.
        // For now, log a diagnostic so the misconception can be tracked manually.
        ctx.log.info("grader.misconception_detected", {
          itemId: item.id,
          misconceptionId: finalResult.misconceptionId,
        });
      }

      // 3. Approach-feedback fallback — only when no rubric/workRubric was used upstream.
      //    The skip rules inside enrichWithApproachFeedback cover the remaining cases.
      const enableApproach = this.deps.enableApproachFeedback ?? true;
      if (enableApproach) {
        finalResult = await enrichWithApproachFeedback({
          item,
          response: response?.response ?? null,
          base: finalResult,
          ctx,
        });
      }

      perItem.push({
        itemId: item.id,
        score: finalResult.score,
        feedback: finalResult.feedback,
        gradedBy: finalResult.tier,
        ...(finalResult.perCriterion && { perCriterion: finalResult.perCriterion }),
        ...(finalResult.evidenceEventIds && { evidenceEventIds: finalResult.evidenceEventIds }),
        ...(finalResult.misconceptionId && { misconceptionId: finalResult.misconceptionId }),
      });

      if (finalResult.score !== null) {
        totalScore += finalResult.score;
        scoredItemCount++;
      }

      // Track the highest tier seen.
      if (finalResult.tier === "needs-human-review") {
        highestTier = "needs-human-review";
      } else if (finalResult.tier === "rubric-agent" && highestTier !== "needs-human-review") {
        highestTier = "rubric-agent";
      }
    }

    return {
      total: scoredItemCount > 0 ? totalScore / scoredItemCount : 0,
      perItem,
      reviewedBy: highestTier,
    };
  }
}
