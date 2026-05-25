/**
 * CSS design-token regression guard.
 *
 * Story: gate-tests-workspace-edge-padding-token-presence
 *
 * Acceptance criterion:
 *   All workspace tab bodies use the same outer gutter / padding token;
 *   visual diff matches RouteHeader / LibrarySection breathing-room.
 *
 * Gap: CSS-only changes were verified by manual comparison; no automated
 * regression catches a deletion of `--space-page-gutter` from global.css.
 *
 * This test reads global.css as text and asserts the token definition is
 * present at `:root`. It is a lightweight substring check — not a full CSS
 * parse — sufficient to catch the most obvious regression (token deleted or
 * renamed) without pulling in a CSS parser dependency.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GLOBAL_CSS_PATH = resolve(import.meta.dirname, "../global.css");

describe("global.css design tokens", () => {
  it("defines --space-page-gutter at :root", () => {
    const css = readFileSync(GLOBAL_CSS_PATH, "utf-8");

    // Token must be declared inside a :root block.
    // We check that both `:root` and the token declaration appear in the file.
    // A full parse would be ideal but is not worth the dependency; this guard
    // catches the most common regression: accidental deletion or rename.
    expect(css).toContain(":root");
    expect(css).toContain("--space-page-gutter:");
  });

  it("--space-page-gutter value is a rem measurement", () => {
    const css = readFileSync(GLOBAL_CSS_PATH, "utf-8");

    // Extract the token line to pin the value format (rem unit).
    // This catches a class of regression where the value is changed to px
    // (which breaks zoom-relative scaling) or deleted entirely.
    const tokenLineMatch = css.match(/--space-page-gutter:\s*([^;]+);/);
    expect(tokenLineMatch).not.toBeNull();

    const value = tokenLineMatch?.[1]?.trim() ?? "";
    // Value must be a rem measurement (e.g. "1.5rem").
    expect(value).toMatch(/^\d+(\.\d+)?rem$/);
  });
});
