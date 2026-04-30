/**
 * Unit tests for GateEvaluatorImpl — Phase 9.
 *
 * Pure function tests: no DB, stubs for readers.
 * Covers: basic unlock, unlock-only (no re-lock), prerequisite chaining,
 * overridden gates, cycle defense.
 */
import type {
  Gate,
  GateId,
  GateState,
  GradeReader,
  MasteryReader,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { GateEvaluatorImpl } from "../evaluator.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const STUDENT_ID = brandId<"StudentId">("student-eval");
const NOW = Date.now() as Timestamp;

function makeMasteryReader(scores: Record<string, number>): MasteryReader {
  return {
    async read({ conceptId }) {
      return scores[conceptId] ?? 0;
    },
  };
}

const noGradeReader: GradeReader = {
  async readGrade() {
    return null;
  },
};

function makeLockedGate(
  id: string,
  conceptIds: string[],
  minScore: number,
  prerequisites: string[] = [],
): Gate {
  return {
    id: brandId<"GateId">(id),
    courseId: brandId<"CourseId">("course-1"),
    guards: { kind: "lesson", lessonId: brandId<"LessonId">(id + "-lesson") },
    prerequisites: prerequisites.map((p) => brandId<"GateId">(p)),
    successCriteria: {
      kind: "mastery-threshold",
      conceptIds: conceptIds.map((c) => brandId<"ConceptId">(c)),
      minScore,
    },
    state: { kind: "locked", missingPrerequisites: [] },
    evidence: [],
  };
}

function makeUnlockedGate(id: string): Gate {
  const state: GateState = { kind: "unlocked", unlockedAt: NOW, evidence: [] };
  return {
    id: brandId<"GateId">(id),
    courseId: brandId<"CourseId">("course-1"),
    guards: { kind: "lesson", lessonId: brandId<"LessonId">(id + "-lesson") },
    prerequisites: [],
    successCriteria: { kind: "mastery-threshold", conceptIds: [], minScore: 0.7 },
    state,
    evidence: [],
  };
}

const evaluator = new GateEvaluatorImpl();

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GateEvaluatorImpl", () => {
  it("unlocks a gate when mastery criteria are met", async () => {
    const gates = [makeLockedGate("g1", ["c1", "c2"], 0.7)];
    const result = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates,
      masteryReader: makeMasteryReader({ c1: 0.8, c2: 0.75 }),
      gradeReader: noGradeReader,
      now: NOW,
    });

    expect(result.perGate).toHaveLength(1);
    expect(result.perGate[0]?.afterState.kind).toBe("unlocked");
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0]?.kind).toBe("unlocked");
    expect(result.transitions[0]?.gateId).toBe("g1");
  });

  it("leaves a gate locked when mastery criteria not met", async () => {
    const gates = [makeLockedGate("g1", ["c1"], 0.7)];
    const result = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates,
      masteryReader: makeMasteryReader({ c1: 0.42 }),
      gradeReader: noGradeReader,
      now: NOW,
    });

    expect(result.perGate[0]?.afterState.kind).toBe("locked");
    expect(result.transitions).toHaveLength(0);
    expect(result.perGate[0]?.progress).toBeCloseTo(0.42 / 0.7, 4);
  });

  it("already-unlocked gate stays unlocked (no re-lock in v1)", async () => {
    const gate = makeUnlockedGate("g1");
    const result = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates: [gate],
      masteryReader: makeMasteryReader({ c1: 0 }), // would fail criteria
      gradeReader: noGradeReader,
      now: NOW,
    });

    expect(result.perGate[0]?.afterState.kind).toBe("unlocked");
    expect(result.transitions).toHaveLength(0); // no transition since already unlocked
  });

  it("overridden gate stays overridden", async () => {
    const gate: Gate = {
      id: brandId<"GateId">("g-override"),
      courseId: brandId<"CourseId">("course-1"),
      guards: { kind: "lesson", lessonId: brandId<"LessonId">("l1") },
      prerequisites: [],
      successCriteria: {
        kind: "mastery-threshold",
        conceptIds: [brandId<"ConceptId">("c1")],
        minScore: 0.9,
      },
      state: {
        kind: "overridden",
        by: brandId<"ConfiguratorId">("admin"),
        reason: "test",
        at: NOW,
      },
      evidence: [],
    };
    const result = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates: [gate],
      masteryReader: makeMasteryReader({ c1: 0 }),
      gradeReader: noGradeReader,
      now: NOW,
    });

    expect(result.perGate[0]?.afterState.kind).toBe("overridden");
    expect(result.perGate[0]?.progress).toBe(1);
    expect(result.transitions).toHaveLength(0);
  });

  it("prerequisite chaining: dependent gate stays locked until prereq unlocks", async () => {
    const g1 = makeLockedGate("g1", ["c1"], 0.7); // c1 = 0.3, doesn't unlock
    const g2 = makeLockedGate("g2", ["c2"], 0.7, ["g1"]); // would unlock if prereq met
    const result = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates: [g1, g2],
      masteryReader: makeMasteryReader({ c1: 0.3, c2: 0.9 }),
      gradeReader: noGradeReader,
      now: NOW,
    });

    expect(result.perGate[0]?.afterState.kind).toBe("locked"); // g1 locked
    expect(result.perGate[1]?.afterState.kind).toBe("locked"); // g2 blocked by g1
    expect(result.perGate[1]?.progress).toBe(0); // blocked by prereq
    expect(result.transitions).toHaveLength(0);
  });

  it("prerequisite chaining: dependent gate unlocks once prereq is met", async () => {
    const g1 = makeLockedGate("g1", ["c1"], 0.7); // c1 = 0.8, unlocks
    const g2 = makeLockedGate("g2", ["c2"], 0.7, ["g1"]); // c2 = 0.9, unlocks after g1
    const result = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates: [g1, g2],
      masteryReader: makeMasteryReader({ c1: 0.8, c2: 0.9 }),
      gradeReader: noGradeReader,
      now: NOW,
    });

    expect(result.perGate[0]?.afterState.kind).toBe("unlocked");
    expect(result.perGate[1]?.afterState.kind).toBe("unlocked");
    expect(result.transitions).toHaveLength(2);
  });

  it("cycle protection: logs warn and proceeds without infinite loop", async () => {
    // g1 → g2 → g1 (cycle)
    const makeGateWithPrereqs = (id: string, prereqs: string[]): Gate => ({
      ...makeLockedGate(id, ["c1"], 0.7),
      prerequisites: prereqs.map((p) => brandId<"GateId">(p)),
    });
    const gates = [makeGateWithPrereqs("g1", ["g2"]), makeGateWithPrereqs("g2", ["g1"])];

    const warnMessages: string[] = [];
    const warnLog = {
      warn: (msg: string) => {
        warnMessages.push(msg);
      },
    };

    const result = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates,
      masteryReader: makeMasteryReader({ c1: 0.9 }),
      gradeReader: noGradeReader,
      now: NOW,
      // biome-ignore lint/suspicious/noExplicitAny: test partial logger stub
      log: warnLog as any,
    });

    // Should not crash, no gates resolved (cycle prevents evaluation)
    expect(result.perGate).toHaveLength(0);
    expect(result.transitions).toHaveLength(0);
    expect(warnMessages.some((m) => m.includes("cycle"))).toBe(true);
  });

  it("idempotent: re-evaluating same state produces no new transitions", async () => {
    // Start with g1 already unlocked
    const gates = [makeUnlockedGate("g1")];

    const result1 = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates,
      masteryReader: makeMasteryReader({ c1: 0.9 }),
      gradeReader: noGradeReader,
      now: NOW,
    });
    const result2 = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates,
      masteryReader: makeMasteryReader({ c1: 0.9 }),
      gradeReader: noGradeReader,
      now: NOW,
    });

    expect(result1.transitions).toHaveLength(0);
    expect(result2.transitions).toHaveLength(0);
    expect(result1.perGate[0]?.afterState.kind).toBe("unlocked");
    expect(result2.perGate[0]?.afterState.kind).toBe("unlocked");
  });

  it("progress: locked gate near threshold has correct fractional progress", async () => {
    const gate = makeLockedGate("g1", ["c1"], 0.7);
    const result = await evaluator.evaluate({
      studentId: STUDENT_ID,
      gates: [gate],
      masteryReader: makeMasteryReader({ c1: 0.35 }), // exactly 50% of threshold
      gradeReader: noGradeReader,
      now: NOW,
    });

    expect(result.perGate[0]?.progress).toBeCloseTo(0.5, 4);
  });
});
