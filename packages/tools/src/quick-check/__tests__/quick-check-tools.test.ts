/**
 * Unit tests for the quick_check.* tool family.
 *
 * Each tool is tested for:
 *  - happy path (mock quickCheck.await resolves with a known answer)
 *  - abandoned path (mock resolves with { kind: "abandoned" })
 *  - output shape correctness
 *
 * Integration slice: dispatch through InProcessToolRegistry to verify Zod
 * validation and registry wiring.
 */
import type { QuickCheckAnswer, QuickCheckService, ToolDefinition } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { InProcessToolRegistry } from "../../registry.js";
import { quickCheckConfidenceTool } from "../confidence.js";
import { QUICK_CHECK_TOOLS } from "../index.js";
import { quickCheckMatchingTool } from "../matching.js";
import { quickCheckMultiSelectTool } from "../multi-select.js";
import { quickCheckShortAnswerTool } from "../short-answer.js";
import { quickCheckSingleChoiceTool } from "../single-choice.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeQuickCheckService(answer: QuickCheckAnswer): QuickCheckService {
  return {
    await: vi.fn().mockResolvedValue(answer),
    resolve: vi.fn(),
    cancel: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
}

const ABANDONED: QuickCheckAnswer = { kind: "abandoned" };

// ── quick_check.single_choice ────────────────────────────────────────────────

describe("quickCheckSingleChoiceTool", () => {
  let quickCheck: QuickCheckService;

  beforeEach(() => {
    quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 1 });
  });

  it("returns selectedIndex from the answer", async () => {
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckSingleChoiceTool.handler(
      { prompt: "Which is correct?", options: ["A", "B", "C"] },
      ctx,
    );
    expect(result.selectedIndex).toBe(1);
    expect(result.correct).toBeUndefined();
  });

  it("includes correct=true when correctIndex matches selectedIndex", async () => {
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckSingleChoiceTool.handler(
      { prompt: "Which is correct?", options: ["A", "B", "C"], correctIndex: 1 },
      ctx,
    );
    expect(result.correct).toBe(true);
  });

  it("includes correct=false when correctIndex does not match selectedIndex", async () => {
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckSingleChoiceTool.handler(
      { prompt: "Which is correct?", options: ["A", "B", "C"], correctIndex: 0 },
      ctx,
    );
    expect(result.correct).toBe(false);
  });

  it("returns selectedIndex: -1 on abandoned", async () => {
    quickCheck = makeQuickCheckService(ABANDONED);
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckSingleChoiceTool.handler(
      { prompt: "Which is correct?", options: ["A", "B"] },
      ctx,
    );
    expect(result.selectedIndex).toBe(-1);
    expect(result.correct).toBeUndefined();
  });
});

// ── quick_check.multi_select ─────────────────────────────────────────────────

describe("quickCheckMultiSelectTool", () => {
  it("returns selectedIndices from the answer", async () => {
    const quickCheck = makeQuickCheckService({
      kind: "multi-select",
      selectedIndices: [0, 2],
    });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckMultiSelectTool.handler(
      { prompt: "Select all that apply", options: ["A", "B", "C"] },
      ctx,
    );
    expect(result.selectedIndices).toEqual([0, 2]);
    expect(result.correct).toBeUndefined();
  });

  it("correct=true when selection exactly matches correctIndices (order-independent)", async () => {
    const quickCheck = makeQuickCheckService({
      kind: "multi-select",
      selectedIndices: [2, 0], // same set as [0, 2] but different order
    });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckMultiSelectTool.handler(
      { prompt: "Select all that apply", options: ["A", "B", "C"], correctIndices: [0, 2] },
      ctx,
    );
    expect(result.correct).toBe(true);
  });

  it("correct=false when selection does not match correctIndices", async () => {
    const quickCheck = makeQuickCheckService({
      kind: "multi-select",
      selectedIndices: [1],
    });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckMultiSelectTool.handler(
      { prompt: "Select all that apply", options: ["A", "B", "C"], correctIndices: [0, 2] },
      ctx,
    );
    expect(result.correct).toBe(false);
  });

  it("returns selectedIndices: [] on abandoned", async () => {
    const quickCheck = makeQuickCheckService(ABANDONED);
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckMultiSelectTool.handler(
      { prompt: "Select all that apply", options: ["A", "B"] },
      ctx,
    );
    expect(result.selectedIndices).toEqual([]);
  });
});

// ── quick_check.short_answer ─────────────────────────────────────────────────

describe("quickCheckShortAnswerTool", () => {
  it("returns the student's text", async () => {
    const quickCheck = makeQuickCheckService({ kind: "short-answer", text: "photosynthesis" });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckShortAnswerTool.handler({ prompt: "Explain the process" }, ctx);
    expect(result.text).toBe("photosynthesis");
  });

  it("returns text: '' on abandoned", async () => {
    const quickCheck = makeQuickCheckService(ABANDONED);
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckShortAnswerTool.handler({ prompt: "Explain" }, ctx);
    expect(result.text).toBe("");
  });

  it("calls quickCheck.await with a short-answer item", async () => {
    const quickCheck = makeQuickCheckService({ kind: "short-answer", text: "answer" });
    const ctx = makeToolContext({ services: { quickCheck } });
    await quickCheckShortAnswerTool.handler({ prompt: "Explain" }, ctx);
    const awaitArgs = (quickCheck.await as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(awaitArgs?.item.kind).toBe("short-answer");
  });
});

// ── quick_check.matching ─────────────────────────────────────────────────────

describe("quickCheckMatchingTool", () => {
  const LEFT = [
    { id: "l1", text: "Water" },
    { id: "l2", text: "Sun" },
  ];
  const RIGHT = [
    { id: "r1", text: "H2O" },
    { id: "r2", text: "Solar" },
  ];
  const CORRECT_PAIRS = [
    { leftId: "l1", rightId: "r1" },
    { leftId: "l2", rightId: "r2" },
  ];

  it("returns the student's pairs", async () => {
    const quickCheck = makeQuickCheckService({
      kind: "matching",
      pairs: CORRECT_PAIRS,
    });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckMatchingTool.handler(
      { prompt: "Match each", left: LEFT, right: RIGHT },
      ctx,
    );
    expect(result.pairs).toEqual(CORRECT_PAIRS);
    expect(result.correct).toBeUndefined();
  });

  it("correct=true when pairs match exactly (order-independent)", async () => {
    // Reversed order — should still be correct.
    const quickCheck = makeQuickCheckService({
      kind: "matching",
      pairs: [
        { leftId: "l2", rightId: "r2" },
        { leftId: "l1", rightId: "r1" },
      ],
    });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckMatchingTool.handler(
      { prompt: "Match", left: LEFT, right: RIGHT, correctPairs: CORRECT_PAIRS },
      ctx,
    );
    expect(result.correct).toBe(true);
  });

  it("correct=false when pairs differ", async () => {
    const quickCheck = makeQuickCheckService({
      kind: "matching",
      pairs: [
        { leftId: "l1", rightId: "r2" }, // swapped
        { leftId: "l2", rightId: "r1" },
      ],
    });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckMatchingTool.handler(
      { prompt: "Match", left: LEFT, right: RIGHT, correctPairs: CORRECT_PAIRS },
      ctx,
    );
    expect(result.correct).toBe(false);
  });

  it("returns pairs: [] on abandoned", async () => {
    const quickCheck = makeQuickCheckService(ABANDONED);
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckMatchingTool.handler(
      { prompt: "Match", left: LEFT, right: RIGHT },
      ctx,
    );
    expect(result.pairs).toEqual([]);
  });
});

// ── quick_check.confidence ────────────────────────────────────────────────────

describe("quickCheckConfidenceTool", () => {
  it("maps selectedIndex 0 → rating 1", async () => {
    const quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 0 });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckConfidenceTool.handler(
      { prompt: "How confident?", scale: "1-4" },
      ctx,
    );
    expect(result.rating).toBe(1);
  });

  it("maps selectedIndex 3 → rating 4 on 1-4 scale", async () => {
    const quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 3 });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckConfidenceTool.handler(
      { prompt: "How confident?", scale: "1-4" },
      ctx,
    );
    expect(result.rating).toBe(4);
  });

  it("maps selectedIndex 4 → rating 5 on 1-5 scale", async () => {
    const quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 4 });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckConfidenceTool.handler(
      { prompt: "How confident?", scale: "1-5" },
      ctx,
    );
    expect(result.rating).toBe(5);
  });

  it("returns rating: 0 on abandoned", async () => {
    const quickCheck = makeQuickCheckService(ABANDONED);
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await quickCheckConfidenceTool.handler(
      { prompt: "How confident?", scale: "1-4" },
      ctx,
    );
    expect(result.rating).toBe(0);
  });

  it("uses a single-choice item under the hood (v1 reuse pattern)", async () => {
    const quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 1 });
    const ctx = makeToolContext({ services: { quickCheck } });
    await quickCheckConfidenceTool.handler({ prompt: "Confidence?", scale: "1-4" }, ctx);
    const awaitArgs = (quickCheck.await as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(awaitArgs?.item.kind).toBe("single-choice");
    expect(awaitArgs?.item.options).toHaveLength(4);
  });
});

// ── Constraint validation ────────────────────────────────────────────────────

/**
 * Tight constraints used across constraint-validation tests.
 * promptMaxWords:3 means anything > 3 words fails.
 * choiceMaxWords:2 means any option text > 2 words fails.
 * choiceCount:2 means more than 2 options fails.
 */
const TIGHT_CONSTRAINTS = {
  promptMaxWords: 3,
  choiceMaxWords: 2,
  choiceCount: 2,
  multiSelectCap: 6,
} as const;

describe("quick_check constraint validation", () => {
  // Helper: make a quickCheck service that should never be called if validation fires.
  function makeNeverCalledService(): QuickCheckService {
    return {
      await: vi.fn().mockRejectedValue(new Error("should not be called")),
      resolve: vi.fn(),
      cancel: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
    };
  }

  // ── single_choice ────────────────────────────────────────────────────────────

  describe("single_choice", () => {
    it("throws when prompt exceeds promptMaxWords", async () => {
      const ctx = makeToolContext({
        services: { quickCheck: makeNeverCalledService() },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      await expect(
        quickCheckSingleChoiceTool.handler(
          { prompt: "This prompt has too many words for the cap", options: ["A", "B"] },
          ctx,
        ),
      ).rejects.toThrow(/prompt too long.*teach/i);
    });

    it("throws when options exceed choiceCount", async () => {
      const ctx = makeToolContext({
        services: { quickCheck: makeNeverCalledService() },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      await expect(
        quickCheckSingleChoiceTool.handler(
          { prompt: "Short", options: ["A", "B", "C"] }, // 3 options, cap is 2
          ctx,
        ),
      ).rejects.toThrow(/too many choices.*teach/i);
    });

    it("succeeds within cap (within-cap behavior unchanged)", async () => {
      const quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 0 });
      const ctx = makeToolContext({
        services: { quickCheck },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      const result = await quickCheckSingleChoiceTool.handler(
        { prompt: "Short", options: ["A", "B"] },
        ctx,
      );
      expect(result.selectedIndex).toBe(0);
    });
  });

  // ── multi_select ─────────────────────────────────────────────────────────────

  describe("multi_select", () => {
    it("throws when prompt exceeds promptMaxWords", async () => {
      const ctx = makeToolContext({
        services: { quickCheck: makeNeverCalledService() },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "quiz",
      });
      await expect(
        quickCheckMultiSelectTool.handler(
          { prompt: "This prompt is far too long for the word cap set here", options: ["A", "B"] },
          ctx,
        ),
      ).rejects.toThrow(/prompt too long.*quiz/i);
    });

    it("throws when options exceed choiceCount", async () => {
      const ctx = makeToolContext({
        services: { quickCheck: makeNeverCalledService() },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "quiz",
      });
      await expect(
        quickCheckMultiSelectTool.handler(
          { prompt: "Pick all", options: ["A", "B", "C"] }, // 3 options, cap is 2
          ctx,
        ),
      ).rejects.toThrow(/too many choices.*quiz/i);
    });

    it("succeeds within cap (within-cap behavior unchanged)", async () => {
      const quickCheck = makeQuickCheckService({ kind: "multi-select", selectedIndices: [0] });
      const ctx = makeToolContext({
        services: { quickCheck },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "quiz",
      });
      const result = await quickCheckMultiSelectTool.handler(
        { prompt: "Select", options: ["A", "B"] },
        ctx,
      );
      expect(result.selectedIndices).toEqual([0]);
    });
  });

  // ── short_answer ─────────────────────────────────────────────────────────────

  describe("short_answer", () => {
    it("throws when prompt exceeds promptMaxWords", async () => {
      const ctx = makeToolContext({
        services: { quickCheck: makeNeverCalledService() },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      await expect(
        quickCheckShortAnswerTool.handler(
          { prompt: "This prompt is way too long to pass the word cap" },
          ctx,
        ),
      ).rejects.toThrow(/prompt too long.*teach/i);
    });

    it("succeeds within cap (within-cap behavior unchanged)", async () => {
      const quickCheck = makeQuickCheckService({ kind: "short-answer", text: "ok" });
      const ctx = makeToolContext({
        services: { quickCheck },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      const result = await quickCheckShortAnswerTool.handler({ prompt: "Explain it" }, ctx);
      expect(result.text).toBe("ok");
    });
  });

  // ── matching ─────────────────────────────────────────────────────────────────

  describe("matching", () => {
    it("throws when prompt exceeds promptMaxWords", async () => {
      const ctx = makeToolContext({
        services: { quickCheck: makeNeverCalledService() },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      await expect(
        quickCheckMatchingTool.handler(
          {
            prompt: "This matching prompt is far too long for the cap",
            left: [
              { id: "l1", text: "A" },
              { id: "l2", text: "B" },
            ],
            right: [
              { id: "r1", text: "X" },
              { id: "r2", text: "Y" },
            ],
          },
          ctx,
        ),
      ).rejects.toThrow(/prompt too long.*teach/i);
    });

    it("throws when a column item text exceeds choiceMaxWords", async () => {
      const ctx = makeToolContext({
        services: { quickCheck: makeNeverCalledService() },
        // choiceMaxWords:2 — "A very long label" = 4 words
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      await expect(
        quickCheckMatchingTool.handler(
          {
            prompt: "Match each",
            left: [
              { id: "l1", text: "A very long label that violates the cap" },
              { id: "l2", text: "B" },
            ],
            right: [
              { id: "r1", text: "X" },
              { id: "r2", text: "Y" },
            ],
          },
          ctx,
        ),
      ).rejects.toThrow(/choice.*too long.*teach/i);
    });

    it("succeeds within cap (within-cap behavior unchanged)", async () => {
      const quickCheck = makeQuickCheckService({
        kind: "matching",
        pairs: [{ leftId: "l1", rightId: "r1" }],
      });
      const ctx = makeToolContext({
        services: { quickCheck },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      const result = await quickCheckMatchingTool.handler(
        {
          prompt: "Match each",
          left: [
            { id: "l1", text: "A" },
            { id: "l2", text: "B" },
          ],
          right: [
            { id: "r1", text: "X" },
            { id: "r2", text: "Y" },
          ],
        },
        ctx,
      );
      expect(result.pairs).toHaveLength(1);
    });
  });

  // ── confidence ────────────────────────────────────────────────────────────────

  describe("confidence", () => {
    it("throws when prompt exceeds promptMaxWords", async () => {
      const ctx = makeToolContext({
        services: { quickCheck: makeNeverCalledService() },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      await expect(
        quickCheckConfidenceTool.handler(
          { prompt: "How confident are you in your answer today?", scale: "1-4" },
          ctx,
        ),
      ).rejects.toThrow(/prompt too long.*teach/i);
    });

    it("succeeds within cap (within-cap behavior unchanged)", async () => {
      const quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 2 });
      const ctx = makeToolContext({
        services: { quickCheck },
        questionConstraints: TIGHT_CONSTRAINTS,
        modeId: "teach",
      });
      // Default prompt "How confident are you in your answer?" = 7 words — would fail
      // TIGHT_CONSTRAINTS; use a short custom prompt instead.
      const result = await quickCheckConfidenceTool.handler(
        { prompt: "Confidence level?", scale: "1-4" },
        ctx,
      );
      expect(result.rating).toBe(3);
    });
  });
});

// ── Integration: dispatch through InProcessToolRegistry ──────────────────────

function makeRegistry(quickCheck: QuickCheckService) {
  const ctx = makeToolContext({ services: { quickCheck } });
  const registry = new InProcessToolRegistry({
    tools: QUICK_CHECK_TOOLS as unknown as ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>,
    context: ctx,
    log: ctx.log,
  });
  return registry;
}

describe("QUICK_CHECK_TOOLS registry integration", () => {
  it("all five tools are registered and single_choice dispatches correctly", async () => {
    const quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 0 });
    const registry = makeRegistry(quickCheck);

    const sc = await registry.dispatch("quick_check.single_choice", {
      prompt: "Test?",
      options: ["A", "B"],
    });
    expect(sc.ok).toBe(true);

    // Zod validation: missing required field returns ok:false
    const bad = await registry.dispatch("quick_check.single_choice", { options: ["A", "B"] });
    expect(bad.ok).toBe(false);
  });

  it("multi_select dispatch returns selectedIndices", async () => {
    const quickCheck = makeQuickCheckService({
      kind: "multi-select",
      selectedIndices: [0],
    });
    const registry = makeRegistry(quickCheck);
    const result = await registry.dispatch("quick_check.multi_select", {
      prompt: "Select all",
      options: ["A", "B", "C"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { selectedIndices: number[] }).selectedIndices).toEqual([0]);
    }
  });

  it("short_answer dispatch returns text", async () => {
    const quickCheck = makeQuickCheckService({ kind: "short-answer", text: "hello" });
    const registry = makeRegistry(quickCheck);
    const result = await registry.dispatch("quick_check.short_answer", { prompt: "Explain" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { text: string }).text).toBe("hello");
    }
  });

  it("confidence dispatch returns numeric rating", async () => {
    const quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 2 });
    const registry = makeRegistry(quickCheck);
    // prompt and scale have defaults so empty object is valid
    const result = await registry.dispatch("quick_check.confidence", {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { rating: number }).rating).toBe(3);
    }
  });

  it("matching dispatch returns pairs", async () => {
    const quickCheck = makeQuickCheckService({
      kind: "matching",
      pairs: [{ leftId: "l1", rightId: "r1" }],
    });
    const registry = makeRegistry(quickCheck);
    const result = await registry.dispatch("quick_check.matching", {
      prompt: "Match",
      left: [
        { id: "l1", text: "A" },
        { id: "l2", text: "B" },
      ],
      right: [
        { id: "r1", text: "X" },
        { id: "r2", text: "Y" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { pairs: unknown[] }).pairs).toHaveLength(1);
    }
  });
});
