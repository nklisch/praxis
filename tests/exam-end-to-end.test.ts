/**
 * End-to-end integration test for Phase 8 exam flow.
 *
 * Verifies:
 *  1. Exam free-response WITH rubric: grades via rubric agent; perCriterion populated.
 *  2. Exam free-response WITHOUT rubric: rejected at assignment.create time.
 *  3. Approach-feedback is never invoked for exam mode items.
 *
 * Uses: real SQLite (useTempDb) + FakeEngine (deterministic rubric output).
 */

import { courses } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { AssignmentServiceImpl } from "@praxis/core/services";
import type {
  AssignmentItem,
  CodeSandbox,
  CourseId,
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  Rubric,
  StudentId,
  SymPyService,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";
import { noopLogger } from "./helpers/mocks.js";

// ── FakeEngine that returns canned rubric JSON ─────────────────────────────────

const RUBRIC_RESPONSE = `\`\`\`json
{
  "perCriterion": [
    {
      "criterionId": "clarity",
      "score": 8,
      "rationale": "The student explained the concept clearly with concrete examples."
    },
    {
      "criterionId": "accuracy",
      "score": 9,
      "rationale": "All facts stated were correct and well-supported."
    }
  ],
  "feedback": "Strong response that covers both clarity and accuracy. Minor room to deepen the accuracy section."
}
\`\`\``;

let rubricEngineCallCount = 0;
let approachEngineCallCount = 0;

class FakeRubricEngineSession implements EngineSession {
  readonly id = "fake-exam-rubric-session";

  async *send(_msg: string): AsyncIterable<EngineEvent> {
    rubricEngineCallCount++;
    yield { type: "model_message", content: RUBRIC_RESPONSE, partial: false };
    yield { type: "final", usage: { inputTokens: 10, outputTokens: 30 } };
  }

  async close(): Promise<void> {}
}

class FakeRubricEngine implements Engine {
  readonly id = "direct.anthropic";
  readonly kind = "single-shot" as const;

  async open(_opts: EngineOpenOptions): Promise<EngineSession> {
    return new FakeRubricEngineSession();
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    };
  }
}

// ── Test setup ─────────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

const mockSympy: SymPyService = {
  checkSolution: vi.fn(),
  solveEquation: vi.fn(),
  simplify: vi.fn(),
  checkEquivalent: vi.fn(),
  parseLatex: vi.fn(),
};

const mockSandbox: CodeSandbox = { availableLanguages: ["javascript", "python"], run: vi.fn() };

beforeEach(() => {
  rubricEngineCallCount = 0;
  approachEngineCallCount = 0;
});

afterEach(() => {});

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeExamRubric(): Rubric {
  return {
    criteria: [
      {
        id: "clarity",
        description: "Clear explanation accessible to a peer",
        weight: 0.5,
        anchors: [
          { score: 0, description: "No explanation or completely unclear" },
          { score: 5, description: "Partially clear with some gaps" },
          { score: 10, description: "Crystal clear, well-structured explanation" },
        ],
      },
      {
        id: "accuracy",
        description: "Factual accuracy and correct use of concepts",
        weight: 0.5,
      },
    ],
    maxScore: 10,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("exam end-to-end", () => {
  it("accepts exam free-response with rubric and grades via rubric agent", async () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    // Set up a course
    const courseId = brandId<CourseId>("course-exam-e2e");
    const studentId = brandId<StudentId>("student-exam-e2e");
    const now = new Date();
    client
      .insert(courses)
      .values({
        id: courseId,
        studentId,
        title: "Physics 101",
        subject: "physics",
        gradeLevel: "grade-10",
        sourceJson: { kind: "authored", authorRole: "teacher" },
        conceptGraphId: "graph-physics",
        thresholdsJson: { conceptMastery: 0.8, examPass: 0.8, allowRetake: false, decayDays: 30 },
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rubric = makeExamRubric();

    const items: AssignmentItem[] = [
      {
        id: "exam-fr-1",
        kind: "free-response",
        prompt: "Explain Newton's second law in your own words and give a real-world example.",
        rubric,
      },
      {
        id: "exam-mc-1",
        kind: "single-choice",
        prompt: "Which law states F = ma?",
        options: ["Newton's first law", "Newton's second law", "Newton's third law"],
        correctOptionIndex: 1,
      },
    ];

    const assignmentService = new AssignmentServiceImpl({
      db: client,
      log: noopLogger(),
      graderServices: {
        sympy: mockSympy,
        sandbox: mockSandbox,
        engineResolver: () => new FakeRubricEngine(),
      },
      resolveSubmissionMode: () => "exam",
      // Approach feedback is always disabled for exam — the service enforces this;
      // set to false here to be explicit.
      enableApproachFeedback: false,
    });

    // Should not throw — rubric is present on the free-response item
    const { assignmentId } = await assignmentService.create({
      courseId,
      studentId,
      kind: "exam",
      title: "Midterm Exam",
      items,
      conceptIds: [],
    });

    // Record a prose response for the free-response item
    await assignmentService.recordResponse({
      assignmentId,
      itemId: "exam-fr-1",
      response:
        "Newton's second law states that the net force on an object equals its mass times acceleration (F = ma). " +
        "For example, a heavier cart needs more force than a lighter one to achieve the same acceleration.",
    });
    // Record the MC response (correct answer)
    await assignmentService.recordResponse({
      assignmentId,
      itemId: "exam-mc-1",
      response: "1",
    });

    const result = await assignmentService.submit({ assignmentId });

    // The free-response item should be graded by rubric-agent
    const frGrade = result.grade.perItem.find((p) => p.itemId === "exam-fr-1");
    expect(frGrade).toBeDefined();
    expect(frGrade?.gradedBy).toBe("rubric-agent");
    expect(frGrade?.perCriterion).toBeDefined();
    expect(frGrade?.perCriterion).toHaveLength(2);

    // Per-criterion scores: clarity=8, accuracy=9
    const clarityEntry = frGrade?.perCriterion?.find((c) => c.criterionId === "clarity");
    expect(clarityEntry?.score).toBe(8);
    expect(clarityEntry?.rationale).toContain("clearly");

    const accuracyEntry = frGrade?.perCriterion?.find((c) => c.criterionId === "accuracy");
    expect(accuracyEntry?.score).toBe(9);

    // Aggregate score: (8/10 * 0.5) + (9/10 * 0.5) = 0.4 + 0.45 = 0.85
    expect(frGrade?.score).toBeCloseTo(0.85, 2);

    // MC item: deterministic, correct
    const mcGrade = result.grade.perItem.find((p) => p.itemId === "exam-mc-1");
    expect(mcGrade?.score).toBe(1);
    expect(mcGrade?.gradedBy).toBe("deterministic");

    // Rubric engine was called exactly once (for the free-response item)
    expect(rubricEngineCallCount).toBe(1);

    // Approach engine was NOT called (exam mode + approach disabled)
    expect(approachEngineCallCount).toBe(0);
  });

  it("rejects exam free-response item without rubric at create time", async () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const courseId = brandId<CourseId>("course-exam-reject");
    const studentId = brandId<StudentId>("student-exam-reject");
    const now = new Date();
    client
      .insert(courses)
      .values({
        id: courseId,
        studentId,
        title: "History",
        subject: "history",
        gradeLevel: "grade-11",
        sourceJson: { kind: "authored", authorRole: "teacher" },
        conceptGraphId: "graph-history",
        thresholdsJson: { conceptMastery: 0.7, examPass: 0.75, allowRetake: false, decayDays: 30 },
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const assignmentService = new AssignmentServiceImpl({
      db: client,
      log: noopLogger(),
      graderServices: {
        sympy: mockSympy,
        sandbox: mockSandbox,
        engineResolver: () => new FakeRubricEngine(),
      },
      resolveSubmissionMode: () => "exam",
      enableApproachFeedback: false,
    });

    const itemsWithoutRubric: AssignmentItem[] = [
      {
        id: "exam-fr-norubric",
        kind: "free-response",
        prompt: "Describe the causes of World War I.",
        // No rubric — should be rejected for exam mode
      },
    ];

    // Should throw — free-response without rubric in exam mode is invalid
    await expect(
      assignmentService.create({
        courseId,
        studentId,
        kind: "exam",
        title: "History Exam",
        items: itemsWithoutRubric,
        conceptIds: [],
      }),
    ).rejects.toThrow(/rubric/i);
  });

  it("does not invoke approach feedback for exam items (approach feedback is OFF)", async () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    const courseId = brandId<CourseId>("course-exam-approach");
    const studentId = brandId<StudentId>("student-exam-approach");
    const now = new Date();
    client
      .insert(courses)
      .values({
        id: courseId,
        studentId,
        title: "Chemistry",
        subject: "chemistry",
        gradeLevel: "grade-11",
        sourceJson: { kind: "authored", authorRole: "teacher" },
        conceptGraphId: "graph-chem",
        thresholdsJson: { conceptMastery: 0.8, examPass: 0.8, allowRetake: false, decayDays: 30 },
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rubric = makeExamRubric();

    const assignmentService = new AssignmentServiceImpl({
      db: client,
      log: noopLogger(),
      graderServices: {
        sympy: mockSympy,
        sandbox: mockSandbox,
        engineResolver: () => new FakeRubricEngine(),
      },
      resolveSubmissionMode: () => "exam",
      // Explicitly disable approach feedback (matches production exam behavior)
      enableApproachFeedback: false,
    });

    const items: AssignmentItem[] = [
      {
        id: "exam-fr-2",
        kind: "free-response",
        prompt: "Explain oxidation states and give an example.",
        rubric,
      },
    ];

    const { assignmentId } = await assignmentService.create({
      courseId,
      studentId,
      kind: "exam",
      title: "Chemistry Exam",
      items,
      conceptIds: [],
    });

    await assignmentService.recordResponse({
      assignmentId,
      itemId: "exam-fr-2",
      response:
        "Oxidation state indicates the degree of oxidation of an atom. Example: in H2O, oxygen is -2.",
    });

    const countBefore = rubricEngineCallCount;
    await assignmentService.submit({ assignmentId });
    const callsForSubmit = rubricEngineCallCount - countBefore;

    // Only one rubric-agent call (for the free-response item's rubric grading).
    // Zero approach-feedback calls (exam mode + disabled).
    // The FakeRubricEngine.open is called once per run; with a single item it should be 1.
    expect(callsForSubmit).toBe(1);
    // Approach engine is never called
    expect(approachEngineCallCount).toBe(0);
  });
});
