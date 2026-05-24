import katex from "katex";
import { describe, expect, it } from "vitest";

import { KATEX_MACRO_DOCS, KATEX_MACROS } from "../katex-macros.js";

// ---------------------------------------------------------------------------
// Sync check: KATEX_MACROS keys === KATEX_MACRO_DOCS shortcuts
// ---------------------------------------------------------------------------
describe("KATEX_MACROS / KATEX_MACRO_DOCS sync", () => {
  it("has the same 11 entries in both exports", () => {
    const keys = new Set(Object.keys(KATEX_MACROS));
    const docs = new Set(KATEX_MACRO_DOCS.map((d) => d.shortcut));
    expect(keys).toEqual(docs);
  });

  it("KATEX_MACROS has exactly 11 macros", () => {
    expect(Object.keys(KATEX_MACROS)).toHaveLength(11);
  });

  it("KATEX_MACRO_DOCS has exactly 11 entries", () => {
    expect(KATEX_MACRO_DOCS).toHaveLength(11);
  });

  it("KATEX_MACROS is frozen", () => {
    expect(Object.isFrozen(KATEX_MACROS)).toBe(true);
  });

  it("each KATEX_MACRO_DOCS entry expansion matches its KATEX_MACROS value", () => {
    for (const doc of KATEX_MACRO_DOCS) {
      expect(KATEX_MACROS[doc.shortcut]).toBe(doc.expansion);
    }
  });
});

// ---------------------------------------------------------------------------
// Per-macro render tests: throwOnError:true surfaces broken expansions
// ---------------------------------------------------------------------------
describe("KaTeX renders each macro without error", () => {
  const opts: katex.KatexOptions = { throwOnError: true, macros: KATEX_MACROS };

  // Number-set macros (no parameters)
  it("\\R renders", () => {
    expect(() => katex.renderToString("\\R", opts)).not.toThrow();
  });

  it("\\Z renders", () => {
    expect(() => katex.renderToString("\\Z", opts)).not.toThrow();
  });

  it("\\N renders", () => {
    expect(() => katex.renderToString("\\N", opts)).not.toThrow();
  });

  it("\\Q renders", () => {
    expect(() => katex.renderToString("\\Q", opts)).not.toThrow();
  });

  it("\\C renders", () => {
    expect(() => katex.renderToString("\\C", opts)).not.toThrow();
  });

  // Calculus macros — two parameters
  it("\\pdv{f}{x} renders", () => {
    expect(() => katex.renderToString("\\pdv{f}{x}", opts)).not.toThrow();
  });

  it("\\dv{f}{x} renders", () => {
    expect(() => katex.renderToString("\\dv{f}{x}", opts)).not.toThrow();
  });

  // One-parameter macros
  it("\\norm{v} renders", () => {
    expect(() => katex.renderToString("\\norm{v}", opts)).not.toThrow();
  });

  it("\\abs{x} renders", () => {
    expect(() => katex.renderToString("\\abs{x}", opts)).not.toThrow();
  });

  it("\\set{a, b, c} renders", () => {
    expect(() => katex.renderToString("\\set{a, b, c}", opts)).not.toThrow();
  });

  // No-parameter alias
  it("\\given renders in a conditional context", () => {
    expect(() => katex.renderToString("P(A \\given B)", opts)).not.toThrow();
  });

  // Spot-check that expansions produce expected HTML fragments
  it("\\R expands to \\mathbb{R} — output contains double-struck R", () => {
    const html = katex.renderToString("\\R", opts);
    // KaTeX uses 'mathbb' class for double-struck letters
    expect(html).toMatch(/mathbb|mbb/);
  });
});
