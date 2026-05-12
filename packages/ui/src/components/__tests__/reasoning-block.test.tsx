import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReasoningBlock, summarize } from "../reasoning-block.js";

afterEach(() => cleanup());

describe("ReasoningBlock", () => {
  it("renders 'thinking' label when streaming", () => {
    const { container } = render(<ReasoningBlock content="" streaming={true} />);
    expect(container.textContent).toContain("thinking");
  });

  it("renders 'thought' label when not streaming", () => {
    const { container } = render(<ReasoningBlock content="Some reasoning." streaming={false} />);
    expect(container.textContent).toContain("thought");
  });

  it("empty content renders just 'thinking' with no 'about' text", () => {
    const { container } = render(<ReasoningBlock content="" streaming={true} />);
    expect(container.textContent).not.toContain("about");
  });

  it("non-empty content renders 'thinking about <summary>'", () => {
    const { container } = render(
      <ReasoningBlock content="Let me analyze the problem." streaming={true} />,
    );
    expect(container.textContent).toContain("about");
    expect(container.textContent).toContain("Let me analyze the problem");
  });

  it("starts collapsed — body content not visible", () => {
    const { queryByText } = render(
      <ReasoningBlock content="Full reasoning text here." streaming={false} />,
    );
    // Body text should not be visible (not rendered) until expanded.
    expect(queryByText("Full reasoning text here.")).toBeNull();
  });

  it("click expands to show full content", () => {
    const { getByRole, queryByText } = render(
      <ReasoningBlock content="Full reasoning text here." streaming={false} />,
    );
    const button = getByRole("button");
    fireEvent.click(button);
    expect(queryByText("Full reasoning text here.")).not.toBeNull();
  });

  it("click again collapses", () => {
    const { getByRole, queryByText } = render(
      <ReasoningBlock content="Full reasoning text here." streaming={false} />,
    );
    const button = getByRole("button");
    // Expand
    fireEvent.click(button);
    expect(queryByText("Full reasoning text here.")).not.toBeNull();
    // Collapse
    fireEvent.click(button);
    expect(queryByText("Full reasoning text here.")).toBeNull();
  });

  it("aria-expanded toggles on click", () => {
    const { getByRole } = render(<ReasoningBlock content="Reasoning." streaming={false} />);
    const button = getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows live dot indicator when streaming", () => {
    const { container } = render(<ReasoningBlock content="Thinking..." streaming={true} />);
    // The live dot span has aria-hidden="true"; verify it's present in the DOM.
    const ariaHiddens = container.querySelectorAll('[aria-hidden="true"]');
    // One for chevron, one for live dot.
    expect(ariaHiddens.length).toBeGreaterThanOrEqual(2);
  });

  it("no live dot indicator when not streaming", () => {
    const { container } = render(<ReasoningBlock content="Done thinking." streaming={false} />);
    // Chevron is aria-hidden but the live dot should not appear.
    // The text content should not contain the middle dot character.
    // We check that there's only 1 aria-hidden element (just the chevron).
    const ariaHiddens = container.querySelectorAll('[aria-hidden="true"]');
    expect(ariaHiddens.length).toBe(1);
  });
});

describe("summarize", () => {
  it("returns empty string for empty content", () => {
    expect(summarize("")).toBe("");
  });

  it("returns empty string for whitespace-only content", () => {
    expect(summarize("   \n  ")).toBe("");
  });

  it("returns the first sentence without trailing period", () => {
    expect(summarize("Let me think. And then some more.")).toBe("Let me think");
  });

  it("truncates to 60 chars with ellipsis", () => {
    const longText =
      "This is a very long sentence that goes well beyond sixty characters for sure.";
    const result = summarize(longText);
    expect(result.length).toBeLessThanOrEqual(63); // 60 + "…" (1 char)
    expect(result.endsWith("…")).toBe(true);
  });

  it("strips markdown chars", () => {
    expect(summarize("**Bold** and _italic_ text here.")).toBe("Bold and italic text here");
  });

  it("strips backticks", () => {
    expect(summarize("`code` block appears here.")).toBe("code block appears here");
  });

  it("strips hash characters", () => {
    expect(summarize("# Heading text")).toBe("Heading text");
  });

  it("collapses multiple spaces", () => {
    expect(summarize("lots   of   spaces here.")).toBe("lots of spaces here");
  });

  it("returns first clause at newline boundary", () => {
    expect(summarize("First line\nSecond line")).toBe("First line");
  });

  it("short content returns as-is without ellipsis", () => {
    const short = "Short thought";
    expect(summarize(short)).toBe("Short thought");
    expect(summarize(short).endsWith("…")).toBe(false);
  });
});
