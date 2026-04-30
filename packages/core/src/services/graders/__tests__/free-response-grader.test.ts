/**
 * FreeResponseGrader unit tests.
 *
 * Tests the three grading paths:
 *   1. rubric agent (when item.rubric set)
 *   2. acceptedAnswers fallback (when no rubric)
 *   3. needs-human-review (neither)
 */

import { describe, expect, it, vi } from "vitest";
import type {
  AssignmentItem,
  AssignmentResponse,
  Engine,
  EngineEvent,
  Rubric,
} from "../../../types/index.js";
import { FreeResponseGrader } from "../free-response-grader.js";
import type { GraderContext, GraderServices } from "../types.js";

function makeFakeEngine(events: EngineEvent[]): Engine {
  const handle = {
    id: "fake-session",
    send: vi.fn().mockImplementation(async function* () {
      for (const ev of events) yield ev;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    id: "fake-engine",
    kind: "single-shot" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn().mockResolvedValue(handle),
  } as unknown as Engine;
}

function makeCtx(engine: Engine, mode: "quiz" | "homework" | "exam" = "quiz"): GraderContext {
  return {
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    services: {
      sympy: {} as GraderServices["sympy"],
      sandbox: {} as GraderServices["sandbox"],
      engineResolver: () => engine,
    },
    mode,
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

const RUBRIC: Rubric = {
  criteria: [{ id: "quality", description: "Overall quality", weight: 1.0 }],
  maxScore: 10,
};

function makeRubricJson(score: number): string {
  return `\`\`\`json\n${JSON.stringify({ perCriterion: [{ criterionId: "quality", score, rationale: "test" }] })}\n\`\`\``;
}

describe("FreeResponseGrader", () => {
  const grader = new FreeResponseGrader();

  describe("Path 1: rubric agent", () => {
    it("uses rubric agent when item.rubric is set", async () => {
      const engine = makeFakeEngine([{ type: "model_message", content: makeRubricJson(8) }]);
      const ctx = makeCtx(engine);
      const item: AssignmentItem = {
        id: "item-1",
        kind: "free-response",
        prompt: "Explain gravity.",
        rubric: RUBRIC,
      };
      const result = await grader.grade({
        item,
        response: makeResponse("Gravity is a force..."),
        ctx,
      });
      expect(result.tier).toBe("rubric-agent");
      expect(result.score).toBeCloseTo(0.8, 5);
    });
  });

  describe("Path 2: acceptedAnswers fallback", () => {
    it("returns score=1 for normalized match when no rubric", async () => {
      const engine = makeFakeEngine([]); // no LLM calls
      const ctx = makeCtx(engine);
      const item: AssignmentItem = {
        id: "item-1",
        kind: "free-response",
        prompt: "What is mitosis?",
        acceptedAnswers: ["cell division"],
        acceptedAnswerMatch: "normalized",
      };
      const result = await grader.grade({ item, response: makeResponse("Cell Division!"), ctx });
      expect(result.score).toBe(1);
      expect(result.tier).toBe("deterministic");
    });

    it("returns score=0 for non-matching answer", async () => {
      const engine = makeFakeEngine([]);
      const ctx = makeCtx(engine);
      const item: AssignmentItem = {
        id: "item-1",
        kind: "free-response",
        prompt: "What is mitosis?",
        acceptedAnswers: ["cell division"],
      };
      const result = await grader.grade({ item, response: makeResponse("protein synthesis"), ctx });
      expect(result.score).toBe(0);
      expect(result.tier).toBe("deterministic");
    });
  });

  describe("Path 3: needs-human-review", () => {
    it("returns needs-human-review when no rubric and no acceptedAnswers", async () => {
      const engine = makeFakeEngine([]);
      const ctx = makeCtx(engine);
      const item: AssignmentItem = { id: "item-1", kind: "free-response", prompt: "Explain X." };
      const result = await grader.grade({ item, response: makeResponse("some answer"), ctx });
      expect(result.score).toBeNull();
      expect(result.tier).toBe("needs-human-review");
    });
  });

  describe("Empty response", () => {
    it("returns score=0 for empty response without LLM call", async () => {
      const engine = makeFakeEngine([]);
      const ctx = makeCtx(engine);
      const item: AssignmentItem = {
        id: "item-1",
        kind: "free-response",
        prompt: "Explain X.",
        rubric: RUBRIC,
      };
      const result = await grader.grade({ item, response: makeResponse(""), ctx });
      expect(result.score).toBe(0);
      expect((engine.open as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });

    it("returns score=0 for null response", async () => {
      const engine = makeFakeEngine([]);
      const ctx = makeCtx(engine);
      const item: AssignmentItem = {
        id: "item-1",
        kind: "free-response",
        prompt: "Explain X.",
        rubric: RUBRIC,
      };
      const result = await grader.grade({ item, response: null, ctx });
      expect(result.score).toBe(0);
    });
  });
});
