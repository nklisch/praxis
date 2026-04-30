import type {
  Assignment,
  AssignmentService,
  Grade,
  Timestamp,
  ToolContext,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { readGradeTool } from "../read-grade.js";

const STUDENT_ID = brandId<"StudentId">("student-1");
const SESSION_ID = brandId<"SessionId">("session-1");
const ASSIGNMENT_ID = brandId<"AssignmentId">("assign-abc");
const NOW = Date.now() as Timestamp;

const GRADE: Grade = {
  total: 0.8,
  perItem: [{ itemId: "item-1", score: 0.8, feedback: "Good.", gradedBy: "deterministic" }],
  reviewedBy: "deterministic",
};

function makeAssignmentsService(assignment: Assignment | null): AssignmentService {
  return {
    create: vi.fn(),
    get: vi.fn().mockResolvedValue(assignment),
    list: vi.fn(),
    recordResponse: vi.fn(),
    getResponses: vi.fn(),
    submit: vi.fn(),
  };
}

function makeCtx(assignments: AssignmentService, assignmentId?: typeof ASSIGNMENT_ID): ToolContext {
  return {
    studentId: STUDENT_ID,
    sessionId: SESSION_ID,
    ...(assignmentId !== undefined && { assignmentId }),
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
      // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder — not used in this test
      packs: null as any,
      assignments,
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

function makeAssignment(submitted: boolean): Assignment {
  return {
    id: ASSIGNMENT_ID,
    courseId: brandId<"CourseId">("course-1"),
    kind: "quiz",
    title: "Quiz 1",
    items: [],
    conceptIds: [],
    assignedAt: NOW,
    ...(submitted && { submittedAt: NOW, grade: GRADE }),
  };
}

describe("readGradeTool", () => {
  it("returns not_found when no assignmentId in args or ctx", async () => {
    const svc = makeAssignmentsService(null);
    const ctx = makeCtx(svc);
    const result = await readGradeTool.handler({}, ctx);
    expect(result.kind).toBe("not_found");
  });

  it("returns not_found when assignment doesn't exist", async () => {
    const svc = makeAssignmentsService(null);
    const ctx = makeCtx(svc, ASSIGNMENT_ID);
    const result = await readGradeTool.handler({}, ctx);
    expect(result.kind).toBe("not_found");
  });

  it("returns not_yet_submitted when assignment exists but has no grade", async () => {
    const svc = makeAssignmentsService(makeAssignment(false));
    const ctx = makeCtx(svc, ASSIGNMENT_ID);
    const result = await readGradeTool.handler({}, ctx);
    expect(result.kind).toBe("not_yet_submitted");
  });

  it("returns graded with grade and submittedAt when submitted", async () => {
    const svc = makeAssignmentsService(makeAssignment(true));
    const ctx = makeCtx(svc, ASSIGNMENT_ID);
    const result = await readGradeTool.handler({}, ctx);
    expect(result.kind).toBe("graded");
    if (result.kind === "graded") {
      expect(result.grade).toEqual(GRADE);
      expect(typeof result.submittedAt).toBe("number");
    }
  });

  it("uses ctx.assignmentId when args.assignmentId is omitted", async () => {
    const svc = makeAssignmentsService(makeAssignment(false));
    const ctx = makeCtx(svc, ASSIGNMENT_ID);
    await readGradeTool.handler({}, ctx);
    expect(svc.get).toHaveBeenCalledWith({ assignmentId: ASSIGNMENT_ID });
  });

  it("has tier 'grounded' and effects ['none']", () => {
    expect(readGradeTool.tier).toBe("grounded");
    expect(readGradeTool.effects).toContain("none");
  });
});
