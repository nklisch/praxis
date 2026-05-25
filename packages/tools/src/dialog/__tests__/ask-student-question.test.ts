/**
 * Unit tests for the ask_student_question tool.
 *
 * Tests:
 *  - Zod schema validation (accept / reject)
 *  - Handler happy path
 *  - Handler abandoned path
 *  - Handler defensive: unexpected answer kind throws
 */
import type { QuickCheckAnswer, QuickCheckService, ToolDefinition } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { InProcessToolRegistry } from "../../registry.js";
import { askStudentQuestionTool } from "../ask-student-question.js";
import { DIALOG_TOOLS } from "../index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeQuickCheckService(answer: QuickCheckAnswer): QuickCheckService {
  return {
    await: vi.fn().mockResolvedValue(answer),
    resolve: vi.fn(),
    cancel: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
}

const minValidArgs = {
  questions: [
    {
      header: "Source",
      prompt: "Which source should we use?",
      multiSelect: false,
      options: [{ label: "Pack" }, { label: "Textbook" }],
    },
  ],
};

// ── Schema validation ─────────────────────────────────────────────────────────

describe("askStudentQuestionTool — schema validation", () => {
  it("accepts 1 question with 2 options", () => {
    const result = askStudentQuestionTool.input.safeParse(minValidArgs);
    expect(result.success).toBe(true);
  });

  it("accepts 4 questions with 8 options each and multiSelect: true", () => {
    const args = {
      questions: Array.from({ length: 4 }, (_, qi) => ({
        header: `Q${qi + 1}`,
        prompt: `Question ${qi + 1}?`,
        multiSelect: true,
        options: Array.from({ length: 8 }, (_, oi) => ({ label: `Option ${oi + 1}` })),
      })),
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(true);
  });

  it("accepts options with optional description", () => {
    const args = {
      questions: [
        {
          header: "Method",
          prompt: "Which auth method?",
          multiSelect: false,
          options: [
            { label: "OAuth", description: "Delegate to the provider" },
            { label: "Password", description: "Store credentials yourself" },
          ],
        },
      ],
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(true);
  });

  it("rejects empty questions array (min 1)", () => {
    const result = askStudentQuestionTool.input.safeParse({ questions: [] });
    expect(result.success).toBe(false);
  });

  it("rejects 5 questions (max 4)", () => {
    const args = {
      questions: Array.from({ length: 5 }, (_, i) => ({
        header: `Q${i}`,
        prompt: `Question?`,
        multiSelect: false,
        options: [{ label: "A" }, { label: "B" }],
      })),
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(false);
  });

  it("rejects 1 option per question (min 2)", () => {
    const args = {
      questions: [
        {
          header: "Src",
          prompt: "Which?",
          multiSelect: false,
          options: [{ label: "Only one" }],
        },
      ],
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(false);
  });

  it("rejects 9 options per question (max 8)", () => {
    const args = {
      questions: [
        {
          header: "Src",
          prompt: "Which?",
          multiSelect: false,
          options: Array.from({ length: 9 }, (_, i) => ({ label: `Option ${i + 1}` })),
        },
      ],
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(false);
  });

  it("rejects missing header", () => {
    const args = {
      questions: [
        {
          prompt: "Question?",
          multiSelect: false,
          options: [{ label: "A" }, { label: "B" }],
        },
      ],
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(false);
  });

  it("rejects missing prompt", () => {
    const args = {
      questions: [
        {
          header: "Src",
          multiSelect: false,
          options: [{ label: "A" }, { label: "B" }],
        },
      ],
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(false);
  });

  it("defaults multiSelect to false when omitted", () => {
    const args = {
      questions: [
        {
          header: "Src",
          prompt: "Which?",
          options: [{ label: "A" }, { label: "B" }],
        },
      ],
    };
    const result = askStudentQuestionTool.input.safeParse(args);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questions[0]?.multiSelect).toBe(false);
    }
  });

  // ── Reject-list refine for "tell me in chat" choice text ───────────────────
  // Per story-question-free-answer-and-cancel-path: the schema rejects choice
  // labels that suggest the "discuss in chat" path (already provided as a UI
  // control). This prevents the agent from adding a redundant/confusing choice.

  it("rejects 'tell me in chat' as a choice label", () => {
    const args = {
      questions: [
        {
          header: "Source",
          prompt: "Which source?",
          multiSelect: false,
          options: [{ label: "Pack" }, { label: "Tell me in chat" }],
        },
      ],
    };
    const result = askStudentQuestionTool.input.safeParse(args);
    expect(result.success).toBe(false);
  });

  it("rejects 'explain in chat' as a choice label", () => {
    const args = {
      questions: [
        {
          header: "Method",
          prompt: "How?",
          multiSelect: false,
          options: [{ label: "Option A" }, { label: "Explain in chat" }],
        },
      ],
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(false);
  });

  it("rejects 'ask in chat' as a choice label", () => {
    const args = {
      questions: [
        {
          header: "Q",
          prompt: "Pick?",
          multiSelect: false,
          options: [{ label: "A" }, { label: "Ask in chat instead" }],
        },
      ],
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(false);
  });

  it("rejects 'discuss in chat' as a choice label", () => {
    const args = {
      questions: [
        {
          header: "Q",
          prompt: "Pick?",
          multiSelect: false,
          options: [{ label: "A" }, { label: "Let's discuss in chat" }],
        },
      ],
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(false);
  });

  it("accepts normal choice labels that don't contain forbidden patterns", () => {
    const args = {
      questions: [
        {
          header: "Src",
          prompt: "Which source?",
          multiSelect: false,
          options: [
            { label: "Canonical pack" },
            { label: "Textbook chapter 3" },
            { label: "I'll figure it out" },
          ],
        },
      ],
    };
    expect(askStudentQuestionTool.input.safeParse(args).success).toBe(true);
  });
});

// ── Handler happy path ────────────────────────────────────────────────────────

describe("askStudentQuestionTool — handler", () => {
  let quickCheck: QuickCheckService;

  beforeEach(() => {
    quickCheck = makeQuickCheckService({
      kind: "structured-question",
      answers: [{ questionIndex: 0, selectedIndices: [1] }],
    });
  });

  it("returns answers array on success", async () => {
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await askStudentQuestionTool.handler(
      minValidArgs.questions
        ? { questions: minValidArgs.questions }
        : (minValidArgs as Parameters<typeof askStudentQuestionTool.handler>[0]),
      ctx,
    );
    expect(result.answers).toEqual([{ questionIndex: 0, selectedIndices: [1] }]);
    expect(result.abandoned).toBeUndefined();
  });

  it("passes the structured-question item to quickCheck.await with correct shape", async () => {
    const ctx = makeToolContext({ services: { quickCheck } });
    await askStudentQuestionTool.handler({ questions: minValidArgs.questions }, ctx);

    const awaitCall = (quickCheck.await as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(awaitCall?.item.kind).toBe("structured-question");
    expect(awaitCall?.item.questions).toHaveLength(1);
    expect(awaitCall?.item.questions[0]?.header).toBe("Source");
    expect(awaitCall?.item.questions[0]?.options).toHaveLength(2);
    expect(awaitCall?.sessionId).toBe("session-test");
    expect(typeof awaitCall?.callId).toBe("string");
  });

  it("returns { answers: [], abandoned: true } on abandoned", async () => {
    quickCheck = makeQuickCheckService({ kind: "abandoned" });
    const ctx = makeToolContext({ services: { quickCheck } });
    const result = await askStudentQuestionTool.handler({ questions: minValidArgs.questions }, ctx);
    expect(result.answers).toEqual([]);
    expect(result.abandoned).toBe(true);
  });

  it("returns { answers: [], abandoned: true } when quickCheck is undefined", async () => {
    const ctx = makeToolContext({ services: {} });
    const result = await askStudentQuestionTool.handler({ questions: minValidArgs.questions }, ctx);
    expect(result.answers).toEqual([]);
    expect(result.abandoned).toBe(true);
  });

  it("throws on unexpected answer kind", async () => {
    quickCheck = makeQuickCheckService({ kind: "single-choice", selectedIndex: 0 });
    const ctx = makeToolContext({ services: { quickCheck } });
    await expect(
      askStudentQuestionTool.handler({ questions: minValidArgs.questions }, ctx),
    ).rejects.toThrow("unexpected answer kind: single-choice");
  });
});

// ── Constraint validation ─────────────────────────────────────────────────────

describe("askStudentQuestionTool — constraint validation", () => {
  const tightConstraints = {
    promptMaxWords: 3,
    choiceMaxWords: 2,
    choiceCount: 2,
    multiSelectCap: 2,
  };

  it("fails with descriptive message when prompt exceeds cap", async () => {
    const ctx = makeToolContext({
      services: {},
      modeId: "teach",
      questionConstraints: tightConstraints,
    });
    await expect(
      askStudentQuestionTool.handler(
        {
          questions: [
            {
              header: "Source",
              prompt: "Which source should we use today?", // 6 words, cap is 3
              multiSelect: false,
              options: [{ label: "Pack" }, { label: "Book" }],
            },
          ],
        },
        ctx,
      ),
    ).rejects.toThrow(/teach mode/);
  });

  it("fails with descriptive message including choice index when choice text exceeds cap", async () => {
    const ctx = makeToolContext({
      services: {},
      modeId: "teach",
      questionConstraints: tightConstraints,
    });
    await expect(
      askStudentQuestionTool.handler(
        {
          questions: [
            {
              header: "Method",
              prompt: "Pick one", // 2 words, within cap
              multiSelect: false,
              options: [
                { label: "A" }, // 1 word, within cap
                { label: "Canonical textbook edition" }, // 3 words, cap is 2
              ],
            },
          ],
        },
        ctx,
      ),
    ).rejects.toThrow(/Choice 2.*teach mode/);
  });

  it("fails when choice count exceeds cap", async () => {
    const ctx = makeToolContext({
      services: {},
      modeId: "teach",
      questionConstraints: tightConstraints,
    });
    await expect(
      askStudentQuestionTool.handler(
        {
          questions: [
            {
              header: "Method",
              prompt: "Pick one", // 2 words, within cap
              multiSelect: false,
              options: [{ label: "A" }, { label: "B" }, { label: "C" }], // 3 options, cap is 2
            },
          ],
        },
        ctx,
      ),
    ).rejects.toThrow(/Too many choices.*teach mode/);
  });

  it("succeeds without calling quickCheck when within caps", async () => {
    const quickCheck = makeQuickCheckService({
      kind: "structured-question",
      answers: [{ questionIndex: 0, selectedIndices: [0] }],
    });
    const ctx = makeToolContext({
      services: { quickCheck },
      modeId: "teach",
      questionConstraints: tightConstraints,
    });
    const result = await askStudentQuestionTool.handler(
      {
        questions: [
          {
            header: "Src",
            prompt: "Pick one", // 2 words, within cap of 3
            multiSelect: false,
            options: [{ label: "A" }, { label: "B" }], // 2 options, at cap
          },
        ],
      },
      ctx,
    );
    expect(result.answers).toHaveLength(1);
    expect(quickCheck.await).toHaveBeenCalledOnce();
  });

  it("short-circuits on first invalid question without enqueuing any", async () => {
    // First question: valid. Second: prompt over cap. quickCheck must NOT be called.
    const quickCheck = makeQuickCheckService({
      kind: "structured-question",
      answers: [],
    });
    const ctx = makeToolContext({
      services: { quickCheck },
      modeId: "teach",
      questionConstraints: tightConstraints,
    });
    await expect(
      askStudentQuestionTool.handler(
        {
          questions: [
            {
              header: "Q1",
              prompt: "Pick one", // 2 words, ok
              multiSelect: false,
              options: [{ label: "A" }, { label: "B" }],
            },
            {
              header: "Q2",
              prompt: "Which source should we use today?", // 6 words, cap 3 — invalid
              multiSelect: false,
              options: [{ label: "A" }, { label: "B" }],
            },
          ],
        },
        ctx,
      ),
    ).rejects.toThrow(/teach mode/);
    expect(quickCheck.await).not.toHaveBeenCalled();
  });
});

// ── Registry integration ──────────────────────────────────────────────────────

describe("DIALOG_TOOLS registry integration", () => {
  it("ask_student_question is registered and dispatches correctly", async () => {
    const quickCheck = makeQuickCheckService({
      kind: "structured-question",
      answers: [{ questionIndex: 0, selectedIndices: [0] }],
    });
    const ctx = makeToolContext({ services: { quickCheck } });
    const registry = new InProcessToolRegistry({
      tools: DIALOG_TOOLS as unknown as ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>,
      context: ctx,
      log: ctx.log,
    });

    const result = await registry.dispatch("ask_student_question", {
      questions: [
        {
          header: "Src",
          prompt: "Which?",
          options: [{ label: "A" }, { label: "B" }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as { answers: unknown[] }).answers).toHaveLength(1);
    }
  });

  it("returns ok:false on schema validation failure (empty questions)", async () => {
    const quickCheck = makeQuickCheckService({ kind: "abandoned" });
    const ctx = makeToolContext({ services: { quickCheck } });
    const registry = new InProcessToolRegistry({
      tools: DIALOG_TOOLS as unknown as ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>,
      context: ctx,
      log: ctx.log,
    });

    const result = await registry.dispatch("ask_student_question", { questions: [] });
    expect(result.ok).toBe(false);
  });
});
