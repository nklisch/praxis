/**
 * Phase 18: Integration tests for course.current_concept with routing fields.
 *
 * Covers:
 *  - Tool reads procedural + affective from memory and threads them into the router.
 *  - New fields (suggestedStrategy, difficultyHint, suggestedModeTransition) are
 *    present in the "ok" response.
 *  - Fields are present in the "all_complete" response.
 *  - Frustration spike signals propagate: difficultyHint: "easier", strategy: "worked-examples".
 *  - Procedural strategy preference propagates to suggestedStrategy.
 *  - Output schema validates with the new fields.
 */
import type {
  AffectiveModel,
  ConceptId,
  CourseId,
  CourseStateReader,
  CourseStateSnapshot,
  GradeBand,
  LessonId,
  MemoryService,
  ProceduralModel,
  StudentId,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { currentConceptTool } from "../current-concept.js";

// ─── ID constants ─────────────────────────────────────────────────────────────

const STUDENT_ID = brandId<"StudentId">("student-routing") as StudentId;
const SESSION_ID = brandId<"SessionId">("session-routing");
const COURSE_ID = brandId<"CourseId">("course-routing") as CourseId;
const LESSON_ID = brandId<"LessonId">("lesson-routing-1") as LessonId;
const CONCEPT_ID_A = brandId<"ConceptId">("concept-routing-a") as ConceptId;

// ─── Fixture builders ─────────────────────────────────────────────────────────

function makeSnapshot(
  studied: boolean,
  currentLessonId: LessonId | null = LESSON_ID,
): CourseStateSnapshot {
  const lesson = {
    id: LESSON_ID,
    courseId: COURSE_ID,
    title: "Routing Test Lesson",
    conceptIds: [CONCEPT_ID_A],
    references: [],
    suggestedStrategy: brandId<"StrategyId">("explain-examples"),
    estimatedMinutes: 30,
  };
  const conceptRow = {
    conceptId: CONCEPT_ID_A,
    name: "Concept A",
    description: "Description A",
    studied,
    lessonId: LESSON_ID,
  };
  const conceptsByLesson = new Map([[LESSON_ID, [conceptRow]]]);
  const conceptsById = new Map([[CONCEPT_ID_A, conceptRow]]);

  return {
    course: {
      id: COURSE_ID,
      studentId: STUDENT_ID,
      title: "Routing Test Course",
      subject: brandId<"SubjectId">("math"),
      gradeLevel: "9-12" as GradeBand,
      source: { kind: "authored", authorRole: "self-directed" },
      lessons: [],
      gates: [],
      conceptGraphId: brandId<"ConceptGraphId">("graph-routing"),
      thresholds: { conceptMastery: 0.8, examPass: 0.7, allowRetake: true, decayDays: 30 },
      createdAt: Date.now() as Timestamp,
      updatedAt: Date.now() as Timestamp,
    },
    lessons: [lesson],
    currentLesson: currentLessonId !== null ? lesson : null,
    conceptsByLesson,
    conceptsById,
    gates: [],
    activeGate: null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
  };
}

function makeProceduralModel(
  strategies: Array<[string, { preference: number; evidenceCount: number }]> = [],
): ProceduralModel {
  return {
    studentId: STUDENT_ID,
    strategies: new Map(
      strategies.map(([id, pref]) => [
        brandId<"StrategyId">(id),
        {
          strategyId: brandId<"StrategyId">(id),
          preference: pref.preference,
          evidenceCount: pref.evidenceCount,
        },
      ]),
    ),
  };
}

function makeAffectiveModel(
  opts: {
    baseline?: { engagement: number; frustration: number; confidence: number };
    recent?: Array<{ engagement: number; frustration: number; confidence: number }>;
  } = {},
): AffectiveModel {
  return {
    studentId: STUDENT_ID,
    recent: (opts.recent ?? []).map((s) => ({
      ...s,
      ts: Date.now() as Timestamp,
      source: "model-inferred" as const,
    })),
    baseline: opts.baseline ?? { engagement: 0.6, frustration: 0.3, confidence: 0.5 },
  };
}

function makeCtx(
  snapshot: CourseStateSnapshot | null,
  procedural: ProceduralModel,
  affective: AffectiveModel,
) {
  const courseState: CourseStateReader = {
    read: vi.fn().mockResolvedValue(snapshot),
  };
  const studentModel = {
    studentId: STUDENT_ID,
    conceptMastery: new Map(),
    lastUpdated: Date.now() as Timestamp,
  };
  const memory = {
    studentModel: vi.fn().mockResolvedValue(studentModel),
    procedural: vi.fn().mockResolvedValue(procedural),
    affective: vi.fn().mockResolvedValue(affective),
  } as Partial<MemoryService>;
  return makeToolContext({
    studentId: STUDENT_ID,
    sessionId: SESSION_ID,
    courseId: COURSE_ID,
    services: { courseState, memory: memory as MemoryService },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("course.current_concept — Phase 18 routing integration", () => {
  describe("ok response includes new fields", () => {
    it("includes suggestedStrategy, difficultyHint, suggestedModeTransition in ok response", async () => {
      const snapshot = makeSnapshot(false); // unstudied → next-in-order
      const procedural = makeProceduralModel(); // no strategies
      const affective = makeAffectiveModel(); // neutral baseline, no recent
      const ctx = makeCtx(snapshot, procedural, affective);

      const result = await currentConceptTool.handler({}, ctx);

      expect(result.kind).toBe("ok");
      if (result.kind === "ok") {
        expect(typeof result.suggestedStrategy).toBe("string");
        expect(["easier", "normal", "harder"]).toContain(result.difficultyHint);
        expect(
          result.suggestedModeTransition === null ||
            result.suggestedModeTransition === "study-skills",
        ).toBe(true);
        // No affective data → normal defaults
        expect(result.difficultyHint).toBe("normal");
        expect(result.suggestedModeTransition).toBeNull();
      }
    });

    it("surfaces lesson-default strategy when no procedural preferences", async () => {
      const snapshot = makeSnapshot(false);
      const procedural = makeProceduralModel();
      const affective = makeAffectiveModel();
      const ctx = makeCtx(snapshot, procedural, affective);

      const result = await currentConceptTool.handler({}, ctx);

      expect(result.kind).toBe("ok");
      if (result.kind === "ok") {
        // Lesson's suggestedStrategy is "explain-examples"
        expect(result.suggestedStrategy).toBe("explain-examples");
      }
    });
  });

  describe("frustration spike propagates through the tool", () => {
    it("returns difficultyHint: easier and suggestedStrategy: worked-examples on frustration spike", async () => {
      const snapshot = makeSnapshot(false);
      const procedural = makeProceduralModel([
        ["socratic", { preference: 0.9, evidenceCount: 15 }],
      ]);
      const affective = makeAffectiveModel({
        baseline: { engagement: 0.6, frustration: 0.3, confidence: 0.5 },
        recent: [
          { engagement: 0.3, frustration: 0.6, confidence: 0.2 },
          { engagement: 0.3, frustration: 0.6, confidence: 0.2 },
          { engagement: 0.3, frustration: 0.6, confidence: 0.2 },
        ],
      });
      const ctx = makeCtx(snapshot, procedural, affective);

      const result = await currentConceptTool.handler({}, ctx);

      expect(result.kind).toBe("ok");
      if (result.kind === "ok") {
        expect(result.difficultyHint).toBe("easier");
        // Frustration overrides procedural preference
        expect(result.suggestedStrategy).toBe("worked-examples");
      }
    });
  });

  describe("procedural preference propagates through the tool", () => {
    it("surfaces procedural strategy in suggestedStrategy when evidenceCount >= 5", async () => {
      const snapshot = makeSnapshot(false);
      const procedural = makeProceduralModel([
        ["guided-inquiry", { preference: 0.7, evidenceCount: 8 }],
      ]);
      const affective = makeAffectiveModel(); // neutral, no frustration
      const ctx = makeCtx(snapshot, procedural, affective);

      const result = await currentConceptTool.handler({}, ctx);

      expect(result.kind).toBe("ok");
      if (result.kind === "ok") {
        expect(result.suggestedStrategy).toBe("guided-inquiry");
        expect(result.difficultyHint).toBe("normal");
      }
    });

    it("falls back to lesson default when evidenceCount < 5", async () => {
      const snapshot = makeSnapshot(false);
      const procedural = makeProceduralModel([["socratic", { preference: 0.9, evidenceCount: 3 }]]);
      const affective = makeAffectiveModel();
      const ctx = makeCtx(snapshot, procedural, affective);

      const result = await currentConceptTool.handler({}, ctx);

      expect(result.kind).toBe("ok");
      if (result.kind === "ok") {
        // 3 evidence points < 5 minimum → ignored
        expect(result.suggestedStrategy).toBe("explain-examples");
      }
    });
  });

  describe("all_complete response includes new fields", () => {
    it("all_complete response includes difficultyHint and suggestedModeTransition", async () => {
      // currentLesson === null → all_complete path
      const snapshot = makeSnapshot(false, null);
      const procedural = makeProceduralModel();
      const affective = makeAffectiveModel();
      const ctx = makeCtx(snapshot, procedural, affective);

      const result = await currentConceptTool.handler({}, ctx);

      expect(result.kind).toBe("all_complete");
      if (result.kind === "all_complete") {
        expect(["easier", "normal", "harder"]).toContain(result.difficultyHint);
        expect(
          result.suggestedModeTransition === null ||
            result.suggestedModeTransition === "study-skills",
        ).toBe(true);
        expect(result.difficultyHint).toBe("normal"); // no affective signal
        expect(result.suggestedModeTransition).toBeNull();
      }
    });

    it("all_complete response reflects frustration spike in difficultyHint", async () => {
      const snapshot = makeSnapshot(false, null);
      const procedural = makeProceduralModel();
      const affective = makeAffectiveModel({
        baseline: { engagement: 0.6, frustration: 0.3, confidence: 0.5 },
        recent: [
          { engagement: 0.3, frustration: 0.6, confidence: 0.2 },
          { engagement: 0.3, frustration: 0.6, confidence: 0.2 },
          { engagement: 0.3, frustration: 0.6, confidence: 0.2 },
        ],
      });
      const ctx = makeCtx(snapshot, procedural, affective);

      const result = await currentConceptTool.handler({}, ctx);

      expect(result.kind).toBe("all_complete");
      if (result.kind === "all_complete") {
        expect(result.difficultyHint).toBe("easier");
      }
    });
  });

  describe("output schema validation", () => {
    it("ok output shape validates against OutputSchema (new fields present)", async () => {
      const snapshot = makeSnapshot(false);
      const procedural = makeProceduralModel();
      const affective = makeAffectiveModel();
      const ctx = makeCtx(snapshot, procedural, affective);

      const result = await currentConceptTool.handler({}, ctx);

      // Zod parse to verify shape matches schema
      const parsed = currentConceptTool.output.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("all_complete output shape validates against OutputSchema", async () => {
      const snapshot = makeSnapshot(false, null);
      const procedural = makeProceduralModel();
      const affective = makeAffectiveModel();
      const ctx = makeCtx(snapshot, procedural, affective);

      const result = await currentConceptTool.handler({}, ctx);

      const parsed = currentConceptTool.output.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });
});
