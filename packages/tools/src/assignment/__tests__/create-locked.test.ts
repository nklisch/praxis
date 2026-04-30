/**
 * Unit tests for assignment.create lock enforcement — Phase 9.
 *
 * Pure function tests: no DB.
 * Covers: no lock check when no courseId, throws when any conceptId is locked,
 *         passes when all concepts are unlocked or snapshot is null.
 */
import type {
  AssignmentService,
  ConceptId,
  ConceptStateRow,
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  GateView,
  LessonId,
  Timestamp,
  ToolContext,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { createAssignmentTool } from "../create.js";

const STUDENT_ID = brandId<"StudentId">("student-create-locked");
const SESSION_ID = brandId<"SessionId">("session-create-locked");
const COURSE_ID = brandId<"CourseId">("course-create-locked");
const LESSON_A = brandId<"LessonId">("lesson-create-a");
const LESSON_B = brandId<"LessonId">("lesson-create-b");
const CONCEPT_A = brandId<"ConceptId">("concept-create-a");
const CONCEPT_B = brandId<"ConceptId">("concept-create-b");

const MIN_ITEM = {
  id: "item-1",
  kind: "multiple-choice" as const,
  prompt: "What is 2+2?",
  options: ["3", "4"],
  correctOptionIndex: 1,
};

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeGateView(lessonId: LessonId, stateKind: "locked" | "unlocked"): GateView {
  const state =
    stateKind === "locked"
      ? { kind: "locked" as const, missingPrerequisites: [] }
      : { kind: "unlocked" as const, unlockedAt: Date.now() as Timestamp, evidence: [] };
  return {
    gate: {
      id: brandId<"GateId">(`gate-${lessonId}`),
      courseId: COURSE_ID,
      guards: { kind: "lesson", lessonId },
      prerequisites: [],
      successCriteria: { kind: "mastery-threshold", conceptIds: [], minScore: 0.7 },
      state,
      evidence: [],
    },
    summaryText: "summary",
    lockReason: stateKind === "locked" ? "below threshold" : "",
    progress: stateKind === "locked" ? 0.3 : 1,
    isActive: stateKind === "locked",
  };
}

function makeConceptRow(conceptId: ConceptId, lessonId: LessonId): ConceptStateRow {
  return { conceptId, name: "Test", description: "", studied: false, lessonId };
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
    activeGate: null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
  };
}

function makeCtx(snapshot: CourseStateSnapshot | null, courseId?: CourseId): ToolContext {
  const courseState: CourseStateReader = {
    read: vi.fn().mockResolvedValue(snapshot),
  };
  const assignments: AssignmentService = {
    create: vi.fn().mockResolvedValue({ assignmentId: brandId<"AssignmentId">("assign-1") }),
    get: vi.fn(),
    list: vi.fn(),
    recordResponse: vi.fn(),
    getResponses: vi.fn(),
    submit: vi.fn(),
  };
  return {
    studentId: STUDENT_ID,
    sessionId: SESSION_ID,
    ...(courseId !== undefined && { courseId }),
    services: {
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      memory: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      artifacts: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      bootstrap: null as any,
      courseState,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      vectorStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      ftsStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      embeddings: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      documents: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      sandbox: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      sympy: null as any,
      pedagogyPack: null,
      assignments,
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

const baseArgs = {
  courseId: COURSE_ID,
  kind: "quiz" as const,
  title: "Locked Quiz",
  items: [MIN_ITEM],
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("assignment.create lock enforcement", () => {
  it("skips lock check when ctx.courseId is absent (backward compat)", async () => {
    const ctx = makeCtx(null, undefined);
    await expect(
      createAssignmentTool.handler({ ...baseArgs, conceptIds: [CONCEPT_A] }, ctx),
    ).resolves.toBeDefined();
  });

  it("skips lock check when snapshot is null", async () => {
    const ctx = makeCtx(null, COURSE_ID);
    await expect(
      createAssignmentTool.handler({ ...baseArgs, conceptIds: [CONCEPT_A] }, ctx),
    ).resolves.toBeDefined();
  });

  it("does NOT throw when conceptIds is empty", async () => {
    const snapshot = makeSnapshot([], new Map());
    const ctx = makeCtx(snapshot, COURSE_ID);
    await expect(
      createAssignmentTool.handler({ ...baseArgs, conceptIds: [] }, ctx),
    ).resolves.toBeDefined();
  });

  it("does NOT throw when all concept lessons are unlocked", async () => {
    const conceptsById = new Map([
      [CONCEPT_A, makeConceptRow(CONCEPT_A, LESSON_A)],
      [CONCEPT_B, makeConceptRow(CONCEPT_B, LESSON_B)],
    ]);
    const gates = [makeGateView(LESSON_A, "unlocked"), makeGateView(LESSON_B, "unlocked")];
    const snapshot = makeSnapshot(gates, conceptsById);
    const ctx = makeCtx(snapshot, COURSE_ID);

    await expect(
      createAssignmentTool.handler({ ...baseArgs, conceptIds: [CONCEPT_A, CONCEPT_B] }, ctx),
    ).resolves.toBeDefined();
  });

  it("throws when the first concept's lesson is locked", async () => {
    const conceptsById = new Map([[CONCEPT_A, makeConceptRow(CONCEPT_A, LESSON_A)]]);
    const gates = [makeGateView(LESSON_A, "locked")];
    const snapshot = makeSnapshot(gates, conceptsById);
    const ctx = makeCtx(snapshot, COURSE_ID);

    await expect(
      createAssignmentTool.handler({ ...baseArgs, conceptIds: [CONCEPT_A] }, ctx),
    ).rejects.toThrow(/cannot create assignment/);
    await expect(
      createAssignmentTool.handler({ ...baseArgs, conceptIds: [CONCEPT_A] }, ctx),
    ).rejects.toThrow(CONCEPT_A);
  });

  it("throws on the first locked concept even if another is unlocked", async () => {
    const conceptsById = new Map([
      [CONCEPT_A, makeConceptRow(CONCEPT_A, LESSON_A)], // unlocked
      [CONCEPT_B, makeConceptRow(CONCEPT_B, LESSON_B)], // locked
    ]);
    const gates = [makeGateView(LESSON_A, "unlocked"), makeGateView(LESSON_B, "locked")];
    const snapshot = makeSnapshot(gates, conceptsById);
    const ctx = makeCtx(snapshot, COURSE_ID);

    // conceptIds order: A then B — should throw on B
    await expect(
      createAssignmentTool.handler({ ...baseArgs, conceptIds: [CONCEPT_A, CONCEPT_B] }, ctx),
    ).rejects.toThrow(CONCEPT_B);
  });
});
