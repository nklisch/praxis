import type { Assignment, AssignmentService, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { showAssignmentTool } from "../show.js";

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

describe("showAssignmentTool", () => {
  it("returns no_assignment_in_session when no assignmentId in args or ctx", async () => {
    const svc = makeAssignmentsService(SAMPLE_ASSIGNMENT);
    const ctx = makeToolContext({
      studentId: "student-1",
      sessionId: "session-1",
      services: { assignments: svc },
    });
    const result = await showAssignmentTool.handler({}, ctx);
    expect(result.kind).toBe("no_assignment_in_session");
    expect(svc.get).not.toHaveBeenCalled();
  });

  it("uses ctx.assignmentId when args.assignmentId is omitted", async () => {
    const svc = makeAssignmentsService(SAMPLE_ASSIGNMENT);
    const ctx = makeToolContext({
      studentId: "student-1",
      sessionId: "session-1",
      assignmentId: ASSIGNMENT_ID,
      services: { assignments: svc },
    });
    const result = await showAssignmentTool.handler({}, ctx);
    expect(result.kind).toBe("ok");
    expect(svc.get).toHaveBeenCalledWith({ assignmentId: ASSIGNMENT_ID });
  });

  it("returns not_found when assignment doesn't exist", async () => {
    const svc = makeAssignmentsService(null);
    const ctx = makeToolContext({
      studentId: "student-1",
      sessionId: "session-1",
      assignmentId: ASSIGNMENT_ID,
      services: { assignments: svc },
    });
    const result = await showAssignmentTool.handler({}, ctx);
    expect(result.kind).toBe("not_found");
  });

  it("uses args.assignmentId when provided (explicit override)", async () => {
    const OTHER_ID = brandId<"AssignmentId">("other-assign");
    const svc = makeAssignmentsService(SAMPLE_ASSIGNMENT);
    const ctx = makeToolContext({
      studentId: "student-1",
      sessionId: "session-1",
      assignmentId: ASSIGNMENT_ID,
      services: { assignments: svc },
    });
    await showAssignmentTool.handler({ assignmentId: OTHER_ID }, ctx);
    expect(svc.get).toHaveBeenCalledWith({ assignmentId: OTHER_ID });
  });

  it("has tier 'grounded' and effects ['none']", () => {
    expect(showAssignmentTool.tier).toBe("grounded");
    expect(showAssignmentTool.effects).toContain("none");
  });
});
