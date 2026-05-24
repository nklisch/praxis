/**
 * Tests for scripts/check-css-contract.mjs
 *
 * Exercises the scanFile() function with in-memory fixture CSS strings
 * (written to a temp file so scanFile can read them).
 */

import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanFile } from "./check-css-contract.mjs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tempDir;
let fileCounter = 0;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "css-contract-test-"));
});

afterAll(() => {
  // cleanup is best-effort; temp dir GC handles the rest
});

function writeFixture(css) {
  const path = join(tempDir, `fixture-${++fileCounter}.module.css`);
  writeFileSync(path, css, "utf8");
  return path;
}

// ─── Pass: clean CSS ─────────────────────────────────────────────────────────

describe("clean CSS — no violations", () => {
  it("passes when all values use var(--*) tokens", () => {
    const css = `
.btn {
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  padding: var(--space-2) var(--space-4);
  gap: var(--space-1-5);
  transition: opacity var(--dur-quick);
  transition: all var(--t-quick);
  animation: spin var(--dur-ambient) var(--ease-standard) infinite;
  border-radius: var(--radius-md);
}
.panel {
  margin: var(--space-6) auto;
  transition: width var(--dur-quick) var(--ease-emphasized);
}
`;
    const violations = scanFile(writeFixture(css));
    expect(violations).toHaveLength(0);
  });

  it("passes when hex appears only inside a CSS comment", () => {
    const css = `
/* color reference: #ff0000 is forbidden in production */
.btn {
  color: var(--color-danger); /* was #ff0000 */
}
`;
    const violations = scanFile(writeFixture(css));
    expect(violations).toHaveLength(0);
  });
});

// ─── Fail: each rule violated ────────────────────────────────────────────────

describe("hex-color rule", () => {
  it("flags a 6-digit hex color", () => {
    const css = `.btn { color: #ff0000; }\n`;
    const violations = scanFile(writeFixture(css));
    const hexViolations = violations.filter((v) => v.rule === "hex-color");
    expect(hexViolations).toHaveLength(1);
    expect(hexViolations[0].line).toBe(1);
  });

  it("flags a 3-digit hex color", () => {
    const css = `.btn { background: #abc; }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.some((v) => v.rule === "hex-color")).toBe(true);
  });

  it("flags an 8-digit hex color with alpha", () => {
    const css = `.btn { border-color: #aabbccdd; }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.some((v) => v.rule === "hex-color")).toBe(true);
  });
});

describe("bare-px-spacing rule", () => {
  it("flags bare px in padding", () => {
    const css = `.box { padding: 16px; }\n`;
    const violations = scanFile(writeFixture(css));
    const found = violations.filter((v) => v.rule === "bare-px-spacing");
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(1);
  });

  it("flags bare px in margin", () => {
    const css = `.box { margin: 8px 0; }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.some((v) => v.rule === "bare-px-spacing")).toBe(true);
  });

  it("flags bare px in gap", () => {
    const css = `.box { gap: 12px; }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.some((v) => v.rule === "bare-px-spacing")).toBe(true);
  });

  it("does NOT flag px in other declarations (e.g. font-size)", () => {
    const css = `.box { font-size: 14px; border-radius: 4px; }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-px-spacing")).toHaveLength(0);
  });

  it("does NOT flag when var(-- is present in the value", () => {
    const css = `.box { padding: var(--space-2) var(--space-4); }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-px-spacing")).toHaveLength(0);
  });
});

describe("cubic-bezier-literal rule", () => {
  it("flags a cubic-bezier() literal", () => {
    const css = `.btn { transition: opacity 160ms cubic-bezier(0, 0, 0.2, 1); }\n`;
    const violations = scanFile(writeFixture(css));
    const found = violations.filter((v) => v.rule === "cubic-bezier-literal");
    expect(found).toHaveLength(1);
  });
});

describe("bare-duration rule", () => {
  it("flags a bare ms duration in transition", () => {
    const css = `.btn { transition: opacity 160ms; }\n`;
    const violations = scanFile(writeFixture(css));
    const found = violations.filter((v) => v.rule === "bare-duration");
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(1);
  });

  it("flags a bare seconds duration in transition", () => {
    const css = `.btn { transition: opacity 0.15s; }\n`;
    const violations = scanFile(writeFixture(css));
    const found = violations.filter((v) => v.rule === "bare-duration");
    expect(found).toHaveLength(1);
  });

  it("flags a bare duration in animation", () => {
    const css = `.spinner { animation: spin 0.3s linear infinite; }\n`;
    const violations = scanFile(writeFixture(css));
    const found = violations.filter((v) => v.rule === "bare-duration");
    expect(found).toHaveLength(1);
  });

  it("flags a bare duration in animation-duration", () => {
    const css = `.spinner { animation-duration: 480ms; }\n`;
    const violations = scanFile(writeFixture(css));
    const found = violations.filter((v) => v.rule === "bare-duration");
    expect(found).toHaveLength(1);
  });

  it("does NOT flag when var(-- is used", () => {
    const css = `.btn { transition: opacity var(--dur-quick); }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-duration")).toHaveLength(0);
  });

  it("does NOT flag ms values outside transition/animation declarations", () => {
    const css = `.btn { width: 160ms; }\n`; // nonsensical but shouldn't trigger
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-duration")).toHaveLength(0);
  });
});

// ─── Pass: valid design-system-exception comments ────────────────────────────

describe("design-system-exception suppression", () => {
  it("suppresses a violation when exception comment is on the same line", () => {
    const css = `.box { padding: 28px; /* design-system-exception: structural glyph offset */ }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-px-spacing")).toHaveLength(0);
  });

  it("suppresses a violation when exception comment is on the preceding line", () => {
    const css = `/* design-system-exception: structural pixel offset matching ◆ marker */\n.box { padding-left: 22px; }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-px-spacing")).toHaveLength(0);
  });

  it("still flags a violation when exception comment is two lines above (not adjacent)", () => {
    const css = `/* design-system-exception: reason */\n\n.box { padding: 28px; }\n`;
    const violations = scanFile(writeFixture(css));
    // The blank line separates them — exception on line 1 doesn't cover line 3
    expect(violations.filter((v) => v.rule === "bare-px-spacing")).toHaveLength(1);
  });

  it("suppresses hex-color with preceding-line exception", () => {
    const css = `/* design-system-exception: legacy hardcoded override */\n.btn { color: #ff0000; }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "hex-color")).toHaveLength(0);
  });

  it("suppresses bare-duration with inline exception", () => {
    const css = `.btn { transition: opacity 160ms; /* design-system-exception: vendor requirement */ }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-duration")).toHaveLength(0);
  });

  it("suppresses cubic-bezier with preceding-line exception", () => {
    const css = `/* design-system-exception: third-party animation lib output */\n.anim { transition: transform 160ms cubic-bezier(0.4, 0, 1, 1); }\n`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "cubic-bezier-literal")).toHaveLength(0);
  });
});

// ─── Mixed: file with both clean and dirty declarations ──────────────────────

describe("mixed file", () => {
  it("returns one violation per dirty line, skips clean lines", () => {
    const css = `
.a { color: var(--color-text-primary); }
.b { color: #aabbcc; }
.c { padding: var(--space-4); }
.d { margin: 8px; }
.e { transition: opacity var(--dur-quick); }
.f { transition: opacity 0.15s; }
`;
    const violations = scanFile(writeFixture(css));
    const ruleIds = violations.map((v) => v.rule);
    expect(ruleIds).toContain("hex-color");
    expect(ruleIds).toContain("bare-px-spacing");
    expect(ruleIds).toContain("bare-duration");
    expect(violations).toHaveLength(3);
  });
});

// ─── Multi-line transition declarations ──────────────────────────────────────

describe("bare-duration rule — multi-line transition declarations", () => {
  it("flags bare durations on continuation lines (two violations)", () => {
    const css = `
.x {
  transition:
    color 0.15s,
    border-color 0.15s;
}
`;
    const violations = scanFile(writeFixture(css));
    const found = violations.filter((v) => v.rule === "bare-duration");
    expect(found).toHaveLength(2);
    expect(found[0].line).toBe(4); // color 0.15s line
    expect(found[1].line).toBe(5); // border-color 0.15s line
  });

  it("does NOT flag when continuation lines use var(-- tokens", () => {
    const css = `
.x {
  transition:
    color var(--dur-quick),
    border-color var(--dur-quick);
}
`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-duration")).toHaveLength(0);
  });

  it("suppresses all continuation-line violations when exception is on the declaration line", () => {
    const css = `
.x {
  /* design-system-exception: explicit 250ms feel needed for handoff */
  transition: opacity 0.25s;
}
`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-duration")).toHaveLength(0);
  });

  it("suppresses all continuation-line violations when exception precedes multi-line declaration", () => {
    const css = `
.x {
  /* design-system-exception: explicit timing on dismissal */
  transition:
    opacity 0.25s,
    transform 0.25s;
}
`;
    const violations = scanFile(writeFixture(css));
    expect(violations.filter((v) => v.rule === "bare-duration")).toHaveLength(0);
  });
});
