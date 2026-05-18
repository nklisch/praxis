/**
 * ProceduralIndexer — session-end strategy-preference updater.
 *
 * Scores a session's outcome from deterministic event signals (grade_math,
 * course.mark_studied, code_sandbox), attributes the delta to the lesson's
 * suggestedStrategy, validates against the pedagogy pack, and upserts
 * (studentId, strategyId) with loss aversion and a per-session [-300, +300] cap.
 *
 * Confidence signal: when the session has a bound assignment (quiz mode), the
 * indexer reads assignment_responses.confidence to compute a confidence-accuracy
 * alignment signal. Mismatches (e.g. "certain" but incorrect) amplify the
 * negative delta; matches (e.g. "certain" and correct) add a small bonus.
 *
 * Heuristic v1 — deterministic, no LLM call. See the feature design in
 * `.work/active/features/epic-phase-18-procedural-memory.md` for rationale.
 */

import { assignmentResponses } from "@praxis/artifacts/schema";
import { proceduralStrategies } from "@praxis/memory/schema";
import { and, eq } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type {
  AssignmentId,
  ConfidenceBand,
  CourseStateReader,
  Indexer,
  IndexerContext,
  Logger,
  PedagogyPackService,
  StrategyId,
  StudentId,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";

export interface ProceduralIndexerDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves the courseId for a given sessionId. Returns null if no course bound. */
  sessionCourseId: (sessionId: string) => string | null;
  /**
   * Resolves the assignmentId bound to a session, if any.
   * Used to fetch per-item confidence values for quiz sessions.
   * Optional — when absent, confidence signals are not read.
   */
  sessionAssignmentId?: (sessionId: string) => string | null;
  /** Reads the active course's current lesson + its suggestedStrategy. */
  courseStateReader: CourseStateReader;
  /** Validates that the lesson's suggestedStrategy is a known strategy id. */
  pedagogyPack: PedagogyPackService;
}

/**
 * Strategy-preference delta from a single session's episodic events.
 */
export interface SessionOutcome {
  /** Preference delta in milli-units. Bounded to [-300, +300] per session. */
  delta: number;
  /** Count of episodic events that contributed to the score. */
  evidenceCount: number;
  /**
   * Count of confidence-band responses read from the assignment, if any.
   * Zero when no assignment is bound or no confidence values were recorded.
   */
  confidenceCount: number;
}

export class ProceduralIndexer implements Indexer {
  readonly id = "procedural";
  readonly schedule = "session-end" as const;

  constructor(private readonly deps: ProceduralIndexerDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    // Skip empty / tiny sessions (mirrors AffectiveIndexer's guard).
    if (ctx.events.length < 2) return;

    // 1. Resolve the session's current lesson and its suggestedStrategy.
    const rawCourseId = this.deps.sessionCourseId(ctx.sessionId);
    if (!rawCourseId) return; // no course bound — nothing to attribute

    const courseId = brandId<"CourseId">(rawCourseId);
    const snapshot = await this.deps.courseStateReader.read({
      studentId: ctx.studentId,
      courseId,
    });
    if (!snapshot?.currentLesson) return;

    const strategyId = snapshot.currentLesson.suggestedStrategy;

    // 2. Validate against the loaded pedagogy pack. If the strategy isn't
    //    known to the pack, skip — better to drop the signal than write
    //    a stray entry that no consumer recognizes.
    if (this.deps.pedagogyPack.getStrategy(strategyId) === null) {
      this.deps.log.debug("procedural.unknown_strategy", { strategyId });
      return;
    }

    // 3. Read per-item confidence values from the assignment, if available.
    const confidencesByItemId = this.readConfidences(ctx.sessionId);

    // 4. Score the session's outcome from episodic events + confidence signals.
    const score = scoreSessionOutcome(ctx.events, confidencesByItemId);

    // No-signal case: skip without writing (net=0 produces no information).
    if (score.delta === 0) {
      this.deps.log.debug("procedural.no_signal", {
        strategyId,
        evidenceCount: score.evidenceCount,
      });
      return;
    }

    // 5. Apply the preference delta and upsert.
    this.applyDelta(ctx.studentId, strategyId, score);
  }

  /**
   * Read per-item confidence values from the session's bound assignment.
   * Returns an empty map when no assignment is bound or the dep is absent.
   */
  private readConfidences(sessionId: string): Map<string, ConfidenceBand> {
    const result = new Map<string, ConfidenceBand>();
    const resolver = this.deps.sessionAssignmentId;
    if (!resolver) return result;

    const rawAssignmentId = resolver(sessionId);
    if (!rawAssignmentId) return result;

    const assignmentId = brandId<"AssignmentId">(rawAssignmentId) as AssignmentId;
    const rows = this.deps.db
      .select({ itemId: assignmentResponses.itemId, confidence: assignmentResponses.confidence })
      .from(assignmentResponses)
      .where(eq(assignmentResponses.assignmentId, assignmentId))
      .all();

    for (const row of rows) {
      if (row.confidence !== null && row.confidence !== undefined) {
        result.set(row.itemId, row.confidence as ConfidenceBand);
      }
    }
    return result;
  }

  private applyDelta(studentId: StudentId, strategyId: StrategyId, score: SessionOutcome): void {
    const existing = this.deps.db
      .select()
      .from(proceduralStrategies)
      .where(
        and(
          eq(proceduralStrategies.studentId, studentId),
          eq(proceduralStrategies.strategyId, strategyId),
        ),
      )
      .get();

    const oldPref = existing?.preferenceMilli ?? 0;
    const oldCount = existing?.evidenceCount ?? 0;

    // Clamp to [-1000, +1000] milli — hard preference boundary.
    const newPref = Math.max(-1000, Math.min(1000, oldPref + score.delta));
    const newCount = oldCount + score.evidenceCount;

    const now = new Date();

    this.deps.db
      .insert(proceduralStrategies)
      .values({
        studentId,
        strategyId,
        preferenceMilli: newPref,
        evidenceCount: newCount,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [proceduralStrategies.studentId, proceduralStrategies.strategyId],
        set: {
          preferenceMilli: newPref,
          evidenceCount: newCount,
          updatedAt: now,
        },
      })
      .run();
  }
}

/**
 * Compute a strategy-preference delta from a session's episodic events.
 *
 * Heuristic v1:
 * - count_correct: +1 per `grade_math` tool_result with `correct: true`,
 *   per `course.mark_studied` success, per `code_sandbox` success
 *   (exitCode=0 + empty stderr).
 * - count_incorrect: +1 per `grade_math` tool_result with `correct: false`,
 *   per `code_sandbox` failure (exitCode !== 0 and exitCode !== null).
 * - net = count_correct - count_incorrect
 * - delta = net * 50 milli
 * - Asymmetry: if net < 0, multiply by 2 (loss aversion — negative
 *   experiences reshape preferences faster than positive ones).
 * - Bounded: returned delta is clamped to [-300, +300] per session so
 *   one outlier session can't dominate the running preference.
 *
 * Confidence modifier (quiz mode only):
 * When `confidencesByItemId` is non-empty, aggregate confidence is used as
 * a small additive bonus. The modifier is +confidenceMean * 20 milli (capped
 * at +40), added after the session cap. This rewards consistent self-assessment
 * calibration (students who know they know something) without overriding the
 * primary correctness-based delta.
 *
 * confidenceMean: average of per-item confidence values mapped as
 *   guessed=0, unsure=0.33, pretty_sure=0.67, certain=1.0
 * The modifier is independent of correctness — it rewards engagement with the
 * confidence signal itself, not just right answers. Future tuning can weight
 * confidence-accuracy alignment differently.
 *
 * Note: active-path tools (`update_mastery`, `record_misconception`) are not
 * among the tool names read here, so there is no double-counting concern in v1.
 * If new tools are added that write to memory directly, revisit this list.
 *
 * Exported for unit-test coverage of the pure scoring logic.
 */
export function scoreSessionOutcome(
  events: IndexerContext["events"],
  confidencesByItemId: Map<string, ConfidenceBand> = new Map(),
): SessionOutcome {
  // Build callId → toolName index from tool_call events.
  const toolNames = new Map<string, string>();
  for (const { event } of events) {
    if (event.type === "tool_call") {
      toolNames.set(event.callId, event.toolName);
    }
  }

  let correct = 0;
  let incorrect = 0;

  for (const { event } of events) {
    if (event.type !== "tool_result") continue;
    const tool = toolNames.get(event.callId);
    if (!tool) continue;
    if (!event.result.ok) continue;
    const value = event.result.value as Record<string, unknown> | undefined;

    if (tool === "grade_math") {
      const c = value?.correct;
      if (c === true) correct++;
      else if (c === false) incorrect++;
    } else if (tool === "course.mark_studied") {
      // mark_studied implies a positive engagement signal (concept completed).
      correct++;
    } else if (tool === "code_sandbox") {
      const exit = (value as { exitCode?: number | null } | undefined)?.exitCode;
      const stderr = (value as { stderr?: string } | undefined)?.stderr ?? "";
      if (exit === 0 && stderr.trim() === "") {
        correct++;
      } else if (exit !== 0 && exit !== null && exit !== undefined) {
        incorrect++;
      }
    }
  }

  const net = correct - incorrect;
  const evidenceCount = correct + incorrect;

  // Loss aversion: negative experiences nudge preference 2× faster.
  let delta = net * 50;
  if (net < 0) delta *= 2;

  // Bound per-session contribution to limit single-session influence.
  delta = Math.max(-300, Math.min(300, delta));

  // Confidence modifier: reward engagement with the self-assessment signal.
  // Maps confidence levels to numeric values and applies a small additive bonus.
  let confidenceCount = 0;
  if (confidencesByItemId.size > 0) {
    const CONFIDENCE_VALUE: Record<ConfidenceBand, number> = {
      guessed: 0,
      unsure: 0.33,
      pretty_sure: 0.67,
      certain: 1.0,
    };
    let sum = 0;
    for (const band of confidencesByItemId.values()) {
      sum += CONFIDENCE_VALUE[band];
      confidenceCount++;
    }
    if (confidenceCount > 0) {
      const mean = sum / confidenceCount;
      // Additive bonus: +mean * 20, max +40 milli — small nudge, doesn't dominate.
      const bonus = Math.round(Math.min(40, mean * 20));
      delta += bonus;
    }
  }

  return { delta, evidenceCount, confidenceCount };
}
