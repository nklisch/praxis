/**
 * enrichWithApproachFeedback unit tests.
 *
 * Tests all skip conditions and the happy path (feedback replacement).
 */

import { describe, expect, it, vi } from "vitest";
import type { AssignmentItem, Engine, EngineEvent } from "../../../types/index.js";
import { enrichWithApproachFeedback } from "../approach-feedback.js";
import type { GraderContext, GraderResult, GraderServices } from "../types.js";

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

function makeBaseResult(overrides: Partial<GraderResult> = {}): GraderResult {
  return { score: 0, feedback: "Incorrect.", tier: "deterministic", ...overrides };
}

function makeApproachJson(feedback: string): string {
  return `\`\`\`json\n${JSON.stringify({ enrichedFeedback: feedback })}\n\`\`\``;
}

const BASIC_ITEM: AssignmentItem = { id: "item-1", kind: "math", prompt: "Solve 2x=4." };

describe("enrichWithApproachFeedback", () => {
  it("enriches feedback for incorrect deterministic result in quiz mode", async () => {
    const engine = makeFakeEngine([
      {
        type: "model_message",
        content: makeApproachJson("You divided correctly but forgot to simplify."),
      },
    ]);
    const ctx = makeCtx(engine, "quiz");
    const result = await enrichWithApproachFeedback({
      item: BASIC_ITEM,
      response: "x = 3",
      base: makeBaseResult({ score: 0 }),
      ctx,
    });
    expect(result.feedback).toBe("You divided correctly but forgot to simplify.");
    expect(result.score).toBe(0); // score unchanged
    expect(result.tier).toBe("deterministic"); // tier unchanged
  });

  it("skips in exam mode", async () => {
    const engine = makeFakeEngine([
      { type: "model_message", content: makeApproachJson("enriched") },
    ]);
    const ctx = makeCtx(engine, "exam");
    const base = makeBaseResult();
    const result = await enrichWithApproachFeedback({
      item: BASIC_ITEM,
      response: "x = 3",
      base,
      ctx,
    });
    expect(result).toBe(base); // exact same reference
  });

  it("skips when score === 1", async () => {
    const engine = makeFakeEngine([]);
    const ctx = makeCtx(engine, "quiz");
    const base = makeBaseResult({ score: 1, feedback: "Correct." });
    const result = await enrichWithApproachFeedback({
      item: BASIC_ITEM,
      response: "x = 2",
      base,
      ctx,
    });
    expect(result).toBe(base);
    expect((engine.open as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("skips when tier is needs-human-review", async () => {
    const engine = makeFakeEngine([]);
    const ctx = makeCtx(engine, "quiz");
    const base = makeBaseResult({ score: null, tier: "needs-human-review" });
    const result = await enrichWithApproachFeedback({
      item: BASIC_ITEM,
      response: "x = 3",
      base,
      ctx,
    });
    expect(result).toBe(base);
  });

  it("skips when tier is rubric-agent", async () => {
    const engine = makeFakeEngine([]);
    const ctx = makeCtx(engine, "quiz");
    const base = makeBaseResult({ score: 0.5, tier: "rubric-agent" });
    const result = await enrichWithApproachFeedback({
      item: BASIC_ITEM,
      response: "something",
      base,
      ctx,
    });
    expect(result).toBe(base);
  });

  it("skips when item has a rubric", async () => {
    const engine = makeFakeEngine([]);
    const ctx = makeCtx(engine, "quiz");
    const item: AssignmentItem = {
      ...BASIC_ITEM,
      rubric: { criteria: [{ id: "q", description: "Quality", weight: 1.0 }], maxScore: 10 },
    };
    const base = makeBaseResult({ score: 0 });
    const result = await enrichWithApproachFeedback({ item, response: "answer", base, ctx });
    expect(result).toBe(base);
  });

  it("skips when item has a workRubric", async () => {
    const engine = makeFakeEngine([]);
    const ctx = makeCtx(engine, "quiz");
    const item: AssignmentItem = {
      ...BASIC_ITEM,
      workRubric: { criteria: [{ id: "w", description: "Work", weight: 1.0 }], maxScore: 10 },
    };
    const base = makeBaseResult({ score: 0 });
    const result = await enrichWithApproachFeedback({ item, response: "answer", base, ctx });
    expect(result).toBe(base);
  });

  it("skips when response is null", async () => {
    const engine = makeFakeEngine([]);
    const ctx = makeCtx(engine, "quiz");
    const base = makeBaseResult({ score: 0 });
    const result = await enrichWithApproachFeedback({
      item: BASIC_ITEM,
      response: null,
      base,
      ctx,
    });
    expect(result).toBe(base);
  });

  it("skips when response is empty", async () => {
    const engine = makeFakeEngine([]);
    const ctx = makeCtx(engine, "quiz");
    const base = makeBaseResult({ score: 0 });
    const result = await enrichWithApproachFeedback({
      item: BASIC_ITEM,
      response: "  ",
      base,
      ctx,
    });
    expect(result).toBe(base);
  });

  it("returns base on engine error", async () => {
    const engine = makeFakeEngine([
      {
        type: "error",
        error: { message: "network error", code: "engine_error", recoverable: false },
      },
    ]);
    const ctx = makeCtx(engine, "quiz");
    const base = makeBaseResult({ score: 0 });
    const result = await enrichWithApproachFeedback({
      item: BASIC_ITEM,
      response: "x = 3",
      base,
      ctx,
    });
    expect(result).toBe(base);
  });

  it("returns base when LLM output has no JSON block", async () => {
    const engine = makeFakeEngine([
      { type: "model_message", content: "I cannot provide feedback." },
    ]);
    const ctx = makeCtx(engine, "quiz");
    const base = makeBaseResult({ score: 0 });
    const result = await enrichWithApproachFeedback({
      item: BASIC_ITEM,
      response: "x = 3",
      base,
      ctx,
    });
    expect(result).toBe(base);
  });
});
