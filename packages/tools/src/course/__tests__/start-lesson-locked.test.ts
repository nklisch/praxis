/**
 * Unit tests for start_lesson lock enforcement — Phase 9.
 *
 * Pure function tests: no DB. Stubs for ToolContext services.
 * Covers: no lock when no courseId, no lock when no gate guards the lesson,
 *         throws when lesson is locked, passes when gate is unlocked/overridden.
 */
import type {
  ArtifactsService,
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
import { startLessonTool } from "../start-lesson.js";

const STUDENT_ID = brandId<"StudentId">("student-start-locked");
const SESSION_ID = brandId<"SessionId">("session-start-locked");
const COURSE_ID = brandId<"CourseId">("course-start-locked");
const LESSON_ID = brandId<"LessonId">("lesson-start-locked");

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeGateView(
  lessonId: LessonId,
  stateKind: "locked" | "unlocked" | "overridden",
): GateView {
  const state =
    stateKind === "locked"
      ? { kind: "locked" as const, missingPrerequisites: [] }
      : stateKind === "unlocked"
        ? { kind: "unlocked" as const, unlockedAt: Date.now() as Timestamp, evidence: [] }
        : {
            kind: "overridden" as const,
            by: brandId<"ConfiguratorId">("admin"),
            reason: "test",
            at: Date.now() as Timestamp,
          };
  return {
    gate: {
      id: brandId<"GateId">("gate-start"),
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
    lockReason: stateKind === "locked" ? "concept c1 below threshold" : "",
    progress: stateKind === "locked" ? 0.3 : 1,
    isActive: stateKind === "locked",
  };
}

function makeSnapshot(gates: GateView[]): CourseStateSnapshot {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    course: {} as any,
    lessons: [
      {
        id: LESSON_ID,
        courseId: COURSE_ID,
        title: "Locked Lesson",
        conceptIds: [brandId<"ConceptId">("c1")],
        references: [],
        suggestedStrategy: brandId<"StrategyId">("worked-examples"),
        estimatedMinutes: 30,
      },
    ],
    currentLesson: null,
    conceptsByLesson: new Map(),
    conceptsById: new Map(),
    gates,
    activeGate: gates.find((g) => g.isActive) ?? null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
  };
}

function makeCtx(snapshot: CourseStateSnapshot | null, courseId?: CourseId): ToolContext {
  const courseState: CourseStateReader = {
    read: vi.fn().mockResolvedValue(snapshot),
  };
  const artifacts: Partial<ArtifactsService> = {
    markLessonStarted: vi.fn().mockResolvedValue(undefined),
    lessons: vi.fn().mockResolvedValue([]),
  };
  return {
    studentId: STUDENT_ID,
    sessionId: SESSION_ID,
    ...(courseId !== undefined && { courseId }),
    services: {
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      memory: null as any,
      artifacts: artifacts as ArtifactsService,
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
      lock: null as any,
      authoring: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder — not used in this test
      packs: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      assignments: null as any,
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("start_lesson lock enforcement", () => {
  it("skips lock check when ctx.courseId is absent (backward compat)", async () => {
    const ctx = makeCtx(null, undefined);
    // Should not throw — markLessonStarted is called directly.
    await expect(startLessonTool.handler({ lessonId: LESSON_ID }, ctx)).resolves.toBeDefined();
  });

  it("skips lock check when snapshot is null (course not found)", async () => {
    const ctx = makeCtx(null, COURSE_ID);
    await expect(startLessonTool.handler({ lessonId: LESSON_ID }, ctx)).resolves.toBeDefined();
  });

  it("throws when the lesson's gate is locked", async () => {
    const snapshot = makeSnapshot([makeGateView(LESSON_ID, "locked")]);
    const ctx = makeCtx(snapshot, COURSE_ID);

    await expect(startLessonTool.handler({ lessonId: LESSON_ID }, ctx)).rejects.toThrow(
      /cannot start_lesson/,
    );
    await expect(startLessonTool.handler({ lessonId: LESSON_ID }, ctx)).rejects.toThrow(LESSON_ID);
  });

  it("does NOT throw when the lesson's gate is unlocked", async () => {
    const snapshot = makeSnapshot([makeGateView(LESSON_ID, "unlocked")]);
    const ctx = makeCtx(snapshot, COURSE_ID);

    await expect(startLessonTool.handler({ lessonId: LESSON_ID }, ctx)).resolves.toBeDefined();
  });

  it("does NOT throw when the lesson's gate is overridden", async () => {
    const snapshot = makeSnapshot([makeGateView(LESSON_ID, "overridden")]);
    const ctx = makeCtx(snapshot, COURSE_ID);

    await expect(startLessonTool.handler({ lessonId: LESSON_ID }, ctx)).resolves.toBeDefined();
  });

  it("does NOT throw when no gate guards the lesson (open section)", async () => {
    // No gates in snapshot — lesson is freely accessible.
    const snapshot = makeSnapshot([]);
    const ctx = makeCtx(snapshot, COURSE_ID);

    await expect(startLessonTool.handler({ lessonId: LESSON_ID }, ctx)).resolves.toBeDefined();
  });
});
