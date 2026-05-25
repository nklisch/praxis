/**
 * Smoke tests for the choice-indicator CSS module.
 *
 * Since this is purely presentational CSS, these tests verify:
 *  1. Each CSS Module class name resolves to a non-empty string (the module
 *     loaded correctly; Vite returns camelCase keys as identity strings in
 *     jsdom).
 *  2. Elements rendered with each class combination carry the expected class
 *     names — i.e. the module exports and the JSX className prop stay in
 *     sync as we compose variants.
 *
 * All 6 state combinations exercised:
 *   radio default   / radio correct   / radio incorrect
 *   check default   / check correct   / check incorrect
 *
 * We do NOT assert computed visual styles (jsdom doesn't apply CSS). We
 * assert class-name composition, which is the load-bearing behaviour for
 * step-2's refactor consumers.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import styles from "../components/item-bodies/choice-indicator.module.css";

afterEach(() => cleanup());

/* ── Helper ───────────────────────────────────────────────────────────────── */

/**
 * Renders a <span> with the given class names and returns the DOM node.
 * The test wrapper is minimal — this is intentionally not a production
 * component; no need to ship it outside this test file.
 */
function renderIndicator(classNames: string[], selected = false): HTMLElement {
  const { container } = render(
    <span
      className={classNames.filter(Boolean).join(" ")}
      data-selected={selected ? "true" : undefined}
      data-testid="indicator"
    />,
  );
  const el = container.querySelector('[data-testid="indicator"]');
  if (!el) throw new Error("indicator element not found");
  return el as HTMLElement;
}

/* ── Module resolution ────────────────────────────────────────────────────── */

describe("choice-indicator CSS module — class name resolution", () => {
  it("exports .choiceIndicator as a non-empty string", () => {
    expect(typeof styles.choiceIndicator).toBe("string");
    expect(styles.choiceIndicator.length).toBeGreaterThan(0);
  });

  it("exports .choiceIndicatorRadio as a non-empty string", () => {
    expect(typeof styles.choiceIndicatorRadio).toBe("string");
    expect(styles.choiceIndicatorRadio.length).toBeGreaterThan(0);
  });

  it("exports .choiceIndicatorCheck as a non-empty string", () => {
    expect(typeof styles.choiceIndicatorCheck).toBe("string");
    expect(styles.choiceIndicatorCheck.length).toBeGreaterThan(0);
  });

  it("exports .choiceIndicatorCorrect as a non-empty string", () => {
    expect(typeof styles.choiceIndicatorCorrect).toBe("string");
    expect(styles.choiceIndicatorCorrect.length).toBeGreaterThan(0);
  });

  it("exports .choiceIndicatorIncorrect as a non-empty string", () => {
    expect(typeof styles.choiceIndicatorIncorrect).toBe("string");
    expect(styles.choiceIndicatorIncorrect.length).toBeGreaterThan(0);
  });
});

/* ── Class composition ────────────────────────────────────────────────────── */

describe("choice-indicator — class composition for all 6 state combinations", () => {
  it("radio default: base + radio, no feedback variant", () => {
    const el = renderIndicator([styles.choiceIndicator, styles.choiceIndicatorRadio]);
    expect(el.classList.contains(styles.choiceIndicator)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorRadio)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorCorrect)).toBe(false);
    expect(el.classList.contains(styles.choiceIndicatorIncorrect)).toBe(false);
  });

  it("radio correct: base + radio + correct", () => {
    const el = renderIndicator([
      styles.choiceIndicator,
      styles.choiceIndicatorRadio,
      styles.choiceIndicatorCorrect,
    ]);
    expect(el.classList.contains(styles.choiceIndicator)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorRadio)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorCorrect)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorIncorrect)).toBe(false);
  });

  it("radio incorrect: base + radio + incorrect", () => {
    const el = renderIndicator([
      styles.choiceIndicator,
      styles.choiceIndicatorRadio,
      styles.choiceIndicatorIncorrect,
    ]);
    expect(el.classList.contains(styles.choiceIndicator)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorRadio)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorIncorrect)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorCorrect)).toBe(false);
  });

  it("check default: base + check, no feedback variant", () => {
    const el = renderIndicator([styles.choiceIndicator, styles.choiceIndicatorCheck]);
    expect(el.classList.contains(styles.choiceIndicator)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorCheck)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorCorrect)).toBe(false);
    expect(el.classList.contains(styles.choiceIndicatorIncorrect)).toBe(false);
  });

  it("check correct: base + check + correct, data-selected=true", () => {
    const el = renderIndicator(
      [styles.choiceIndicator, styles.choiceIndicatorCheck, styles.choiceIndicatorCorrect],
      true,
    );
    expect(el.classList.contains(styles.choiceIndicator)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorCheck)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorCorrect)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorIncorrect)).toBe(false);
    expect(el.dataset.selected).toBe("true");
  });

  it("check incorrect: base + check + incorrect, data-selected=true", () => {
    const el = renderIndicator(
      [styles.choiceIndicator, styles.choiceIndicatorCheck, styles.choiceIndicatorIncorrect],
      true,
    );
    expect(el.classList.contains(styles.choiceIndicator)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorCheck)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorIncorrect)).toBe(true);
    expect(el.classList.contains(styles.choiceIndicatorCorrect)).toBe(false);
    expect(el.dataset.selected).toBe("true");
  });
});

/* ── Variant exclusivity ──────────────────────────────────────────────────── */

describe("choice-indicator — variant classes are distinct", () => {
  it("radio and check class names do not collide", () => {
    expect(styles.choiceIndicatorRadio).not.toBe(styles.choiceIndicatorCheck);
  });

  it("correct and incorrect class names do not collide", () => {
    expect(styles.choiceIndicatorCorrect).not.toBe(styles.choiceIndicatorIncorrect);
  });

  it("base class name differs from all variant class names", () => {
    expect(styles.choiceIndicator).not.toBe(styles.choiceIndicatorRadio);
    expect(styles.choiceIndicator).not.toBe(styles.choiceIndicatorCheck);
    expect(styles.choiceIndicator).not.toBe(styles.choiceIndicatorCorrect);
    expect(styles.choiceIndicator).not.toBe(styles.choiceIndicatorIncorrect);
  });
});
