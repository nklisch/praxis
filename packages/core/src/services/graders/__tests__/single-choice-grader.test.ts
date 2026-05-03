import { describe, expect, it } from "vitest";
import type { AssignmentResponse, SingleChoiceItem } from "../../../types/artifacts.js";
import { SingleChoiceGrader } from "../single-choice-grader.js";
import type { GraderContext } from "../types.js";

const NOOP_CTX = {} as GraderContext;

function makeItem(overrides: Partial<SingleChoiceItem> = {}): SingleChoiceItem {
  return {
    id: "item-1",
    kind: "single-choice",
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

describe("SingleChoiceGrader", () => {
  const grader = new SingleChoiceGrader();

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
