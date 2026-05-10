import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThinkingIndicator } from "../thinking-indicator.js";

afterEach(() => cleanup());

describe("ThinkingIndicator", () => {
  it("renders the 'Thinking' label text", () => {
    const { container } = render(<ThinkingIndicator />);
    expect(container.textContent).toContain("Thinking");
  });

  it("has aria-live='polite' for screen readers", () => {
    const { container } = render(<ThinkingIndicator />);
    const el = container.querySelector("p");
    expect(el?.getAttribute("aria-live")).toBe("polite");
  });

  it("has aria-atomic='true' for atomic live region announcement", () => {
    const { container } = render(<ThinkingIndicator />);
    const el = container.querySelector("p");
    expect(el?.getAttribute("aria-atomic")).toBe("true");
  });

  it("renders three dot spans (aria-hidden)", () => {
    const { container } = render(<ThinkingIndicator />);
    // The dots wrapper has aria-hidden="true"; query its children via DOM.
    const dotsWrapper = container.querySelector('[aria-hidden="true"]');
    expect(dotsWrapper).not.toBeNull();
    // Three inner spans.
    const dots = dotsWrapper?.querySelectorAll("span");
    expect(dots?.length).toBe(3);
  });

  it("renders with compact variant without error", () => {
    const { container } = render(<ThinkingIndicator variant="compact" />);
    expect(container.textContent).toContain("Thinking");
  });
});
