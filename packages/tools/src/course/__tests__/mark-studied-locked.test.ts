/**
 * Unit tests for mark_studied lock enforcement — Phase 9.
 *
 * Pure function tests: no DB. Stubs for ToolContext services.
 * Covers: no lock when no courseId, throws when concept's lesson is locked,
 *         passes when unlocked, unknown concept returns ok=false reason.
 */
import type {
  ArtifactsService,
  ConceptId,
  ConceptStateRow,
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  GateView,
  LessonId,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { markStudiedTool } from "../mark-studied.js";

const STUDENT_ID = brandId<"StudentId">("student-mark-locked");
const SESSION_ID = brandId<"SessionId">("session-mark-locked");
const COURSE_ID = brandId<"CourseId">("course-mark-locked");
const LESSON_ID = brandId<"LessonId">("lesson-mark-locked");
const CONCEPT_ID = brandId<"ConceptId">("concept-mark-locked");

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeGateView(lessonId: LessonId, stateKind: "locked" | "unlocked"): GateView {
  const state =
    stateKind === "locked"
      ? { kind: "locked" as const, missingPrerequisites: [] }
      : { kind: "unlocked" as const, unlockedAt: Date.now() as Timestamp, evidence: [] };
  return {
    gate: {
      id: brandId<"GateId">("gate-mark"),
      courseId: COURSE_ID,
      guards: { kind: "lesson", lessonId },
      prerequisites: [],
      successCriteria: {
        kind: "mastery-threshold",
        conceptIds: [brandId<"ConceptId">("c1")],
        minScore: 0.7,
      },
      state,
      evidence: [],
    },
    summaryText: "Needs mastery of c1",
    lockReason: stateKind === "locked" ? "below threshold" : "",
    progress: stateKind === "locked" ? 0.3 : 1,
    isActive: stateKind === "locked",
  };
}

function makeConceptRow(conceptId: ConceptId, lessonId: LessonId): ConceptStateRow {
  return {
    conceptId,
    name: "Test Concept",
    description: "",
    studied: false,
    lessonId,
  };
}

function makeSnapshot(
  gates: GateView[],
  conceptsById: Map<ConceptId, ConceptStateRow>,
): CourseStateSnapshot {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    course: {} as any,
    lessons: [],
    currentLesson: null,
    conceptsByLesson: new Map(),
    conceptsById,
    gates,
    activeGate: gates.find((g) => g.isActive) ?? null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
  };
}

function makeCtxForSnapshot(snapshot: CourseStateSnapshot | null, courseId?: CourseId) {
  const courseState: CourseStateReader = {
    read: vi.fn().mockResolvedValue(snapshot),
  };
  const artifacts: Partial<ArtifactsService> = {
    markConceptStudied: vi.fn().mockResolvedValue({ lessonComplete: false, lessonId: LESSON_ID }),
  };
  return makeToolContext({
    studentId: STUDENT_ID,
    sessionId: SESSION_ID,
    courseId,
    services: { courseState, artifacts: artifacts as ArtifactsService },
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("mark_studied lock enforcement", () => {
  it("skips lock check when ctx.courseId is absent (backward compat)", async () => {
    const ctx = makeCtxForSnapshot(null, undefined);
    await expect(markStudiedTool.handler({ conceptId: CONCEPT_ID }, ctx)).resolves.toBeDefined();
  });

  it("skips lock check when snapshot is null (course not found)", async () => {
    const ctx = makeCtxForSnapshot(null, COURSE_ID);
    await expect(markStudiedTool.handler({ conceptId: CONCEPT_ID }, ctx)).resolves.toBeDefined();
  });

  it("throws when the concept's lesson gate is locked", async () => {
    const conceptsById = new Map([[CONCEPT_ID, makeConceptRow(CONCEPT_ID, LESSON_ID)]]);
    const snapshot = makeSnapshot([makeGateView(LESSON_ID, "locked")], conceptsById);
    const ctx = makeCtxForSnapshot(snapshot, COURSE_ID);

    await expect(markStudiedTool.handler({ conceptId: CONCEPT_ID }, ctx)).rejects.toThrow(
      /cannot mark_studied/,
    );
    await expect(markStudiedTool.handler({ conceptId: CONCEPT_ID }, ctx)).rejects.toThrow(
      CONCEPT_ID,
    );
  });

  it("throws with 'Concept not found' when concept is not in the snapshot", async () => {
    const snapshot = makeSnapshot([makeGateView(LESSON_ID, "locked")], new Map());
    const ctx = makeCtxForSnapshot(snapshot, COURSE_ID);

    await expect(markStudiedTool.handler({ conceptId: CONCEPT_ID }, ctx)).rejects.toThrow(
      /Concept not found/,
    );
  });

  it("does NOT throw when the concept's lesson gate is unlocked", async () => {
    const conceptsById = new Map([[CONCEPT_ID, makeConceptRow(CONCEPT_ID, LESSON_ID)]]);
    const snapshot = makeSnapshot([makeGateView(LESSON_ID, "unlocked")], conceptsById);
    const ctx = makeCtxForSnapshot(snapshot, COURSE_ID);

    await expect(markStudiedTool.handler({ conceptId: CONCEPT_ID }, ctx)).resolves.toBeDefined();
  });
});
