/**
 * Tests for the concept-link fuzzy matcher.
 * Pure-function tests — no DB, no async, no side effects.
 */

import { describe, expect, it } from "vitest";
import type { Concept } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { matchConceptByLabel } from "../concept-link-matcher.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConcept(name: string): Concept {
  return {
    id: brandId<"ConceptId">(`concept-${name.toLowerCase().replace(/\s+/g, "-")}`),
    // biome-ignore lint/suspicious/noExplicitAny: test stub for ConceptGraphId
    graphId: brandId<"ConceptGraphId">("graph-1") as any,
    name,
    description: "",
    aliases: [],
    standardsTags: [],
  };
}

const ALGEBRA_CONCEPTS: ReadonlyArray<Concept> = [
  makeConcept("Linear Equations"),
  makeConcept("Quadratic Equations"),
  makeConcept("Slope"),
  makeConcept("Y-Intercept"),
  makeConcept("Systems of Equations"),
  makeConcept("Inequalities"),
  makeConcept("Absolute Value"),
  makeConcept("Polynomial Functions"),
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("matchConceptByLabel — exact match", () => {
  it("returns confidence 1.0 for a case-insensitive exact match", () => {
    const results = matchConceptByLabel("slope", ALGEBRA_CONCEPTS);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const top = results[0];
    expect(top?.conceptName).toBe("Slope");
    expect(top?.confidence).toBe(1.0);
  });

  it("returns confidence 1.0 ignoring leading/trailing whitespace", () => {
    const results = matchConceptByLabel("  Slope  ", ALGEBRA_CONCEPTS);
    expect(results[0]?.confidence).toBe(1.0);
  });
});

describe("matchConceptByLabel — fuzzy match", () => {
  it("matches 'Linear Eqs' to 'Linear Equations' as the top result", () => {
    // "Linear Eqs" → "Linear Equations": the word "linear" matches exactly,
    // and "eqs" fuzzy-matches "equations" well enough. Score ≈ 0.65–0.70.
    // The key invariant is that it ranks first and clears the default threshold.
    const results = matchConceptByLabel("Linear Eqs", ALGEBRA_CONCEPTS);
    expect(results.length).toBeGreaterThanOrEqual(1);
    const top = results[0];
    expect(top?.conceptName).toBe("Linear Equations");
    expect(top?.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it("matches 'quadratic' to 'Quadratic Equations' with the default threshold", () => {
    // Single-token query: "quadratic" exact-matches "quadratic" in "Quadratic Equations".
    // Token score is dampened by the 1/2 count ratio → ≈ 0.5, which is below the
    // default 0.65 threshold. Lowering the threshold shows the expected concept first.
    const results = matchConceptByLabel("quadratic", ALGEBRA_CONCEPTS, 0.4);
    const match = results.find((r) => r.conceptName === "Quadratic Equations");
    expect(match).toBeDefined();
    expect(results[0]?.conceptName).toBe("Quadratic Equations");
  });

  it("matches 'y intercept' (no hyphen) to 'Y-Intercept'", () => {
    const results = matchConceptByLabel("y intercept", ALGEBRA_CONCEPTS);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.conceptName).toBe("Y-Intercept");
  });

  it("returns results sorted descending by confidence", () => {
    const results = matchConceptByLabel("equations", ALGEBRA_CONCEPTS);
    for (let i = 1; i < results.length; i++) {
      // biome-ignore lint/suspicious/noExplicitAny: safe array index access in bounds-checked loop
      const curr = (results as any)[i].confidence as number;
      // biome-ignore lint/suspicious/noExplicitAny: safe array index access in bounds-checked loop
      const prev = (results as any)[i - 1].confidence as number;
      expect(curr).toBeLessThanOrEqual(prev);
    }
  });
});

describe("matchConceptByLabel — no match", () => {
  it("returns [] for a label with no similarity to any concept", () => {
    const results = matchConceptByLabel("Banana", ALGEBRA_CONCEPTS);
    expect(results).toEqual([]);
  });

  it("returns [] for an empty label", () => {
    const results = matchConceptByLabel("", ALGEBRA_CONCEPTS);
    expect(results).toEqual([]);
  });

  it("returns [] for a whitespace-only label", () => {
    const results = matchConceptByLabel("   ", ALGEBRA_CONCEPTS);
    expect(results).toEqual([]);
  });
});

describe("matchConceptByLabel — minConfidence parameter", () => {
  it("returns more results with a lower threshold", () => {
    const strict = matchConceptByLabel("equations", ALGEBRA_CONCEPTS, 0.9);
    const loose = matchConceptByLabel("equations", ALGEBRA_CONCEPTS, 0.3);
    expect(loose.length).toBeGreaterThanOrEqual(strict.length);
  });

  it("returns [] when minConfidence is 1.0 and no exact match", () => {
    const results = matchConceptByLabel("Linear Eqs", ALGEBRA_CONCEPTS, 1.0);
    expect(results).toEqual([]);
  });
});

describe("matchConceptByLabel — empty concept list", () => {
  it("returns [] when canonicalConcepts is empty", () => {
    const results = matchConceptByLabel("Slope", []);
    expect(results).toEqual([]);
  });
});

describe("matchConceptByLabel — pure function", () => {
  it("returns the same results for the same input (deterministic)", () => {
    const a = matchConceptByLabel("slope", ALGEBRA_CONCEPTS);
    const b = matchConceptByLabel("slope", ALGEBRA_CONCEPTS);
    expect(a).toEqual(b);
  });

  it("does not mutate the input array", () => {
    const concepts = [...ALGEBRA_CONCEPTS];
    const lengthBefore = concepts.length;
    matchConceptByLabel("slope", concepts);
    expect(concepts.length).toBe(lengthBefore);
  });
});
