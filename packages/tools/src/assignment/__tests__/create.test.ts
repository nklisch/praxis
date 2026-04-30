import type { AssignmentService, ToolContext } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAssignmentTool } from "../create.js";

const STUDENT_ID = brandId<"StudentId">("student-1");
const SESSION_ID = brandId<"SessionId">("session-1");
const COURSE_ID = brandId<"CourseId">("course-1");
const ASSIGNMENT_ID = brandId<"AssignmentId">("assign-abc");

function makeAssignmentsService(overrides?: Partial<AssignmentService>): AssignmentService {
  return {
    create: vi.fn().mockResolvedValue({ assignmentId: ASSIGNMENT_ID }),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    recordResponse: vi.fn().mockResolvedValue(undefined),
    getResponses: vi.fn().mockResolvedValue([]),
    submit: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makeCtx(assignments: AssignmentService): ToolContext {
  return {
    studentId: STUDENT_ID,
    sessionId: SESSION_ID,
    services: {
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      memory: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      artifacts: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      bootstrap: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      courseState: null as any,
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
      assignments,
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

describe("createAssignmentTool", () => {
  let assignments: AssignmentService;
  let ctx: ToolContext;

  beforeEach(() => {
    assignments = makeAssignmentsService();
    ctx = makeCtx(assignments);
  });

  it("returns ok=true and assignmentId on success", async () => {
    const result = await createAssignmentTool.handler(
      {
        courseId: COURSE_ID,
        kind: "quiz",
        title: "Algebra Quiz",
        items: [
          {
            id: "item-1",
            kind: "multiple-choice",
            prompt: "What is 2+2?",
            options: ["3", "4"],
            correctOptionIndex: 1,
          },
        ],
        conceptIds: [],
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.assignmentId).toBe(ASSIGNMENT_ID);
    expect(result.itemCount).toBe(1);
  });

  it("calls assignments.create with tutor authoredBy", async () => {
    await createAssignmentTool.handler(
      {
        courseId: COURSE_ID,
        kind: "homework",
        title: "Homework 1",
        items: [
          {
            id: "item-1",
            kind: "short-answer",
            prompt: "Define slope.",
            acceptedAnswers: ["rise/run"],
          },
        ],
        conceptIds: ["concept-1"],
      },
      ctx,
    );
    expect(assignments.create).toHaveBeenCalledWith(
      expect.objectContaining({ authoredBy: "tutor" }),
    );
  });

  it("has tier 'model-derived' and effects ['artifact.mutate']", () => {
    expect(createAssignmentTool.tier).toBe("model-derived");
    expect(createAssignmentTool.effects).toContain("artifact.mutate");
  });

  it("input schema rejects math item without expectedSolution at the Zod boundary", () => {
    // Validate via the Zod input schema directly (the dispatcher applies this before handler).
    const result = createAssignmentTool.input.safeParse({
      courseId: COURSE_ID,
      kind: "quiz",
      title: "Bad quiz",
      items: [{ id: "bad", kind: "math", prompt: "Solve x" }], // missing expectedSolution
      conceptIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("input schema rejects items array that is empty", () => {
    const result = createAssignmentTool.input.safeParse({
      courseId: COURSE_ID,
      kind: "quiz",
      title: "Empty quiz",
      items: [],
      conceptIds: [],
    });
    expect(result.success).toBe(false);
  });
});
