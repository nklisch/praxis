/**
 * Style composer tests — pure function, no DB, no LLM.
 * Tests run in microseconds.
 */
import { describe, expect, it } from "vitest";
import {
  composeProductiveStruggle,
  composeStyleOverrides,
  composeTutorRole,
} from "../style-composer.js";

// ─── composeTutorRole ─────────────────────────────────────────────────────────

describe("composeTutorRole()", () => {
  it("neutral (0,0,0) produces balance sentence only", () => {
    const result = composeTutorRole({ socratic: 0, verbosity: 0, formality: 0 });
    expect(result).toContain("Balance asking and telling");
    // Neutral verbosity and formality → no extra sentences.
    expect(result).not.toContain("Be concise");
    expect(result).not.toContain("Be expansive");
    expect(result).not.toContain("formal academic");
    expect(result).not.toContain("casual conversational");
  });

  it("socratic = -1 → lead with questions", () => {
    const result = composeTutorRole({ socratic: -1, verbosity: 0, formality: 0 });
    expect(result).toContain("Lead with questions");
    expect(result).not.toContain("Explain clearly");
    expect(result).not.toContain("Balance asking");
  });

  it("socratic = +1 → explain clearly", () => {
    const result = composeTutorRole({ socratic: 1, verbosity: 0, formality: 0 });
    expect(result).toContain("Explain clearly");
    expect(result).not.toContain("Lead with questions");
    expect(result).not.toContain("Balance asking");
  });

  it("threshold: socratic = -0.3 → Socratic branch", () => {
    const result = composeTutorRole({ socratic: -0.3, verbosity: 0, formality: 0 });
    expect(result).toContain("Lead with questions");
  });

  it("threshold: socratic = -0.29 → neutral branch", () => {
    const result = composeTutorRole({ socratic: -0.29, verbosity: 0, formality: 0 });
    expect(result).toContain("Balance asking");
  });

  it("verbosity = -1 → be concise", () => {
    const result = composeTutorRole({ socratic: 0, verbosity: -1, formality: 0 });
    expect(result).toContain("Be concise");
  });

  it("verbosity = +1 → be expansive", () => {
    const result = composeTutorRole({ socratic: 0, verbosity: 1, formality: 0 });
    expect(result).toContain("Be expansive");
  });

  it("formality = -1 → formal academic language", () => {
    const result = composeTutorRole({ socratic: 0, verbosity: 0, formality: -1 });
    expect(result).toContain("formal academic language");
  });

  it("formality = +1 → casual conversational tone", () => {
    const result = composeTutorRole({ socratic: 0, verbosity: 0, formality: 1 });
    expect(result).toContain("casual conversational tone");
  });

  it("all sliders at extremes produces all four lines", () => {
    const result = composeTutorRole({ socratic: -1, verbosity: -1, formality: -1 });
    expect(result).toContain("Lead with questions");
    expect(result).toContain("Be concise");
    expect(result).toContain("formal academic language");
  });

  it("is a pure function — same inputs produce the same output", () => {
    const vals = { socratic: -0.5, verbosity: 0.5, formality: 0.5 };
    expect(composeTutorRole(vals)).toBe(composeTutorRole(vals));
  });
});

// ─── composeProductiveStruggle ────────────────────────────────────────────────

describe("composeProductiveStruggle()", () => {
  it("returns the canonical productive-struggle text regardless of slider values", () => {
    const text0 = composeProductiveStruggle({ socratic: 0, verbosity: 0, formality: 0 });
    const text1 = composeProductiveStruggle({ socratic: 1, verbosity: 1, formality: 1 });
    const text2 = composeProductiveStruggle({ socratic: -1, verbosity: -1, formality: -1 });
    expect(text0).toContain("Productive struggle");
    expect(text0).toBe(text1);
    expect(text0).toBe(text2);
  });
});

// ─── composeStyleOverrides ────────────────────────────────────────────────────

describe("composeStyleOverrides()", () => {
  it("returns overrides for teach, quiz, homework, study-skills modes (role.tutor)", () => {
    const overrides = composeStyleOverrides({ socratic: 0, verbosity: 0, formality: 0 });
    const modeIds = overrides.filter((o) => o.fragmentId === "role.tutor").map((o) => o.modeId);
    expect(modeIds).toContain("teach");
    expect(modeIds).toContain("quiz");
    expect(modeIds).toContain("homework");
    expect(modeIds).toContain("study-skills");
  });

  it("returns constraints.productive-struggle for teach mode", () => {
    const overrides = composeStyleOverrides({ socratic: 0, verbosity: 0, formality: 0 });
    const ps = overrides.find(
      (o) => o.modeId === "teach" && o.fragmentId === "constraints.productive-struggle",
    );
    expect(ps).toBeDefined();
    expect(ps?.template).toContain("Productive struggle");
  });

  it("total override count: 4 (role.tutor) + 1 (productive-struggle) = 5", () => {
    const overrides = composeStyleOverrides({ socratic: 0, verbosity: 0, formality: 0 });
    expect(overrides).toHaveLength(5);
  });

  it("all overrides have non-empty templates", () => {
    const overrides = composeStyleOverrides({ socratic: -1, verbosity: 1, formality: -1 });
    for (const o of overrides) {
      expect(o.template.trim().length).toBeGreaterThan(0);
    }
  });

  it("is deterministic — same inputs produce identical override arrays", () => {
    const vals = { socratic: 0.5, verbosity: -0.5, formality: 0 };
    const a = composeStyleOverrides(vals);
    const b = composeStyleOverrides(vals);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
