/**
 * rubric-agent.ts unit tests.
 *
 * Uses the FakeEngine pattern from misconception-indexer.test.ts.
 * Tests: per-criterion scoring, deterministic weighted sum, error paths.
 */

import { describe, expect, it, vi } from "vitest";
import type { AssignmentItem, Engine, EngineEvent, Rubric } from "../../../types/index.js";
import { brandId } from "../../../types/index.js";
import { runRubricAgent } from "../rubric-agent.js";
import type { GraderContext, GraderServices } from "../types.js";

// ── FakeEngine helpers ─────────────────────────────────────────────────────────

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

function makeModelMessage(content: string): EngineEvent {
  return { type: "model_message", content };
}

function makeErrorEvent(message: string): EngineEvent {
  return {
    type: "error",
    error: { message, code: "engine_error", recoverable: false },
  };
}

function makeCtx(engine: Engine): GraderContext {
  return {
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(), // biome-ignore lint/suspicious/noExplicitAny: test mock
      child: vi.fn().mockReturnValue(undefined as any),
    },
    services: {
      sympy: {} as GraderServices["sympy"],
      sandbox: {} as GraderServices["sandbox"],
      engineResolver: () => engine,
    },
    mode: "quiz",
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────

const TWO_CRITERION_RUBRIC: Rubric = {
  criteria: [
    { id: "accuracy", description: "Factual accuracy", weight: 0.6 },
    { id: "clarity", description: "Clarity of explanation", weight: 0.4 },
  ],
  maxScore: 10,
};

const ITEM: AssignmentItem = {
  id: "item-fr-1",
  kind: "free-response",
  prompt: "Explain the water cycle.",
  rubric: TWO_CRITERION_RUBRIC,
};

function makeRubricJson(
  perCriterion: Array<{ criterionId: string; score: number; rationale: string }>,
  feedback?: string,
): string {
  const obj: Record<string, unknown> = { perCriterion };
  if (feedback) obj.feedback = feedback;
  return `\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runRubricAgent", () => {
  it("computes weighted sum correctly: score = Σ((score/10) × weight)", async () => {
    // accuracy: 8/10 × 0.6 = 0.48; clarity: 6/10 × 0.4 = 0.24; total = 0.72
    const json = makeRubricJson([
      { criterionId: "accuracy", score: 8, rationale: "Mostly accurate." },
      { criterionId: "clarity", score: 6, rationale: "Somewhat clear." },
    ]);
    const engine = makeFakeEngine([makeModelMessage(json)]);
    const ctx = makeCtx(engine);
    const result = await runRubricAgent({
      item: ITEM,
      rubric: TWO_CRITERION_RUBRIC,
      text: "Water evaporates and forms clouds.",
      source: "rubric",
      ctx,
    });

    expect(result.tier).toBe("rubric-agent");
    expect(result.score).toBeCloseTo(0.72, 5);
    expect(result.perCriterion).toHaveLength(2);
    expect(result.perCriterion?.[0]?.criterionId).toBe("accuracy");
    expect(result.perCriterion?.[0]?.score).toBe(8);
    expect(result.perCriterion?.[0]?.source).toBe("rubric");
    expect(result.perCriterion?.[1]?.criterionId).toBe("clarity");
    expect(result.perCriterion?.[1]?.score).toBe(6);
  });

  it("produces score=0 for empty text without LLM call", async () => {
    const engine = makeFakeEngine([]); // no events should be consumed
    const ctx = makeCtx(engine);
    const result = await runRubricAgent({
      item: ITEM,
      rubric: TWO_CRITERION_RUBRIC,
      text: "   ",
      source: "rubric",
      ctx,
    });
    expect(result.score).toBe(0);
    expect(result.tier).toBe("deterministic");
    // Engine should not have been opened
    expect((engine.open as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("returns needs-human-review on engine error", async () => {
    const engine = makeFakeEngine([makeErrorEvent("connection refused")]);
    const ctx = makeCtx(engine);
    const result = await runRubricAgent({
      item: ITEM,
      rubric: TWO_CRITERION_RUBRIC,
      text: "Some text.",
      source: "rubric",
      ctx,
    });
    expect(result.score).toBeNull();
    expect(result.tier).toBe("needs-human-review");
    expect(result.feedback).toContain("connection refused");
  });

  it("returns needs-human-review when LLM output has no JSON block", async () => {
    const engine = makeFakeEngine([makeModelMessage("Sorry, I cannot grade this.")]);
    const ctx = makeCtx(engine);
    const result = await runRubricAgent({
      item: ITEM,
      rubric: TWO_CRITERION_RUBRIC,
      text: "Some text.",
      source: "rubric",
      ctx,
    });
    expect(result.score).toBeNull();
    expect(result.tier).toBe("needs-human-review");
  });

  it("returns needs-human-review when schema validation fails", async () => {
    const invalid = `\`\`\`json\n{"perCriterion": [{"criterionId": "accuracy", "score": "eight", "rationale": "good"}]}\n\`\`\``;
    const engine = makeFakeEngine([makeModelMessage(invalid)]);
    const ctx = makeCtx(engine);
    const result = await runRubricAgent({
      item: ITEM,
      rubric: TWO_CRITERION_RUBRIC,
      text: "Some text.",
      source: "rubric",
      ctx,
    });
    expect(result.score).toBeNull();
    expect(result.tier).toBe("needs-human-review");
  });

  it("drops unknown criterionId with warn and still produces a score from valid entries", async () => {
    const warnFn = vi.fn();
    const json = makeRubricJson([
      { criterionId: "accuracy", score: 10, rationale: "Perfect accuracy." },
      { criterionId: "unknown-criterion", score: 5, rationale: "Unknown." },
    ]);
    const engine = makeFakeEngine([makeModelMessage(json)]);
    const ctx = {
      ...makeCtx(engine),
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: warnFn,
        error: vi.fn(),
        child: vi.fn().mockReturnValue(undefined as any),
      },
    };
    const result = await runRubricAgent({
      item: ITEM,
      rubric: TWO_CRITERION_RUBRIC,
      text: "Perfect.",
      source: "rubric",
      ctx,
    });

    // Only 'accuracy' (weight 0.6) was valid: 10/10 × 0.6 = 0.60
    // 'clarity' (weight 0.4) was not scored → contributes 0
    expect(result.score).toBeCloseTo(0.6, 5);
    expect(result.perCriterion).toHaveLength(1);
    expect(warnFn).toHaveBeenCalledWith(
      "rubric.unknown_criterion",
      expect.objectContaining({ criterionId: "unknown-criterion" }),
    );
  });

  it("uses agent's overall feedback when provided", async () => {
    const json = makeRubricJson(
      [
        { criterionId: "accuracy", score: 9, rationale: "Accurate." },
        { criterionId: "clarity", score: 8, rationale: "Clear." },
      ],
      "Excellent overall explanation.",
    );
    const engine = makeFakeEngine([makeModelMessage(json)]);
    const ctx = makeCtx(engine);
    const result = await runRubricAgent({
      item: ITEM,
      rubric: TWO_CRITERION_RUBRIC,
      text: "The water cycle...",
      source: "rubric",
      ctx,
    });
    expect(result.feedback).toBe("Excellent overall explanation.");
  });

  it("composes per-criterion feedback when agent omits overall feedback", async () => {
    const json = makeRubricJson([
      { criterionId: "accuracy", score: 5, rationale: "Partially accurate." },
      { criterionId: "clarity", score: 7, rationale: "Reasonably clear." },
    ]);
    const engine = makeFakeEngine([makeModelMessage(json)]);
    const ctx = makeCtx(engine);
    const result = await runRubricAgent({
      item: ITEM,
      rubric: TWO_CRITERION_RUBRIC,
      text: "Some text.",
      source: "rubric",
      ctx,
    });
    expect(result.feedback).toContain("5/10");
    expect(result.feedback).toContain("Partially accurate.");
    expect(result.feedback).toContain("7/10");
  });

  it("propagates source tag to perCriterion entries", async () => {
    const json = makeRubricJson([
      { criterionId: "accuracy", score: 8, rationale: "Good." },
      { criterionId: "clarity", score: 8, rationale: "Clear." },
    ]);
    const engine = makeFakeEngine([makeModelMessage(json)]);
    const ctx = makeCtx(engine);
    const result = await runRubricAgent({
      item: ITEM,
      rubric: TWO_CRITERION_RUBRIC,
      text: "Work shown.",
      source: "work-rubric",
      ctx,
    });
    for (const entry of result.perCriterion ?? []) {
      expect(entry.source).toBe("work-rubric");
    }
  });
});
