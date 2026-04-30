/**
 * Unit tests for evaluateSuccessCriteria — Phase 9.
 *
 * Pure function tests: no DB, stubs for readers.
 */
import type { GradeReader, MasteryReader, SuccessCriteria, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { evaluateSuccessCriteria } from "../criteria.js";

// ── Stub readers ───────────────────────────────────────────────────────────────

function makeMasteryReader(scores: Record<string, number>): MasteryReader {
  return {
    async read({ conceptId }) {
      return scores[conceptId] ?? 0;
    },
  };
}

function makeGradeReader(
  grades: Record<string, { total: number; submittedAt: Timestamp } | null>,
): GradeReader {
  return {
    async readGrade({ assignmentId }) {
      return grades[assignmentId] ?? null;
    },
  };
}

const STUDENT_ID = brandId<"StudentId">("student-test");

// ── mastery-threshold ─────────────────────────────────────────────────────────

describe("mastery-threshold", () => {
  it("satisfied when all concepts meet the threshold", async () => {
    const criteria: SuccessCriteria = {
      kind: "mastery-threshold",
      conceptIds: [brandId<"ConceptId">("c1"), brandId<"ConceptId">("c2")],
      minScore: 0.7,
    };
    const reader = makeMasteryReader({ c1: 0.8, c2: 0.75 });
    const result = await evaluateSuccessCriteria(criteria, STUDENT_ID, reader, makeGradeReader({}));
    expect(result.satisfied).toBe(true);
    expect(result.progress).toBe(1);
    expect(result.unsatisfiedReason).toBe("");
  });

  it("not satisfied when any concept is below threshold", async () => {
    const criteria: SuccessCriteria = {
      kind: "mastery-threshold",
      conceptIds: [brandId<"ConceptId">("c1"), brandId<"ConceptId">("c2")],
      minScore: 0.7,
    };
    const reader = makeMasteryReader({ c1: 0.8, c2: 0.42 });
    const result = await evaluateSuccessCriteria(criteria, STUDENT_ID, reader, makeGradeReader({}));
    expect(result.satisfied).toBe(false);
    expect(result.progress).toBeCloseTo(0.42 / 0.7, 4);
    expect(result.unsatisfiedReason).toContain("0.42");
    expect(result.unsatisfiedReason).toContain("0.70");
  });

  it("returns 0 for unknown concepts (fail-safe)", async () => {
    const criteria: SuccessCriteria = {
      kind: "mastery-threshold",
      conceptIds: [brandId<"ConceptId">("unknown")],
      minScore: 0.7,
    };
    const reader = makeMasteryReader({});
    const result = await evaluateSuccessCriteria(criteria, STUDENT_ID, reader, makeGradeReader({}));
    expect(result.satisfied).toBe(false);
    expect(result.progress).toBe(0);
  });

  it("not satisfied when conceptIds is empty", async () => {
    const criteria: SuccessCriteria = {
      kind: "mastery-threshold",
      conceptIds: [],
      minScore: 0.7,
    };
    const reader = makeMasteryReader({});
    const result = await evaluateSuccessCriteria(criteria, STUDENT_ID, reader, makeGradeReader({}));
    expect(result.satisfied).toBe(false);
  });
});

// ── exam-pass ─────────────────────────────────────────────────────────────────

describe("exam-pass", () => {
  it("satisfied when grade meets threshold", async () => {
    const criteria: SuccessCriteria = {
      kind: "exam-pass",
      assignmentId: brandId<"AssignmentId">("asgn-1"),
      minScore: 0.7,
    };
    const reader = makeGradeReader({
      "asgn-1": { total: 0.85, submittedAt: Date.now() as Timestamp },
    });
    const result = await evaluateSuccessCriteria(
      criteria,
      STUDENT_ID,
      makeMasteryReader({}),
      reader,
    );
    expect(result.satisfied).toBe(true);
    expect(result.progress).toBe(1);
  });

  it("not satisfied when exam not submitted", async () => {
    const criteria: SuccessCriteria = {
      kind: "exam-pass",
      assignmentId: brandId<"AssignmentId">("asgn-1"),
      minScore: 0.7,
    };
    const result = await evaluateSuccessCriteria(
      criteria,
      STUDENT_ID,
      makeMasteryReader({}),
      makeGradeReader({}),
    );
    expect(result.satisfied).toBe(false);
    expect(result.progress).toBe(0);
    expect(result.unsatisfiedReason).toContain("not yet submitted");
  });

  it("not satisfied when grade below threshold", async () => {
    const criteria: SuccessCriteria = {
      kind: "exam-pass",
      assignmentId: brandId<"AssignmentId">("asgn-1"),
      minScore: 0.7,
    };
    const reader = makeGradeReader({
      "asgn-1": { total: 0.5, submittedAt: Date.now() as Timestamp },
    });
    const result = await evaluateSuccessCriteria(
      criteria,
      STUDENT_ID,
      makeMasteryReader({}),
      reader,
    );
    expect(result.satisfied).toBe(false);
    expect(result.progress).toBeCloseTo(0.5 / 0.7, 4);
  });
});

// ── and / or ─────────────────────────────────────────────────────────────────

describe("and", () => {
  it("satisfied only when all branches are satisfied", async () => {
    const criteria: SuccessCriteria = {
      kind: "and",
      criteria: [
        { kind: "mastery-threshold", conceptIds: [brandId<"ConceptId">("c1")], minScore: 0.7 },
        { kind: "mastery-threshold", conceptIds: [brandId<"ConceptId">("c2")], minScore: 0.7 },
      ],
    };
    const reader = makeMasteryReader({ c1: 0.8, c2: 0.75 });
    const result = await evaluateSuccessCriteria(criteria, STUDENT_ID, reader, makeGradeReader({}));
    expect(result.satisfied).toBe(true);
    expect(result.progress).toBe(1);
  });

  it("not satisfied when any branch fails; progress is mean", async () => {
    const criteria: SuccessCriteria = {
      kind: "and",
      criteria: [
        { kind: "mastery-threshold", conceptIds: [brandId<"ConceptId">("c1")], minScore: 0.7 },
        { kind: "mastery-threshold", conceptIds: [brandId<"ConceptId">("c2")], minScore: 0.7 },
      ],
    };
    const reader = makeMasteryReader({ c1: 0.7, c2: 0.0 }); // c2: progress = 0/0.7 = 0
    const result = await evaluateSuccessCriteria(criteria, STUDENT_ID, reader, makeGradeReader({}));
    expect(result.satisfied).toBe(false);
    // c1 progress = min(1, 0.7/0.7) = 1; c2 progress = 0; avg = 0.5
    expect(result.progress).toBeCloseTo(0.5, 4);
  });
});

describe("or", () => {
  it("satisfied when any branch is satisfied", async () => {
    const criteria: SuccessCriteria = {
      kind: "or",
      criteria: [
        { kind: "mastery-threshold", conceptIds: [brandId<"ConceptId">("c1")], minScore: 0.7 },
        { kind: "mastery-threshold", conceptIds: [brandId<"ConceptId">("c2")], minScore: 0.7 },
      ],
    };
    // c1 doesn't meet threshold, c2 does
    const reader = makeMasteryReader({ c1: 0.3, c2: 0.9 });
    const result = await evaluateSuccessCriteria(criteria, STUDENT_ID, reader, makeGradeReader({}));
    expect(result.satisfied).toBe(true);
    expect(result.progress).toBe(1);
  });

  it("not satisfied when no branch satisfied; progress is max", async () => {
    const criteria: SuccessCriteria = {
      kind: "or",
      criteria: [
        { kind: "mastery-threshold", conceptIds: [brandId<"ConceptId">("c1")], minScore: 0.7 },
        { kind: "mastery-threshold", conceptIds: [brandId<"ConceptId">("c2")], minScore: 0.7 },
      ],
    };
    const reader = makeMasteryReader({ c1: 0.35, c2: 0.49 }); // c2 has higher progress
    const result = await evaluateSuccessCriteria(criteria, STUDENT_ID, reader, makeGradeReader({}));
    expect(result.satisfied).toBe(false);
    // c1 progress = 0.35/0.7 = 0.5; c2 progress = 0.49/0.7 = 0.7; max = 0.7
    expect(result.progress).toBeCloseTo(0.49 / 0.7, 4);
  });
});
