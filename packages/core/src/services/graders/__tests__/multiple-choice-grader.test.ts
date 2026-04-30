import { describe, expect, it } from "vitest";
import type { AssignmentItem, AssignmentResponse } from "../../../types/artifacts.js";
import { MultipleChoiceGrader } from "../multiple-choice-grader.js";
import type { GraderContext } from "../types.js";

const NOOP_CTX = {} as GraderContext;

function makeItem(overrides: Partial<AssignmentItem> = {}): AssignmentItem {
  return {
    id: "item-1",
    kind: "multiple-choice",
    prompt: "Which planet is closest to the Sun?",
    options: ["Venus", "Mercury", "Mars", "Earth"],
    correctOptionIndex: 1,
    ...overrides,
  };
}

function makeResponse(response: string): AssignmentResponse {
  return {
    assignmentId: "assign-1" as AssignmentResponse["assignmentId"],
    itemId: "item-1",
    response,
    recordedAt: Date.now() as AssignmentResponse["recordedAt"],
  };
}

describe("MultipleChoiceGrader", () => {
  const grader = new MultipleChoiceGrader();

  it("returns score=1 for correct option index", async () => {
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse("1"),
      ctx: NOOP_CTX,
    });
    expect(result.score).toBe(1);
    expect(result.tier).toBe("deterministic");
    expect(result.feedback).toBe("Correct.");
  });

  it("returns score=0 for wrong option index", async () => {
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse("0"),
      ctx: NOOP_CTX,
    });
    expect(result.score).toBe(0);
    expect(result.tier).toBe("deterministic");
    expect(result.feedback).toContain("Mercury");
  });

  it("returns score=0 when no response", async () => {
    const result = await grader.grade({ item: makeItem(), response: null, ctx: NOOP_CTX });
    expect(result.score).toBe(0);
    expect(result.feedback).toContain("No answer");
  });

  it("returns needs-human-review when correctOptionIndex is missing", async () => {
    const item: AssignmentItem = {
      id: "item-1",
      kind: "multiple-choice",
      prompt: "Q?",
      options: ["A", "B"],
    };
    const result = await grader.grade({ item, response: makeResponse("1"), ctx: NOOP_CTX });
    expect(result.score).toBeNull();
    expect(result.tier).toBe("needs-human-review");
  });

  it("returns score=0 for non-numeric response", async () => {
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse("Mercury"),
      ctx: NOOP_CTX,
    });
    expect(result.score).toBe(0);
    expect(result.tier).toBe("deterministic");
  });
});
