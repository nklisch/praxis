/**
 * MasteryIndexer — deterministic post-turn BKT update from episodic events.
 *
 * Scans recent events for recognizable grade/course signals and applies BKT
 * updates to `student_mastery`. Idempotent: re-running over the same events
 * (same turnFloor range) produces the same final state because BKT is applied
 * in event order and the orchestrator's turnFloor prevents re-processing.
 *
 * Active-path tool results (`update_mastery`, `record_misconception`) are
 * SKIPPED — those tools write BKT directly; the indexer must not double-apply.
 */

import type { PraxisDb } from "../../db/index.js";
import type {
  ConceptId,
  CourseStateReader,
  Indexer,
  IndexerContext,
  Logger,
  MasterySignal,
  MasterySignalKind,
  StudentId,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { applySignalsToConcept } from "../memory/mastery-writes.js";

/**
 * Active-path tool names that write BKT directly.
 * The indexer skips tool_result events for these tools to avoid double-applying.
 */
const ACTIVE_PATH_TOOL_NAMES = new Set(["update_mastery", "record_misconception"]);

export interface MasteryIndexerDeps {
  db: PraxisDb;
  log: Logger;
  /** Reads the active course's current concept(s) for attribution fallback. */
  courseStateReader: CourseStateReader;
  /**
   * Resolves the courseId for the given sessionId.
   * Returns null if the session has no associated course.
   */
  sessionCourseId: (sessionId: string) => string | null;
}

export class MasteryIndexer implements Indexer {
  readonly id = "mastery";
  readonly schedule = "post-turn" as const;

  constructor(private readonly deps: MasteryIndexerDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    const signals = await this.extractSignals(ctx);
    if (signals.length === 0) return;

    // Group signals by concept; apply BKT updates serially per concept.
    const grouped = new Map<ConceptId, MasterySignal[]>();
    for (const s of signals) {
      const arr = grouped.get(s.conceptId) ?? [];
      arr.push(s);
      grouped.set(s.conceptId, arr);
    }

    for (const [conceptId, conceptSignals] of grouped) {
      this.applySignalsToConcept(ctx.studentId, conceptId, conceptSignals);
    }
  }

  // ── Signal extraction ─────────────────────────────────────────────────────────

  /**
   * Walk events and build a call-id → tool-name map, then pattern-match
   * tool_result events to extract mastery signals.
   *
   * Recognized patterns (in priority order):
   *   1. tool_result for `update_mastery` → skip (active-path; already wrote BKT)
   *   2. tool_result for `course.mark_studied` → correct signal for the marked concept
   *   3. tool_result for `grade_math` with value.correct=true/false → correct/incorrect
   *   4. tool_result for `code_sandbox` → correct (exit=0 + empty stderr) / incorrect
   *   5. Anything else → no signal
   */
  private async extractSignals(ctx: IndexerContext): Promise<MasterySignal[]> {
    // Build callId → toolName index from tool_call events.
    const toolNames = new Map<string, string>();
    for (const { event } of ctx.events) {
      if (event.type === "tool_call") {
        toolNames.set(event.callId, event.toolName);
      }
    }

    // Lazy: only resolve courseId / courseState when needed.
    let resolvedCurrentConceptId: ConceptId | null | undefined; // undefined = not yet looked up

    const signals: MasterySignal[] = [];

    for (const { id: eventId, event } of ctx.events) {
      if (event.type !== "tool_result") continue;

      const toolName = toolNames.get(event.callId);
      if (!toolName) {
        // No matching tool_call seen — skip.
        continue;
      }

      // Skip active-path tools (they wrote BKT directly).
      if (ACTIVE_PATH_TOOL_NAMES.has(toolName)) {
        continue;
      }

      const result = event.result;

      if (toolName === "course.mark_studied") {
        // Correct signal for the marked concept.
        if (!result.ok) continue;
        const conceptId = this.extractMarkStudiedConceptId(event.callId, ctx.events);
        if (!conceptId) {
          this.deps.log.debug("mastery_indexer.mark_studied.no_concept_id", { eventId });
          continue;
        }
        signals.push({
          conceptId,
          kind: "correct",
          evidenceEventIds: [eventId],
        });
        continue;
      }

      if (toolName === "grade_math") {
        // correct/incorrect based on value.correct
        if (!result.ok) continue;
        const value = result.value as { correct?: boolean } | undefined;
        if (value === undefined || value.correct === undefined) continue;
        const kind: MasterySignalKind = value.correct ? "correct" : "incorrect";

        // Attribution: fall back to current concept in session.
        if (resolvedCurrentConceptId === undefined) {
          resolvedCurrentConceptId = await this.resolveCurrentConcept(ctx);
        }
        if (!resolvedCurrentConceptId) {
          this.deps.log.debug("mastery_indexer.grade_math.no_current_concept", { eventId });
          continue;
        }
        signals.push({
          conceptId: resolvedCurrentConceptId,
          kind,
          evidenceEventIds: [eventId],
        });
        continue;
      }

      if (toolName === "code_sandbox") {
        // correct when exitCode=0 and stderr is empty (or absent)
        if (!result.ok) continue;
        const value = result.value as { exitCode?: number | null; stderr?: string } | undefined;
        if (value === undefined) continue;
        const isCorrect = value.exitCode === 0 && (!value.stderr || value.stderr.trim() === "");
        const kind: MasterySignalKind = isCorrect ? "correct" : "incorrect";

        if (resolvedCurrentConceptId === undefined) {
          resolvedCurrentConceptId = await this.resolveCurrentConcept(ctx);
        }
        if (!resolvedCurrentConceptId) {
          this.deps.log.debug("mastery_indexer.code_sandbox.no_current_concept", { eventId });
          continue;
        }
        signals.push({
          conceptId: resolvedCurrentConceptId,
          kind,
          evidenceEventIds: [eventId],
        });
      }

      // Pattern 1: update_mastery active-path tool result with explicit attribution.
      // Already handled by the ACTIVE_PATH_TOOL_NAMES check above (skip). No-op here.
    }

    return signals;
  }

  /**
   * Look up the conceptId from the `course.mark_studied` tool call args.
   * The tool_call event carries the args; we need to find the matching tool_call by callId.
   */
  private extractMarkStudiedConceptId(
    callId: string,
    events: IndexerContext["events"],
  ): ConceptId | null {
    for (const { event } of events) {
      if (event.type === "tool_call" && event.callId === callId) {
        const args = event.args as { conceptId?: string } | undefined;
        if (args?.conceptId) return brandId<"ConceptId">(args.conceptId);
        return null;
      }
    }
    return null;
  }

  /**
   * Resolve the current concept for the session's active course.
   * Returns null when no course / no current concept is resolvable (conservative skip).
   */
  private async resolveCurrentConcept(ctx: IndexerContext): Promise<ConceptId | null> {
    const rawCourseId = this.deps.sessionCourseId(ctx.sessionId);
    if (!rawCourseId) return null;

    const courseId = brandId<"CourseId">(rawCourseId);
    const snapshot = await this.deps.courseStateReader.read({
      studentId: ctx.studentId,
      courseId,
    });
    if (!snapshot) return null;
    if (!snapshot.currentLesson) return null;

    // First un-studied concept in the current lesson.
    const concepts = snapshot.conceptsByLesson.get(snapshot.currentLesson.id) ?? [];
    const target = concepts.find((c) => !c.studied);
    return target?.conceptId ?? null;
  }

  // ── BKT write ─────────────────────────────────────────────────────────────────

  /**
   * Delegates to the canonical `applySignalsToConcept` from mastery-writes.ts.
   * Single source of truth for BKT application — no logic duplicated here.
   */
  applySignalsToConcept(
    studentId: StudentId,
    conceptId: ConceptId,
    signals: MasterySignal[],
  ): void {
    applySignalsToConcept(this.deps, studentId, conceptId, signals);
  }
}
