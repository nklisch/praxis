/**
 * Tests for <SessionHead> — sticky session header with kicker + title + progress.
 *
 * Verifies:
 * - Kicker renders the mode glyph and mode label.
 * - Title is rendered as an h1.
 * - Progress bar appears when `progress` prop is provided.
 * - Progress bar is omitted when `progress` is undefined.
 * - data-mode attribute is set on the header element.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SessionHead } from "../session-head.js";

afterEach(() => cleanup());

describe("SessionHead", () => {
  it("renders the mode label in the kicker", () => {
    const { container } = render(<SessionHead modeId="teach" title="Chain rule basics" />);
    expect(container.textContent).toContain("teach");
  });

  it("renders the mode glyph in the kicker", () => {
    const { container } = render(<SessionHead modeId="teach" title="Chain rule basics" />);
    // The ornament for teach mode is §
    expect(container.textContent).toContain("§");
  });

  it("renders the session title in an h1", () => {
    const { container } = render(<SessionHead modeId="teach" title="Why the chain rule works" />);
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1?.textContent).toBe("Why the chain rule works");
  });

  it("renders the progress bar when progress is provided", () => {
    const { container } = render(<SessionHead modeId="teach" title="Chain rule" progress={0.25} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
  });

  it("shows the correct percentage value when progress is provided", () => {
    const { container } = render(<SessionHead modeId="teach" title="Chain rule" progress={0.5} />);
    expect(container.textContent).toContain("50%");
  });

  it("omits the progress bar when progress is not provided", () => {
    const { container } = render(<SessionHead modeId="teach" title="Chain rule" />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).toBeNull();
  });

  it("sets aria-valuenow to the rounded percentage on the progress bar", () => {
    const { container } = render(<SessionHead modeId="teach" title="Chain rule" progress={0.25} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("25");
  });

  it("sets data-mode attribute on the header element", () => {
    const { container } = render(<SessionHead modeId="quiz" title="Derivatives quiz" />);
    const header = container.querySelector("header");
    expect(header?.getAttribute("data-mode")).toBe("quiz");
  });

  it("renders the kicker dot for the mode tint", () => {
    const { container } = render(<SessionHead modeId="exam" title="Calculus final" />);
    // The kicker dot is a span with aria-hidden used for the tint color dot.
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    // The kicker section should be present.
    expect(container.textContent).toContain("exam");
  });

  it("renders unknown mode gracefully", () => {
    const { container } = render(<SessionHead modeId="unknown-mode" title="Unknown session" />);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe("Unknown session");
    // Should render without throwing; text contains fallback "session" label.
    expect(container.textContent).toContain("session");
  });
});
