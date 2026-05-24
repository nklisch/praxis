/**
 * Tests for <CoverageBar>.
 *
 * Verifies:
 *  - percent=0.58 renders fill at 58% width.
 *  - percent=0 renders an empty bar (0% fill).
 *  - percent=1 renders a fully-filled bar (100% fill).
 *  - Values <0 are clamped to 0.
 *  - Values >1 are clamped to 100%.
 *  - compact prop applies the compact CSS class.
 *  - Default aria-label reflects the percentage.
 *  - Custom ariaLabel is forwarded to the progressbar.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CoverageBar } from "../components/coverage-bar.js";

afterEach(() => cleanup());

describe("CoverageBar", () => {
  it("renders a progressbar role", () => {
    render(<CoverageBar percent={0.5} />);
    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("sets fill width to 58% for percent=0.58", () => {
    render(<CoverageBar percent={0.58} />);
    const bar = screen.getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("58%");
  });

  it("sets fill width to 0% for percent=0", () => {
    render(<CoverageBar percent={0} />);
    const bar = screen.getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("sets fill width to 100% for percent=1", () => {
    render(<CoverageBar percent={1} />);
    const bar = screen.getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("clamps values below 0 to 0%", () => {
    render(<CoverageBar percent={-0.5} />);
    const bar = screen.getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("clamps values above 1 to 100%", () => {
    render(<CoverageBar percent={2.5} />);
    const bar = screen.getByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("sets aria-valuenow to the rounded percentage", () => {
    render(<CoverageBar percent={0.58} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("58");
  });

  it("sets default aria-label to 'Coverage: N%'", () => {
    render(<CoverageBar percent={0.75} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("Coverage: 75%");
  });

  it("uses custom ariaLabel when provided", () => {
    render(<CoverageBar percent={0.5} ariaLabel="Map coverage" />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("Map coverage");
  });

  it("applies compact class when compact=true", () => {
    const { container } = render(<CoverageBar percent={0.5} compact />);
    const bar = container.firstElementChild as HTMLElement;
    // CSS modules mangle class names in tests, so we check the class list contains a compact token
    // by confirming the element has two classes (base + compact modifier).
    expect(bar.className.trim().split(/\s+/).length).toBe(2);
  });

  it("does not apply compact class when compact is omitted", () => {
    const { container } = render(<CoverageBar percent={0.5} />);
    const bar = container.firstElementChild as HTMLElement;
    // Only one class (the base class) when compact is not set.
    expect(bar.className.trim().split(/\s+/).length).toBe(1);
  });
});
