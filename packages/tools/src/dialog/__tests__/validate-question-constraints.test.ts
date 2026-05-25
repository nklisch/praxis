/**
 * Unit tests for `validateQuestionConstraints`.
 *
 * Table-driven to cover every cap + branch combination, plus edge cases for
 * the internal word-count helper (exercised via the prompt validation path).
 */
import { describe, expect, it } from "vitest";
import { validateQuestionConstraints } from "../validate-question-constraints.js";

// ── Fixture constraints ───────────────────────────────────────────────────────

const teachCaps = {
  promptMaxWords: 30,
  choiceMaxWords: 10,
  choiceCount: 4,
  multiSelectCap: 4,
} as const;

const tightCaps = {
  promptMaxWords: 5,
  choiceMaxWords: 2,
  choiceCount: 2,
  multiSelectCap: 1,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a prompt string of exactly `n` space-separated words. */
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i + 1}`).join(" ");
}

// ── Success path ──────────────────────────────────────────────────────────────

describe("validateQuestionConstraints — success", () => {
  it("returns ok:true when prompt, options, and choice count are all within caps", () => {
    const result = validateQuestionConstraints(
      { prompt: "What is 2+2?", options: ["3", "4", "5"] },
      teachCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:true at exact cap boundaries (prompt = promptMaxWords)", () => {
    const result = validateQuestionConstraints(
      { prompt: words(30), options: ["a", "b"] },
      teachCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:true at exact cap boundaries (choiceCount = max)", () => {
    const result = validateQuestionConstraints(
      { prompt: "Short prompt?", options: ["a", "b", "c", "d"] },
      teachCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("returns ok:true at exact cap boundaries (option label = choiceMaxWords)", () => {
    const result = validateQuestionConstraints(
      { prompt: "Short prompt?", options: [words(10), words(10)] },
      teachCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("accepts {label: string} option shape", () => {
    const result = validateQuestionConstraints(
      { prompt: "Which one?", options: [{ label: "Option A" }, { label: "Option B" }] },
      teachCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("accepts mixed string and {label} option shapes in the same array", () => {
    const result = validateQuestionConstraints(
      { prompt: "Which one?", options: ["Option A", { label: "Option B" }] },
      teachCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("ignores multiSelect field — does not affect success", () => {
    const result = validateQuestionConstraints(
      { prompt: "Pick some?", options: ["a", "b"], multiSelect: true },
      teachCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });
});

// ── Failure: prompt too long ──────────────────────────────────────────────────

describe("validateQuestionConstraints — prompt over cap", () => {
  it("returns field:prompt when prompt exceeds promptMaxWords", () => {
    const longPrompt = words(50);
    const result = validateQuestionConstraints(
      { prompt: longPrompt, options: ["a", "b"] },
      teachCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("QUESTION_CONSTRAINT_VIOLATION");
      expect(result.field).toBe("prompt");
      expect(result.message).toContain("Question prompt too long for teach mode");
      expect(result.message).toContain("50 words");
      expect(result.message).toContain("max 30");
    }
  });

  it("fails at promptMaxWords + 1 (boundary)", () => {
    const result = validateQuestionConstraints(
      { prompt: words(31), options: ["a", "b"] },
      teachCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("prompt");
      expect(result.message).toContain("31 words");
    }
  });

  it("includes the modeLabel in the failure message", () => {
    const result = validateQuestionConstraints(
      { prompt: words(10), options: ["a", "b"] },
      tightCaps,
      "quiz",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("quiz mode");
    }
  });

  it("prompt failure is checked before choiceCount failure (ordering)", () => {
    // Both prompt and options are over cap — should fail on prompt first.
    const result = validateQuestionConstraints(
      { prompt: words(50), options: ["a", "b", "c"] },
      tightCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("prompt");
    }
  });
});

// ── Failure: too many choices ─────────────────────────────────────────────────

describe("validateQuestionConstraints — choiceCount over cap", () => {
  it("returns field:choiceCount when options.length exceeds choiceCount", () => {
    const result = validateQuestionConstraints(
      { prompt: "Short?", options: ["a", "b", "c", "d", "e"] },
      teachCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("QUESTION_CONSTRAINT_VIOLATION");
      expect(result.field).toBe("choiceCount");
      expect(result.message).toContain("Too many choices for teach mode");
      expect(result.message).toContain("5");
      expect(result.message).toContain("max 4");
    }
  });

  it("fails at choiceCount + 1 (boundary)", () => {
    const result = validateQuestionConstraints(
      { prompt: "Short?", options: ["a", "b", "c"] },
      tightCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("choiceCount");
    }
  });

  it("choiceCount failure is checked before per-option label failure (ordering)", () => {
    // Too many options AND each option is over choiceMaxWords — should fail on count first.
    const longLabel = words(20);
    const result = validateQuestionConstraints(
      { prompt: "Short?", options: [longLabel, longLabel, longLabel] },
      tightCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("choiceCount");
    }
  });
});

// ── Failure: per-option label too long ───────────────────────────────────────

describe("validateQuestionConstraints — choice label over cap", () => {
  it("returns field:options when a label exceeds choiceMaxWords (string option)", () => {
    const longLabel = words(15);
    const result = validateQuestionConstraints(
      { prompt: "Short?", options: ["ok", longLabel] },
      teachCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("QUESTION_CONSTRAINT_VIOLATION");
      expect(result.field).toBe("options");
      expect(result.message).toContain("Choice 2 text too long for teach mode");
      expect(result.message).toContain("15 words");
      expect(result.message).toContain("max 10");
    }
  });

  it("returns field:options when a label exceeds choiceMaxWords ({label} option)", () => {
    const longLabel = words(15);
    const result = validateQuestionConstraints(
      { prompt: "Short?", options: [{ label: "ok" }, { label: longLabel }] },
      teachCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("options");
      expect(result.message).toContain("Choice 2 text too long");
    }
  });

  it("reports the 1-based index of the first offending choice", () => {
    const longLabel = words(15);
    // First two choices are fine; third is over cap.
    const result = validateQuestionConstraints(
      { prompt: "Short?", options: ["a", "b", longLabel, "c"] },
      teachCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Choice 3 text too long");
    }
  });

  it("fails at choiceMaxWords + 1 (boundary)", () => {
    const result = validateQuestionConstraints(
      { prompt: "Short?", options: ["ok", words(11)] },
      teachCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("options");
      expect(result.message).toContain("11 words");
    }
  });
});

// ── multiSelectCap NOT enforced here ─────────────────────────────────────────

describe("validateQuestionConstraints — multiSelectCap not enforced", () => {
  it("does not fail on payload content regardless of multiSelectCap (enforcement is in answer path)", () => {
    // multiSelectCap = 1 but we have multiSelect: true — payload shape is not validated here.
    const result = validateQuestionConstraints(
      { prompt: "Pick any?", options: ["a", "b"], multiSelect: true },
      tightCaps,
      "teach",
    );
    // Only fails if prompt/options/choiceCount are over cap. With tightCaps (prompt=5 words, choices=2, choiceMax=2):
    expect(result).toEqual({ ok: true });
  });
});

// ── countWords edge cases (exercised via prompt validation) ───────────────────

describe("countWords edge cases (via prompt validation)", () => {
  it("empty string has word count 0 — passes even the tightest promptMaxWords cap", () => {
    const result = validateQuestionConstraints(
      { prompt: "", options: ["a", "b"] },
      tightCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("whitespace-only string has word count 0", () => {
    const result = validateQuestionConstraints(
      { prompt: "   ", options: ["a", "b"] },
      tightCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("single word is counted as 1", () => {
    const result = validateQuestionConstraints(
      { prompt: "Why?", options: ["a", "b"] },
      tightCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("leading/trailing whitespace does not inflate word count", () => {
    // "  hello world  " should be 2 words, not 4 or 6.
    const result = validateQuestionConstraints(
      { prompt: "  hello world  ", options: ["a", "b"] },
      tightCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("markdown bold token (e.g. **bold**) counts as one word", () => {
    // "**bold**" contains no internal whitespace — it's a single token.
    const result = validateQuestionConstraints(
      { prompt: "What is **bold**?", options: ["a", "b"] },
      tightCaps,
      "teach",
    );
    // "What", "is", "**bold**?", → 3 words — within tightCaps.promptMaxWords (5)
    expect(result).toEqual({ ok: true });
  });

  it("markdown bold does not split into multiple words", () => {
    // Confirm 5-word prompt with a bold token stays within tightCaps (max=5).
    const result = validateQuestionConstraints(
      { prompt: "Is **bold** a single word?", options: ["a", "b"] },
      tightCaps,
      "teach",
    );
    // "Is", "**bold**", "a", "single", "word?" → 5 words — exactly at cap
    expect(result).toEqual({ ok: true });
  });

  it("prompt with 6 words fails tightCaps (max 5)", () => {
    const result = validateQuestionConstraints(
      { prompt: "one two three four five six", options: ["a", "b"] },
      tightCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("prompt");
      expect(result.message).toContain("6 words");
      expect(result.message).toContain("max 5");
    }
  });
});

// ── Option shape: both string and {label} ─────────────────────────────────────

describe("validateQuestionConstraints — option shape handling", () => {
  it("accepts plain string options", () => {
    const result = validateQuestionConstraints(
      { prompt: "Pick one?", options: ["Alpha", "Beta"] },
      teachCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("accepts {label: string} options", () => {
    const result = validateQuestionConstraints(
      { prompt: "Pick one?", options: [{ label: "Alpha" }, { label: "Beta" }] },
      teachCaps,
      "teach",
    );
    expect(result).toEqual({ ok: true });
  });

  it("applies choiceMaxWords to string option labels", () => {
    const result = validateQuestionConstraints(
      { prompt: "Short?", options: [words(11), "ok"] },
      teachCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("options");
      expect(result.message).toContain("Choice 1 text too long");
    }
  });

  it("applies choiceMaxWords to {label} option labels", () => {
    const result = validateQuestionConstraints(
      { prompt: "Short?", options: [{ label: words(11) }, { label: "ok" }] },
      teachCaps,
      "teach",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("options");
      expect(result.message).toContain("Choice 1 text too long");
    }
  });
});
