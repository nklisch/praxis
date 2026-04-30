/**
 * End-to-end integration test for Phase 8 quiz flow.
 *
 * Verifies the full loop:
 *  1. Create an assignment with multiple items (including one math item with workRubric).
 *  2. Start a quiz session bound to the assignment.
 *  3. Record per-item responses (some correct, some wrong).
 *  4. Submit — verify Grade in DB with per-criterion breakdown for the workRubric item.
 *  5. Verify the next session's brief context includes "Status: SUBMITTED".
 *
 * Uses: real SQLite (useTempDb) + FakeEngine (deterministic events).
 * Approach-feedback disabled to avoid extra engine calls.
 */

import { assignments, courses } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { AssignmentServiceImpl, SessionServiceImpl } from "@praxis/core/services";
import type {
  AssignmentItem,
  CodeSandbox,
  ConceptId,
  CourseId,
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  HealthStatus,
  SymPyService,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { quizMode, teachMode } from "@praxis/curriculum/modes";
import { sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";

// isolated-vm@6.1.2 prebuilts don't cover Node 25+ ABI.
vi.mock("isolated-vm", async () => {
  const { isolatedVmStubFactory } = await import("./helpers/mocks.js");
  return isolatedVmStubFactory();
});

// ── FakeEngine — deterministic canned response ─────────────────────────────────

/**
 * A FakeEngine that returns a canned JSON block matching the RubricResultSchema.
 * Used for the workRubric grader call (runRubricAgent).
 */
class FakeRubricSession implements EngineSession {
  readonly id = "fake-rubric-session";
  /** Canned rubric response JSON. Caller sets this before each test. */
  cannedResponse: string;

  constructor(cannedResponse: string) {
    this.cannedResponse = cannedResponse;
  }

  async *send(_msg: string): AsyncIterable<EngineEvent> {
    yield { type: "model_message", content: this.cannedResponse, partial: false };
    yield { type: "final", usage: { inputTokens: 5, outputTokens: 20 } };
  }

  async close(): Promise<void> {}
}

class FakeRubricEngine implements Engine {
  readonly id = "direct.anthropic";
  readonly kind = "single-shot" as const;
  private cannedResponse: string;

  constructor(cannedResponse: string) {
    this.cannedResponse = cannedResponse;
  }

  async open(_opts: EngineOpenOptions): Promise<EngineSession> {
    return new FakeRubricSession(this.cannedResponse);
  }

  async health(): Promise<HealthStatus> {
    return {
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    };
  }
}

class FakeSession implements EngineSession {
  readonly id = "fake-session";
  // Track system prompts seen — for verifying the assignment context fragment
  public systemPromptSeen: string[] = [];

  constructor(systemPrompt?: string) {
    if (systemPrompt) this.systemPromptSeen.push(systemPrompt);
  }

  async *send(_msg: string): AsyncIterable<EngineEvent> {
    yield { type: "model_message", content: "Hello!", partial: false };
    yield { type: "final", usage: { inputTokens: 5, outputTokens: 5 } };
  }

  async close(): Promise<void> {}
}

const systemPromptsOpened: string[] = [];

class FakeEngine implements Engine {
  readonly id = "direct.anthropic";
  readonly kind = "single-shot" as const;

  async open(opts: EngineOpenOptions): Promise<EngineSession> {
    systemPromptsOpened.push(opts.systemPrompt);
    return new FakeSession(opts.systemPrompt);
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

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const mockSympy: SymPyService = {
  checkSolution: vi.fn().mockResolvedValue({
    correct: true,
    expectedSolutions: ["x = 2"],
    needsHumanReview: false,
    parseError: undefined,
  }),
  solveEquation: vi.fn(),
  simplify: vi.fn(),
  checkEquivalent: vi.fn(),
  parseLatex: vi.fn(),
};

const mockSandbox: CodeSandbox = { run: vi.fn() };

const mockVectorStore = {
  upsert: vi.fn(),
  upsertBatch: vi.fn(),
  search: vi.fn().mockResolvedValue([]),
  deleteByDocumentId: vi.fn(),
};
const mockFtsStore = {
  upsert: vi.fn(),
  upsertBatch: vi.fn(),
  search: vi.fn().mockResolvedValue([]),
  deleteByDocumentId: vi.fn(),
};
const mockEmbeddings = {
  embed: vi.fn().mockResolvedValue([]),
  embedQuery: vi.fn().mockResolvedValue([]),
  embedBatch: vi.fn().mockResolvedValue([]),
  dimension: 384,
  modelId: "test",
};
const mockDocuments = {
  titlesByIds: vi.fn().mockResolvedValue(new Map()),
  pageImage: vi.fn().mockResolvedValue(null),
};

beforeEach(() => {
  process.env.PRAXIS_ENGINE = "direct.anthropic";
  systemPromptsOpened.length = 0;
});

afterEach(() => {
  delete process.env.PRAXIS_ENGINE;
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("quiz end-to-end", () => {
  it("creates assignment, starts quiz session, submits responses, verifies grade + submitted brief", async () => {
    const { db: client } = openDb({ path: dbCtx.dbPath });

    // 1. Set up a minimal course row (need a valid courseId for FK constraint)
    const courseId = brandId<"CourseId">("course-quiz-e2e");
    const studentId = brandId<import("@praxis/core/types").StudentId>("student-quiz-e2e");
    const now = new Date();
    client
      .insert(courses)
      .values({
        id: courseId,
        studentId,
        title: "Algebra I",
        subject: "mathematics",
        gradeLevel: "grade-8",
        sourceJson: { kind: "authored", authorRole: "self-directed" },
        conceptGraphId: "graph-1",
        thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // 2. Canned rubric response: the FakeRubricEngine returns this JSON for workRubric grading.
    //    Simulates "showed partial work, got 7/10 on process"
    const cannedRubricResponse = `\`\`\`json
{
  "perCriterion": [
    {
      "criterionId": "process",
      "score": 7,
      "rationale": "Student showed most of the steps correctly but made a sign error in step 3."
    }
  ],
  "feedback": "Good process overall — just watch the sign flip in step 3."
}
\`\`\``;

    const rubricEngine = new FakeRubricEngine(cannedRubricResponse);

    // 3. Build the AssignmentService with FakeEngine for rubric calls
    const assignmentService = new AssignmentServiceImpl({
      db: client,
      log: noopLogger,
      graderServices: {
        sympy: mockSympy,
        sandbox: mockSandbox,
        engineResolver: () => rubricEngine,
      },
      resolveSubmissionMode: () => "quiz",
      enableApproachFeedback: false, // skip approach-feedback in fast tests
    });

    // 4. Create the assignment: 5 items including 1 math item with workRubric
    const items: AssignmentItem[] = [
      {
        id: "item-mc-1",
        kind: "multiple-choice",
        prompt: "Which is the commutative property?",
        options: ["a + b = b + a", "a + (b + c) = (a + b) + c", "a + 0 = a"],
        correctOptionIndex: 0,
      },
      {
        id: "item-sa-1",
        kind: "short-answer",
        prompt: "What is the additive inverse of 5?",
        acceptedAnswers: ["-5"],
        acceptedAnswerMatch: "normalized",
      },
      {
        id: "item-mc-2",
        kind: "multiple-choice",
        prompt: "What is the coefficient of x in 3x + 7?",
        options: ["7", "3", "x"],
        correctOptionIndex: 1,
      },
      {
        id: "item-sa-2",
        kind: "short-answer",
        prompt: "Simplify: 2x + 3x",
        acceptedAnswers: ["5x"],
        acceptedAnswerMatch: "normalized",
      },
      {
        id: "item-math-work",
        kind: "math",
        prompt: "Solve for x: 2x + 3 = 7",
        expectedSolution: { variable: "x", value: "2" },
        workRubric: {
          criteria: [
            {
              id: "process",
              description: "Shows correct algebraic steps",
              weight: 1.0,
            },
          ],
          maxScore: 10,
        },
        primaryWeight: 0.5,
      },
    ];

    const { assignmentId } = await assignmentService.create({
      courseId,
      studentId,
      kind: "quiz",
      title: "Algebra Basics Quiz",
      items,
      conceptIds: [brandId<ConceptId>("concept-algebra-basics")],
      authoredBy: "tutor",
    });

    // 5. Verify the assignment row was created
    const assignmentRow = client
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .get();
    expect(assignmentRow).toBeDefined();
    expect(assignmentRow?.kind).toBe("quiz");
    expect(assignmentRow?.title).toBe("Algebra Basics Quiz");
    const storedItems = assignmentRow?.itemsJson as AssignmentItem[];
    expect(storedItems).toHaveLength(5);
    const mathItem = storedItems.find((i) => i.id === "item-math-work");
    expect(mathItem?.workRubric).toBeDefined();

    // 6. Start a quiz session bound to the assignment
    const svc = new SessionServiceImpl({
      db: client,
      log: noopLogger,
      modes: new Map([
        [teachMode.id, teachMode],
        [quizMode.id, quizMode],
      ]),
      toolDefinitions: [],
      toolServices: {
        sympy: mockSympy,
        sandbox: mockSandbox,
        vectorStore: mockVectorStore,
        ftsStore: mockFtsStore,
        embeddings: mockEmbeddings,
        documents: mockDocuments,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        artifacts: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        bootstrap: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        courseState: null as any,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        memory: null as any,
        assignments: assignmentService,
      },
      engineFactory: () => new FakeEngine(),
    });

    const handle = await svc.start({
      modeId: "quiz",
      courseId,
      assignmentId,
    });

    // 7. Assert session row has assignment_id set
    const sessionRow = client
      .select()
      .from(sessions)
      .where(eq(sessions.id, handle.sessionId))
      .get();
    expect(sessionRow?.assignmentId).toBe(assignmentId);
    expect(handle.assignmentId).toBe(assignmentId);

    // 8. Record responses for each item
    // 4 correct: MC correct, SA correct, MC correct, SA correct
    // 1 with shown work (math item — correct answer x=2, with work text)
    await assignmentService.recordResponse({
      assignmentId,
      itemId: "item-mc-1",
      response: "0", // index 0 = "a + b = b + a" — CORRECT
    });
    await assignmentService.recordResponse({
      assignmentId,
      itemId: "item-sa-1",
      response: "-5", // CORRECT
    });
    await assignmentService.recordResponse({
      assignmentId,
      itemId: "item-mc-2",
      response: "1", // index 1 = "3" — CORRECT
    });
    await assignmentService.recordResponse({
      assignmentId,
      itemId: "item-sa-2",
      response: "5x", // CORRECT
    });
    await assignmentService.recordResponse({
      assignmentId,
      itemId: "item-math-work",
      response: "x = 2", // final answer — sympy will check this as correct
      work: "2x + 3 = 7\n2x = 4\nx = 2", // shown work — rubric agent will grade this
    });

    // 9. Submit the assignment
    const result = await assignmentService.submit({ assignmentId });

    // 10. Assert Grade structure
    expect(result.grade).toBeDefined();
    expect(result.grade.perItem).toHaveLength(5);

    // All 4 deterministic items should be score = 1 (correct)
    const mcItem1 = result.grade.perItem.find((p) => p.itemId === "item-mc-1");
    expect(mcItem1?.score).toBe(1);
    expect(mcItem1?.gradedBy).toBe("deterministic");

    const saItem1 = result.grade.perItem.find((p) => p.itemId === "item-sa-1");
    expect(saItem1?.score).toBe(1);

    const saItem2 = result.grade.perItem.find((p) => p.itemId === "item-sa-2");
    expect(saItem2?.score).toBe(1);

    // Math item with workRubric: blended score
    // deterministicScore = 1 (sympy returns correct), workScore = 7/10 = 0.7
    // blended = 0.5 * 1 + 0.5 * 0.7 = 0.85
    const mathItemGrade = result.grade.perItem.find((p) => p.itemId === "item-math-work");
    expect(mathItemGrade).toBeDefined();
    expect(mathItemGrade?.gradedBy).toBe("rubric-agent");
    expect(mathItemGrade?.score).toBeCloseTo(0.85, 2);

    // perCriterion should be populated for the work rubric grading
    expect(mathItemGrade?.perCriterion).toBeDefined();
    expect(mathItemGrade?.perCriterion).toHaveLength(1);
    expect(mathItemGrade?.perCriterion?.[0]?.criterionId).toBe("process");
    expect(mathItemGrade?.perCriterion?.[0]?.score).toBe(7);
    expect(mathItemGrade?.perCriterion?.[0]?.source).toBe("work-rubric");

    // Grade total: 4 items score=1, 1 item score=0.85 → average = (4*1 + 0.85) / 5 = 0.97
    expect(result.grade.total).toBeCloseTo(0.97, 2);

    // 11. Verify the assignments row is updated with submittedAt + gradeJson
    const updatedRow = client
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .get();
    expect(updatedRow?.submittedAt).not.toBeNull();
    expect(updatedRow?.gradeJson).not.toBeNull();

    // 12. Open a second session on the same course — verify brief includes "Status: SUBMITTED"
    //     The assignment-context fragment is injected when assignmentId is set on the session.
    //     Since we're starting with the same assignmentId, the brief should reflect submitted state.
    const handle2 = await svc.start({
      modeId: "quiz",
      courseId,
      assignmentId,
    });

    // Drain the session to ensure the system prompt was built
    for await (const _ of svc.send(handle2.sessionId, "how did I do?")) {
      /* drain */
    }
    await svc.end(handle2.sessionId);

    // The system prompt opened for the second session should include "Status: SUBMITTED"
    const lastPrompt = systemPromptsOpened[systemPromptsOpened.length - 1];
    expect(lastPrompt).toBeDefined();
    expect(lastPrompt).toContain("Status: SUBMITTED");
    expect(lastPrompt).toContain("Algebra Basics Quiz");

    await svc.end(handle.sessionId);
  });
});
