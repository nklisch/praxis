/**
 * AssignmentServiceImpl — workRubric blending tests.
 *
 * Dedicated test file covering workRubric blend logic:
 *   - blended score = primaryWeight × deterministicScore + (1 - primaryWeight) × workScore
 *   - Default primaryWeight = 0.5 for quiz/homework, 1.0 for exam
 *   - No blending when student submits no work
 *   - perCriterion entries tagged with source: "work-rubric"
 */

import { courses } from "@praxis/artifacts/schema";
import { conceptGraphs } from "@praxis/curriculum/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { AssignmentServiceImpl } from "../services/assignment-service.js";
import type { GraderServices } from "../services/graders/types.js";
import type { Engine, EngineEvent } from "../types/index.js";
import { brandId } from "../types/index.js";

const dbCtx = useTempDb();
const STUDENT_ID = brandId<"StudentId">("student-blend-test");
const COURSE_ID = brandId<"CourseId">("course-blend-test");

function seedCourse(db: ReturnType<typeof openDb>["db"]): void {
  db.insert(conceptGraphs)
    .values({
      id: "graph-blend",
      source: "extracted",
      name: "Blend Graph",
      version: "1",
      createdAt: new Date(),
    })
    .run();
  db.insert(courses)
    .values({
      id: COURSE_ID,
      studentId: STUDENT_ID,
      title: "Blend Course",
      subject: "math",
      gradeLevel: "9",
      sourceJson: { kind: "authored", authorRole: "teacher" },
      conceptGraphId: "graph-blend",
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
}

function makeFakeEngine(events: EngineEvent[]): Engine {
  const handle = {
    id: "fake-session",
    send: vi.fn().mockImplementation(async function* () {
      for (const ev of events) yield ev;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    id: "fake-engine",
    kind: "single-shot" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn().mockResolvedValue(handle),
  } as unknown as Engine;
}

function makeRubricJson(score: number): string {
  return `\`\`\`json\n${JSON.stringify({
    perCriterion: [{ criterionId: "steps", score, rationale: "OK work." }],
  })}\n\`\`\``;
}

function makeSvc(
  mode: "quiz" | "homework" | "exam",
  engineEvents: EngineEvent[],
  sympyCorrect = false,
): AssignmentServiceImpl {
  const { db } = openDb({ path: dbCtx.dbPath });
  try {
    seedCourse(db);
  } catch {
    /* already seeded */
  }
  const engine = makeFakeEngine(engineEvents);
  return new AssignmentServiceImpl({
    db,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    graderServices: {
      sympy: {
        checkSolution: vi.fn().mockResolvedValue({
          correct: sympyCorrect,
          proposedValue: sympyCorrect ? "3" : "99",
          expectedSolutions: ["3"],
        }),
      } as unknown as GraderServices["sympy"],
      sandbox: {} as GraderServices["sandbox"],
      engineResolver: () => engine,
    },
    resolveSubmissionMode: () => mode,
    enableApproachFeedback: false,
  });
}

const MATH_ITEM_WITH_WORK_RUBRIC = {
  id: "math-1",
  kind: "math" as const,
  prompt: "Solve x + 2 = 5",
  expectedSolution: { variable: "x", value: "3" },
  workRubric: {
    criteria: [{ id: "steps", description: "Valid steps", weight: 1.0 }],
    maxScore: 10,
  },
};

describe("workRubric blending", () => {
  it("blends deterministic + work score with default primaryWeight=0.5 in quiz mode", async () => {
    // deterministicScore = 0 (wrong answer x=99), workScore = 8/10 = 0.8
    // blended = 0.5 × 0 + 0.5 × 0.8 = 0.4
    const svc = makeSvc("quiz", [{ type: "model_message", content: makeRubricJson(8) }], false);
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "Math Quiz",
      items: [MATH_ITEM_WITH_WORK_RUBRIC],
      conceptIds: [],
    });

    await svc.recordResponse({
      assignmentId,
      itemId: "math-1",
      response: "99",
      work: "I tried x + 2 = 5, so x = 3... wait no x = 99",
    });

    const result = await svc.submit({ assignmentId });
    const item = result.grade.perItem.find((p) => p.itemId === "math-1");
    expect(item?.score).toBeCloseTo(0.4, 5); // 0.5 × 0 + 0.5 × 0.8
    expect(item?.gradedBy).toBe("rubric-agent");
    expect(item?.perCriterion?.[0]?.source).toBe("work-rubric");
  });

  it("uses primaryWeight=1.0 default in exam mode (deterministic only)", async () => {
    // deterministicScore = 1 (correct), workScore = 4/10 = 0.4
    // primaryWeight = 1.0 → blended = 1.0 × 1 + 0.0 × 0.4 = 1.0
    const svc = makeSvc("exam", [{ type: "model_message", content: makeRubricJson(4) }], true);
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "exam",
      title: "Math Exam",
      items: [MATH_ITEM_WITH_WORK_RUBRIC],
      conceptIds: [],
    });

    await svc.recordResponse({
      assignmentId,
      itemId: "math-1",
      response: "3",
      work: "poorly shown work",
    });

    const result = await svc.submit({ assignmentId });
    const item = result.grade.perItem.find((p) => p.itemId === "math-1");
    expect(item?.score).toBeCloseTo(1.0, 5); // deterministic=1, weight=1.0
  });

  it("respects explicit primaryWeight from item", async () => {
    // deterministicScore = 0, workScore = 10/10 = 1.0
    // primaryWeight = 0.3 → blended = 0.3 × 0 + 0.7 × 1.0 = 0.7
    const itemWithCustomWeight = { ...MATH_ITEM_WITH_WORK_RUBRIC, primaryWeight: 0.3 };
    const svc = makeSvc("quiz", [{ type: "model_message", content: makeRubricJson(10) }], false);
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "Custom Weight",
      items: [itemWithCustomWeight],
      conceptIds: [],
    });

    await svc.recordResponse({
      assignmentId,
      itemId: "math-1",
      response: "99",
      work: "excellent work shown",
    });

    const result = await svc.submit({ assignmentId });
    const item = result.grade.perItem.find((p) => p.itemId === "math-1");
    expect(item?.score).toBeCloseTo(0.7, 5);
  });

  it("skips blending when student submits no work text", async () => {
    // workRubric is set but response has no work → deterministic only
    const svc = makeSvc("quiz", [], false);
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "No Work",
      items: [MATH_ITEM_WITH_WORK_RUBRIC],
      conceptIds: [],
    });

    // Record answer without work
    await svc.recordResponse({ assignmentId, itemId: "math-1", response: "99" });

    const result = await svc.submit({ assignmentId });
    const item = result.grade.perItem.find((p) => p.itemId === "math-1");
    expect(item?.score).toBe(0); // deterministic only
    expect(item?.gradedBy).toBe("deterministic");
    expect(item?.perCriterion).toBeUndefined();
  });
});
