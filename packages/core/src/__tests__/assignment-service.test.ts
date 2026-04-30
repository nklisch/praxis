/**
 * AssignmentServiceImpl integration tests.
 *
 * Uses a real temp SQLite DB + FakeEngine for rubric-agent calls.
 * Tests: create, get, list, recordResponse, submit, blending, validation.
 */

import { courses } from "@praxis/artifacts/schema";
import { conceptGraphs } from "@praxis/curriculum/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { AssignmentServiceImpl, validateItems } from "../services/assignment-service.js";
import type { GraderServices } from "../services/graders/types.js";
import type { Engine, EngineEvent } from "../types/index.js";
import { brandId } from "../types/index.js";

const dbCtx = useTempDb();

const STUDENT_ID = brandId<"StudentId">("student-test");
const COURSE_ID = brandId<"CourseId">("course-test");

/** Seed a minimal course so FK constraints pass. */
function seedCourse(db: ReturnType<typeof openDb>["db"]): void {
  db.insert(conceptGraphs)
    .values({
      id: "graph-test",
      source: "extracted",
      name: "Test Graph",
      version: "1",
      createdAt: new Date(),
    })
    .run();
  db.insert(courses)
    .values({
      id: COURSE_ID,
      studentId: STUDENT_ID,
      title: "Test Course",
      subject: "math",
      gradeLevel: "9",
      sourceJson: { kind: "authored", authorRole: "teacher" },
      conceptGraphId: "graph-test",
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
}

// ── FakeEngine helpers ─────────────────────────────────────────────────────────

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

/** seedCourse is idempotent within a test (insert or ignore if already present). */
function makeMCService(noEngine = false): AssignmentServiceImpl {
  const { db } = openDb({ path: dbCtx.dbPath });
  // Seed course — ignore if already exists (some tests call makeMCService multiple times
  // within the same test, but useTempDb resets per-test so no cross-test pollution).
  try {
    seedCourse(db);
  } catch {
    /* already seeded in this test */
  }
  return new AssignmentServiceImpl({
    db,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    graderServices: {
      sympy: {
        checkSolution: vi
          .fn()
          .mockResolvedValue({ correct: true, proposedValue: "3", expectedSolutions: ["3"] }),
      } as unknown as GraderServices["sympy"],
      sandbox: {} as GraderServices["sandbox"],
      engineResolver: noEngine ? vi.fn() : () => makeFakeEngine([]),
    },
    resolveSubmissionMode: () => "quiz",
    enableApproachFeedback: false, // disable to avoid LLM calls in most tests
  });
}

// ── create tests ──────────────────────────────────────────────────────────────

describe("AssignmentServiceImpl.create", () => {
  it("creates and retrieves a multiple-choice assignment", async () => {
    const svc = makeMCService();
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "Basic Quiz",
      items: [
        {
          id: "q1",
          kind: "multiple-choice",
          prompt: "What is 2+2?",
          options: ["2", "3", "4", "5"],
          correctOptionIndex: 2,
        },
      ],
      conceptIds: [],
    });

    const assignment = await svc.get({ assignmentId });
    expect(assignment).not.toBeNull();
    expect(assignment?.title).toBe("Basic Quiz");
    expect(assignment?.kind).toBe("quiz");
    expect(assignment?.items).toHaveLength(1);
    expect(assignment?.submittedAt).toBeUndefined();
  });

  it("throws when items array is empty", async () => {
    const svc = makeMCService();
    await expect(
      svc.create({
        courseId: COURSE_ID,
        studentId: STUDENT_ID,
        kind: "quiz",
        title: "Empty",
        items: [],
        conceptIds: [],
      }),
    ).rejects.toThrow("at least one item");
  });

  it("throws for exam free-response item without rubric", async () => {
    const svc = makeMCService();
    await expect(
      svc.create({
        courseId: COURSE_ID,
        studentId: STUDENT_ID,
        kind: "exam",
        title: "Exam",
        items: [{ id: "fr1", kind: "free-response", prompt: "Explain X." }],
        conceptIds: [],
      }),
    ).rejects.toThrow("requires a rubric");
  });

  it("throws for rubric with weights not summing to 1.0", async () => {
    const svc = makeMCService();
    await expect(
      svc.create({
        courseId: COURSE_ID,
        studentId: STUDENT_ID,
        kind: "quiz",
        title: "Bad Rubric",
        items: [
          {
            id: "fr1",
            kind: "free-response",
            prompt: "Explain X.",
            rubric: {
              criteria: [
                { id: "c1", description: "Quality", weight: 0.3 },
                { id: "c2", description: "Clarity", weight: 0.3 },
              ],
              maxScore: 10,
            },
          },
        ],
        conceptIds: [],
      }),
    ).rejects.toThrow("weights must sum to 1.0");
  });

  it("propagates authoredBy to items", async () => {
    const svc = makeMCService();
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "Authored",
      items: [
        {
          id: "q1",
          kind: "multiple-choice",
          prompt: "Q?",
          options: ["A", "B"],
          correctOptionIndex: 0,
        },
      ],
      conceptIds: [],
      authoredBy: "tutor",
    });
    const assignment = await svc.get({ assignmentId });
    expect(assignment?.items[0]?.authoredBy).toBe("tutor");
  });
});

// ── list tests ────────────────────────────────────────────────────────────────

describe("AssignmentServiceImpl.list", () => {
  it("returns all assignments for a course", async () => {
    const svc = makeMCService();
    await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "Quiz 1",
      items: [
        {
          id: "q1",
          kind: "multiple-choice",
          prompt: "Q?",
          options: ["A", "B"],
          correctOptionIndex: 0,
        },
      ],
      conceptIds: [],
    });
    await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "homework",
      title: "HW 1",
      items: [{ id: "q1", kind: "short-answer", prompt: "Q?", acceptedAnswers: ["A"] }],
      conceptIds: [],
    });
    const all = await svc.list({ courseId: COURSE_ID });
    expect(all.length).toBeGreaterThanOrEqual(2);
    const filtered = await svc.list({ courseId: COURSE_ID, kind: "quiz" });
    expect(filtered.every((a) => a.kind === "quiz")).toBe(true);
  });
});

// ── recordResponse + getResponses tests ───────────────────────────────────────

describe("AssignmentServiceImpl.recordResponse", () => {
  it("upserts response idempotently", async () => {
    const svc = makeMCService();
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "Quiz",
      items: [
        {
          id: "item-1",
          kind: "multiple-choice",
          prompt: "Q?",
          options: ["A", "B"],
          correctOptionIndex: 0,
        },
      ],
      conceptIds: [],
    });

    await svc.recordResponse({ assignmentId, itemId: "item-1", response: "0" });
    await svc.recordResponse({ assignmentId, itemId: "item-1", response: "1" }); // update

    const responses = await svc.getResponses({ assignmentId });
    expect(responses).toHaveLength(1);
    expect(responses[0]?.response).toBe("1");
  });

  it("stores work text for items with workRubric", async () => {
    const svc = makeMCService();
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "homework",
      title: "HW",
      items: [
        {
          id: "math-1",
          kind: "math",
          prompt: "Solve x + 2 = 5",
          expectedSolution: { variable: "x", value: "3" },
          workRubric: {
            criteria: [{ id: "steps", description: "Showed valid steps", weight: 1.0 }],
            maxScore: 10,
          },
        },
      ],
      conceptIds: [],
    });

    await svc.recordResponse({
      assignmentId,
      itemId: "math-1",
      response: "3",
      work: "x + 2 = 5 → x = 3",
    });

    const responses = await svc.getResponses({ assignmentId });
    expect(responses[0]?.work).toBe("x + 2 = 5 → x = 3");
  });
});

// ── submit tests ──────────────────────────────────────────────────────────────

describe("AssignmentServiceImpl.submit", () => {
  it("grades a multiple-choice assignment and persists the grade", async () => {
    const svc = makeMCService();
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "MC Quiz",
      items: [
        {
          id: "q1",
          kind: "multiple-choice",
          prompt: "2+2=?",
          options: ["3", "4", "5"],
          correctOptionIndex: 1,
        },
        {
          id: "q2",
          kind: "multiple-choice",
          prompt: "3+3=?",
          options: ["5", "6", "7"],
          correctOptionIndex: 1,
        },
      ],
      conceptIds: [],
    });

    await svc.recordResponse({ assignmentId, itemId: "q1", response: "1" }); // correct
    await svc.recordResponse({ assignmentId, itemId: "q2", response: "0" }); // wrong

    const result = await svc.submit({ assignmentId });
    expect(result.grade.perItem).toHaveLength(2);
    expect(result.grade.perItem.find((p) => p.itemId === "q1")?.score).toBe(1);
    expect(result.grade.perItem.find((p) => p.itemId === "q2")?.score).toBe(0);
    expect(result.grade.total).toBe(0.5); // average of [1, 0]
    expect(result.grade.reviewedBy).toBe("deterministic");

    // Check DB persistence
    const reloaded = await svc.get({ assignmentId });
    expect(reloaded?.submittedAt).toBeDefined();
    expect(reloaded?.grade?.total).toBe(0.5);
  });

  it("throws on double submit", async () => {
    const svc = makeMCService();
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "Quiz",
      items: [
        {
          id: "q1",
          kind: "multiple-choice",
          prompt: "Q?",
          options: ["A", "B"],
          correctOptionIndex: 0,
        },
      ],
      conceptIds: [],
    });
    await svc.recordResponse({ assignmentId, itemId: "q1", response: "0" });
    await svc.submit({ assignmentId });
    await expect(svc.submit({ assignmentId })).rejects.toThrow("already submitted");
  });

  it("uses null score for unanswered items (score=0 for MC)", async () => {
    const svc = makeMCService();
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "Quiz",
      items: [
        {
          id: "q1",
          kind: "multiple-choice",
          prompt: "Q?",
          options: ["A", "B"],
          correctOptionIndex: 0,
        },
      ],
      conceptIds: [],
    });
    // No recordResponse — item is unanswered
    const result = await svc.submit({ assignmentId });
    expect(result.grade.perItem[0]?.score).toBe(0); // MC returns 0 for null response
    expect(result.grade.total).toBe(0);
  });

  it("accepts explicit responses override", async () => {
    const svc = makeMCService();
    const { assignmentId } = await svc.create({
      courseId: COURSE_ID,
      studentId: STUDENT_ID,
      kind: "quiz",
      title: "Quiz",
      items: [
        {
          id: "q1",
          kind: "multiple-choice",
          prompt: "Q?",
          options: ["A", "B"],
          correctOptionIndex: 0,
        },
      ],
      conceptIds: [],
    });

    const result = await svc.submit({
      assignmentId,
      responses: [
        {
          assignmentId,
          itemId: "q1",
          response: "0",
          recordedAt: Date.now() as import("../types/index.js").Timestamp,
        },
      ],
    });
    expect(result.grade.perItem[0]?.score).toBe(1);
  });
});
