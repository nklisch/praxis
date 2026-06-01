import { describe, expect, it } from "vitest";
import type { AssignmentResponse, MatchingItem } from "../../../types/artifacts.js";
import { MatchingGrader } from "../matching-grader.js";
import type { GraderContext } from "../types.js";

const NOOP_CTX = {} as GraderContext;

function makeItem(overrides: Partial<MatchingItem> = {}): MatchingItem {
  return {
    id: "match-1",
    kind: "matching",
    prompt: "Match terms.",
    leftItems: [
      { id: "l1", text: "Cell" },
      { id: "l2", text: "Nucleus" },
    ],
    rightItems: [
      { id: "r1", text: "Basic unit" },
      { id: "r2", text: "Control center" },
    ],
    correctPairs: [
      { leftId: "l1", rightId: "r1" },
      { leftId: "l2", rightId: "r2" },
    ],
    ...overrides,
  };
}

function makeResponse(pairs: Array<{ leftId: string; rightId: string }>): AssignmentResponse {
  return {
    assignmentId: "assign-1" as AssignmentResponse["assignmentId"],
    itemId: "match-1",
    response: JSON.stringify(pairs),
    recordedAt: Date.now() as AssignmentResponse["recordedAt"],
  };
}

describe("MatchingGrader", () => {
  const grader = new MatchingGrader();

  it("scores duplicate correct pairs once", async () => {
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse([
        { leftId: "l1", rightId: "r1" },
        { leftId: "l1", rightId: "r1" },
        { leftId: "l2", rightId: "r2" },
      ]),
      ctx: NOOP_CTX,
    });

    expect(result.score).toBe(1);
  });

  it("never returns a score above 1", async () => {
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse([
        { leftId: "l1", rightId: "r1" },
        { leftId: "l1", rightId: "r1" },
        { leftId: "l1", rightId: "r1" },
      ]),
      ctx: NOOP_CTX,
    });

    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBe(0.5);
  });
});
