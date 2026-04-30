import type { Assignment, AssignmentResponse, Grade, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { composeAssignmentContextFragment } from "../assignment-context.js";

const ASSIGNMENT_ID = brandId<"AssignmentId">("assign-1");
const COURSE_ID = brandId<"CourseId">("course-1");
const NOW = Date.now() as Timestamp;

function makeAssignment(overrides?: Partial<Assignment>): Assignment {
  return {
    id: ASSIGNMENT_ID,
    courseId: COURSE_ID,
    kind: "quiz",
    title: "Algebra Quiz 1",
    items: [
      {
        id: "item-1",
        kind: "multiple-choice",
        prompt: "What is 2+2?",
        options: ["3", "4"],
        correctOptionIndex: 1,
      },
      {
        id: "item-2",
        kind: "short-answer",
        prompt: "What is the slope formula?",
        acceptedAnswers: ["rise/run"],
      },
    ],
    conceptIds: [],
    assignedAt: NOW,
    ...overrides,
  };
}

function makeResponse(itemId: string): AssignmentResponse {
  return {
    assignmentId: ASSIGNMENT_ID,
    itemId,
    response: "some answer",
    recordedAt: NOW,
  };
}

describe("composeAssignmentContextFragment", () => {
  it("produces id 'context.assignment-state'", () => {
    const frag = composeAssignmentContextFragment({
      assignment: makeAssignment(),
      responses: [],
    });
    expect(frag.id).toBe("context.assignment-state");
    expect(frag.position).toBe("context");
    expect(frag.customizable).toBe(true);
  });

  it("shows title and kind in fragment text", () => {
    const frag = composeAssignmentContextFragment({
      assignment: makeAssignment(),
      responses: [],
    });
    expect(frag.template).toContain("Algebra Quiz 1");
    expect(frag.template).toContain("quiz");
    expect(frag.template).toContain("2 items");
  });

  it("shows IN PROGRESS with 0/2 answered when no responses", () => {
    const frag = composeAssignmentContextFragment({
      assignment: makeAssignment(),
      responses: [],
    });
    expect(frag.template).toContain("IN PROGRESS");
    expect(frag.template).toContain("0/2 items answered");
  });

  it("shows IN PROGRESS with 1/2 answered when one response", () => {
    const frag = composeAssignmentContextFragment({
      assignment: makeAssignment(),
      responses: [makeResponse("item-1")],
    });
    expect(frag.template).toContain("1/2 items answered");
  });

  it("shows SUBMITTED state with grade total when submitted", () => {
    const grade: Grade = {
      total: 0.75,
      perItem: [
        { itemId: "item-1", score: 1, feedback: "Correct.", gradedBy: "deterministic" },
        { itemId: "item-2", score: 0.5, feedback: "Partial.", gradedBy: "deterministic" },
      ],
      reviewedBy: "deterministic",
    };
    const frag = composeAssignmentContextFragment({
      assignment: makeAssignment({ submittedAt: NOW, grade }),
      responses: [makeResponse("item-1"), makeResponse("item-2")],
    });
    expect(frag.template).toContain("SUBMITTED");
    expect(frag.template).toContain("0.75");
    expect(frag.template).toContain("assignment.read_grade");
  });

  it("shows per-item scores in submitted state", () => {
    const grade: Grade = {
      total: 0.5,
      perItem: [
        { itemId: "item-1", score: 1, feedback: "Correct.", gradedBy: "deterministic" },
        {
          itemId: "item-2",
          score: null,
          feedback: "Needs review.",
          gradedBy: "needs-human-review",
        },
      ],
      reviewedBy: "needs-human-review",
    };
    const frag = composeAssignmentContextFragment({
      assignment: makeAssignment({ submittedAt: NOW, grade }),
      responses: [],
    });
    expect(frag.template).toContain("item-1=1.00");
    expect(frag.template).toContain("item-2=needs-review");
  });
});
