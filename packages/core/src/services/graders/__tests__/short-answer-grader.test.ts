import { describe, expect, it } from "vitest";
import type { AssignmentItem, AssignmentResponse } from "../../../types/artifacts.js";
import { ShortAnswerGrader } from "../short-answer-grader.js";
import type { GraderContext } from "../types.js";

const NOOP_CTX = {} as GraderContext;

function makeItem(overrides: Partial<AssignmentItem> = {}): AssignmentItem {
  return {
    id: "item-1",
    kind: "short-answer",
    prompt: "What is the chemical symbol for water?",
    acceptedAnswers: ["H2O", "h2o"],
    acceptedAnswerMatch: "exact",
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

describe("ShortAnswerGrader", () => {
  const grader = new ShortAnswerGrader();

  it("returns score=1 for exact match", async () => {
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse("H2O"),
      ctx: NOOP_CTX,
    });
    expect(result.score).toBe(1);
    expect(result.tier).toBe("deterministic");
  });

  it("returns score=0 for non-matching answer (exact mode)", async () => {
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse("H2O2"),
      ctx: NOOP_CTX,
    });
    expect(result.score).toBe(0);
  });

  it("returns score=0 when response is empty", async () => {
    const result = await grader.grade({
      item: makeItem(),
      response: makeResponse("   "),
      ctx: NOOP_CTX,
    });
    expect(result.score).toBe(0);
    expect(result.feedback).toContain("No answer");
  });

  it("returns needs-human-review when no acceptedAnswers", async () => {
    const item = makeItem({ acceptedAnswers: [] });
    const result = await grader.grade({ item, response: makeResponse("H2O"), ctx: NOOP_CTX });
    expect(result.score).toBeNull();
    expect(result.tier).toBe("needs-human-review");
  });

  it("returns score=0 when response is null", async () => {
    const result = await grader.grade({ item: makeItem(), response: null, ctx: NOOP_CTX });
    expect(result.score).toBe(0);
  });

  describe("substring match", () => {
    it("returns score=1 when answer contains an accepted substring", async () => {
      const item = makeItem({ acceptedAnswerMatch: "substring", acceptedAnswers: ["H2O"] });
      const result = await grader.grade({
        item,
        response: makeResponse("The formula is H2O."),
        ctx: NOOP_CTX,
      });
      expect(result.score).toBe(1);
    });
  });

  describe("normalized match", () => {
    it("returns score=1 when normalized forms match", async () => {
      const item = makeItem({
        acceptedAnswerMatch: "normalized",
        acceptedAnswers: ["hydrogen dioxide"],
      });
      const result = await grader.grade({
        item,
        response: makeResponse("  Hydrogen Dioxide!  "),
        ctx: NOOP_CTX,
      });
      expect(result.score).toBe(1);
    });

    it("returns score=0 when normalized forms don't match", async () => {
      const item = makeItem({
        acceptedAnswerMatch: "normalized",
        acceptedAnswers: ["hydrogen dioxide"],
      });
      const result = await grader.grade({
        item,
        response: makeResponse("hydrogen peroxide"),
        ctx: NOOP_CTX,
      });
      expect(result.score).toBe(0);
    });
  });
});
