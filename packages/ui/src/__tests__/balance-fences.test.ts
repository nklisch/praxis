import { describe, expect, it } from "vitest";
import { balanceFences } from "../lib/balance-fences.js";

describe("balanceFences", () => {
  it("returns input unchanged when fences balanced", () => {
    const input = "before\n```js\nconst x = 1;\n```\nafter";
    expect(balanceFences(input)).toBe(input);
  });

  it("appends synthetic close for unclosed code fence", () => {
    const input = "before\n```js\nconst x = 1;";
    const out = balanceFences(input);
    expect(out.endsWith("```\n")).toBe(true);
    // The original prefix is preserved verbatim.
    expect(out.startsWith(input)).toBe(true);
  });

  it("appends synthetic close for unclosed $$ math", () => {
    const input = "Result: $$\\int_0^1 x dx";
    const out = balanceFences(input);
    expect(out.endsWith("$$")).toBe(true);
    expect(out.startsWith(input)).toBe(true);
  });

  it("handles both unclosed code fence and $$ in same input", () => {
    const input = "```py\nx = 1\n\nand $$\\sum x";
    const out = balanceFences(input);
    expect(out).toContain("```");
    expect(out).toContain("$$");
    // Two synthetic closes added; both delimiters now even.
    const fences = (out.match(/^[ \t]{0,3}```/gm) ?? []).length;
    expect(fences % 2).toBe(0);
    expect((out.split("$$").length - 1) % 2).toBe(0);
  });

  it("does not double-close already-balanced input", () => {
    const balanced = "```\ncode\n```\nand $$x$$ math.";
    expect(balanceFences(balanced)).toBe(balanced);
  });

  it("counts opening fence at position 0 (no preceding newline)", () => {
    // Bare fence at the very start of input must still be counted.
    const input = "```\nincomplete";
    const out = balanceFences(input);
    expect(out.endsWith("```\n")).toBe(true);
  });

  it("preserves trailing newline when appending fence close", () => {
    const input = "```js\nincomplete\n";
    const out = balanceFences(input);
    expect(out).toBe("```js\nincomplete\n```\n");
  });

  it("leaves inline single $ alone (degrades to literal)", () => {
    // Single $ pairs are NOT balanced — markdown treats unclosed inline
    // marks as literal characters, so no synthetic close is needed.
    const input = "cost is $5 and";
    expect(balanceFences(input)).toBe(input);
  });
});
