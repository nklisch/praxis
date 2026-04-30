import type { Assignment, AssignmentService, Timestamp, ToolContext } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { showAssignmentTool } from "../show.js";

const STUDENT_ID = brandId<"StudentId">("student-1");
const SESSION_ID = brandId<"SessionId">("session-1");
const ASSIGNMENT_ID = brandId<"AssignmentId">("assign-abc");

const SAMPLE_ASSIGNMENT: Assignment = {
  id: ASSIGNMENT_ID,
  courseId: brandId<"CourseId">("course-1"),
  kind: "quiz",
  title: "Quiz 1",
  items: [],
  conceptIds: [],
  assignedAt: Date.now() as Timestamp,
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
      lock: null as any,
      authoring: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
      notes: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
      flashcards: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
      fsrsScheduler: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: Phase 10 placeholder — not used in this test
      packs: null as any,
      assignments,
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

describe("showAssignmentTool", () => {
  it("returns no_assignment_in_session when no assignmentId in args or ctx", async () => {
    const svc = makeAssignmentsService(SAMPLE_ASSIGNMENT);
    const ctx = makeCtx(svc); // no assignmentId in ctx
    const result = await showAssignmentTool.handler({}, ctx);
    expect(result.kind).toBe("no_assignment_in_session");
    expect(svc.get).not.toHaveBeenCalled();
  });

  it("uses ctx.assignmentId when args.assignmentId is omitted", async () => {
    const svc = makeAssignmentsService(SAMPLE_ASSIGNMENT);
    const ctx = makeCtx(svc, ASSIGNMENT_ID);
    const result = await showAssignmentTool.handler({}, ctx);
    expect(result.kind).toBe("ok");
    expect(svc.get).toHaveBeenCalledWith({ assignmentId: ASSIGNMENT_ID });
  });

  it("returns not_found when assignment doesn't exist", async () => {
    const svc = makeAssignmentsService(null);
    const ctx = makeCtx(svc, ASSIGNMENT_ID);
    const result = await showAssignmentTool.handler({}, ctx);
    expect(result.kind).toBe("not_found");
  });

  it("uses args.assignmentId when provided (explicit override)", async () => {
    const OTHER_ID = brandId<"AssignmentId">("other-assign");
    const svc = makeAssignmentsService(SAMPLE_ASSIGNMENT);
    const ctx = makeCtx(svc, ASSIGNMENT_ID);
    await showAssignmentTool.handler({ assignmentId: OTHER_ID }, ctx);
    expect(svc.get).toHaveBeenCalledWith({ assignmentId: OTHER_ID });
  });

  it("has tier 'grounded' and effects ['none']", () => {
    expect(showAssignmentTool.tier).toBe("grounded");
    expect(showAssignmentTool.effects).toContain("none");
  });
});
