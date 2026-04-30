/**
 * Pure recursive evaluator over SuccessCriteria.
 * No DB access — readers are injected as parameters.
 * Cross-course criteria are NOT supported in v1.
 */
import type { GradeReader, MasteryReader, SuccessCriteria } from "@praxis/core/types";

export interface CriteriaEvaluation {
  satisfied: boolean;
  /** 0..1; for AND/OR, weighted (avg / max) progress. */
  progress: number;
  /** Human-readable summary of the criteria. */
  summary: string;
  /** Reason it's not satisfied (or empty when satisfied). */
  unsatisfiedReason: string;
}

/**
 * Pure evaluator. Walks the SuccessCriteria tree, awaiting reader calls.
 * Uses an exhaustive switch — adding a new variant in Phase 11 is compiler-enforced.
 */
export async function evaluateSuccessCriteria(
  criteria: SuccessCriteria,
  studentId: string,
  masteryReader: MasteryReader,
  gradeReader: GradeReader,
): Promise<CriteriaEvaluation> {
  switch (criteria.kind) {
    case "mastery-threshold":
      return evaluateMasteryThreshold(criteria, studentId, masteryReader);
    case "exam-pass":
      return evaluateExamPass(criteria, gradeReader);
    case "and":
      return evaluateAnd(criteria, studentId, masteryReader, gradeReader);
    case "or":
      return evaluateOr(criteria, studentId, masteryReader, gradeReader);
    default: {
      // Exhaustiveness check — compiler enforces updating when new variants are added.
      const _exhaust: never = criteria;
      void _exhaust;
      throw new Error(`gate.unknown_criteria_kind: ${(criteria as { kind: string }).kind}`);
    }
  }
}

async function evaluateMasteryThreshold(
  c: Extract<SuccessCriteria, { kind: "mastery-threshold" }>,
  studentId: string,
  reader: MasteryReader,
): Promise<CriteriaEvaluation> {
  if (c.conceptIds.length === 0) {
    return {
      satisfied: false,
      progress: 0,
      summary: "mastery threshold (no concepts)",
      unsatisfiedReason: "no concepts configured",
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: StudentId brand cast needed for cross-module use
  const scores = await Promise.all(
    c.conceptIds.map((id) =>
      reader.read({
        studentId: studentId as Parameters<MasteryReader["read"]>[0]["studentId"],
        conceptId: id,
      }),
    ),
  );

  const minScore = Math.min(...scores);
  const satisfied = scores.every((s) => s >= c.minScore);
  const progress = Math.min(1, minScore / c.minScore);
  const summary = `mastery ≥ ${c.minScore.toFixed(2)} on ${c.conceptIds.length} concept${c.conceptIds.length === 1 ? "" : "s"}`;
  const unsatisfiedReason = satisfied
    ? ""
    : `lowest mastery is ${minScore.toFixed(2)}; need ≥ ${c.minScore.toFixed(2)}`;

  return { satisfied, progress, summary, unsatisfiedReason };
}

async function evaluateExamPass(
  c: Extract<SuccessCriteria, { kind: "exam-pass" }>,
  reader: GradeReader,
): Promise<CriteriaEvaluation> {
  const grade = await reader.readGrade({ assignmentId: c.assignmentId });
  if (!grade) {
    return {
      satisfied: false,
      progress: 0,
      summary: `exam pass ≥ ${c.minScore.toFixed(2)}`,
      unsatisfiedReason: "exam not yet submitted",
    };
  }
  const satisfied = grade.total >= c.minScore;
  const progress = Math.min(1, grade.total / c.minScore);
  const summary = `exam pass ≥ ${c.minScore.toFixed(2)}`;
  const unsatisfiedReason = satisfied
    ? ""
    : `exam total ${grade.total.toFixed(2)} < ${c.minScore.toFixed(2)}`;
  return { satisfied, progress, summary, unsatisfiedReason };
}

async function evaluateAnd(
  c: Extract<SuccessCriteria, { kind: "and" }>,
  studentId: string,
  masteryReader: MasteryReader,
  gradeReader: GradeReader,
): Promise<CriteriaEvaluation> {
  if (c.criteria.length === 0) {
    return {
      satisfied: false,
      progress: 0,
      summary: "AND (empty)",
      unsatisfiedReason: "no sub-criteria",
    };
  }
  const subs = await Promise.all(
    c.criteria.map((sub) => evaluateSuccessCriteria(sub, studentId, masteryReader, gradeReader)),
  );
  const satisfied = subs.every((s) => s.satisfied);
  const progress = subs.reduce((sum, s) => sum + s.progress, 0) / subs.length;
  const summary = subs.map((s) => s.summary).join(" AND ");
  const unsatisfiedReason = subs
    .filter((s) => !s.satisfied)
    .map((s) => s.unsatisfiedReason)
    .join("; ");
  return { satisfied, progress, summary, unsatisfiedReason };
}

async function evaluateOr(
  c: Extract<SuccessCriteria, { kind: "or" }>,
  studentId: string,
  masteryReader: MasteryReader,
  gradeReader: GradeReader,
): Promise<CriteriaEvaluation> {
  if (c.criteria.length === 0) {
    return {
      satisfied: false,
      progress: 0,
      summary: "OR (empty)",
      unsatisfiedReason: "no sub-criteria",
    };
  }
  const subs = await Promise.all(
    c.criteria.map((sub) => evaluateSuccessCriteria(sub, studentId, masteryReader, gradeReader)),
  );
  const satisfied = subs.some((s) => s.satisfied);
  const progress = Math.max(...subs.map((s) => s.progress));
  const summary = subs.map((s) => s.summary).join(" OR ");
  const unsatisfiedReason = satisfied ? "" : "no branch satisfied";
  return { satisfied, progress, summary, unsatisfiedReason };
}
