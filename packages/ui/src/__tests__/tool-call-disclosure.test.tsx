import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToolCallDisclosure } from "../components/tool-call-disclosure.js";

afterEach(() => cleanup());

describe("ToolCallDisclosure", () => {
  // ── Collapsed header ───────────────────────────────────────────────────────

  it("renders the tool name in the summary", () => {
    render(
      <ToolCallDisclosure toolName="grade_math" verdict="ok" output={{ score: 10, total: 10 }} />,
    );
    expect(screen.getByText("grade_math")).toBeDefined();
  });

  it("renders the ok verdict glyph (✓) when verdict is ok", () => {
    const { container } = render(
      <ToolCallDisclosure toolName="grade_math" verdict="ok" output={{ score: 10 }} />,
    );
    const glyph = container.querySelector("[aria-hidden='true']");
    expect(glyph?.textContent).toContain("✓");
  });

  it("renders the error verdict glyph (⊘) when verdict is error", () => {
    const { container } = render(
      <ToolCallDisclosure toolName="grade_math" verdict="error" errorMessage="Something failed" />,
    );
    // First aria-hidden span is the glyph
    const glyphs = container.querySelectorAll("[aria-hidden='true']");
    const glyphTexts = Array.from(glyphs).map((g) => g.textContent);
    expect(glyphTexts.some((t) => t?.includes("⊘"))).toBe(true);
  });

  it("renders the running verdict glyph (…) when verdict is running", () => {
    const { container } = render(<ToolCallDisclosure toolName="grade_math" verdict="running" />);
    const glyphs = container.querySelectorAll("[aria-hidden='true']");
    const glyphTexts = Array.from(glyphs).map((g) => g.textContent);
    expect(glyphTexts.some((t) => t?.includes("…"))).toBe(true);
  });

  it("renders a result preview derived from the output summarizer", () => {
    render(
      <ToolCallDisclosure
        toolName="retrieve_from_documents"
        verdict="ok"
        output={{ citations: [{ documentId: "d1", page: 1, snippet: "s" }] }}
      />,
    );
    // summarize returns "Cited document — 1 result"
    expect(screen.getByText(/Cited document — 1 result/)).toBeDefined();
  });

  it("renders a fallback result preview using label.past when no summarizer", () => {
    // record_misconception has past: "Logged a misunderstanding" and no summarize fn
    render(<ToolCallDisclosure toolName="record_misconception" verdict="ok" />);
    expect(screen.getByText(/Logged a misunderstanding/)).toBeDefined();
  });

  it("renders the error message as result preview when verdict is error", () => {
    render(
      <ToolCallDisclosure
        toolName="grade_math"
        verdict="error"
        errorMessage="Tool invocation failed."
      />,
    );
    // errorMessage appears in the collapsed summary preview AND in the expanded detail
    const matches = screen.getAllByText(/Tool invocation failed\./);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a chevron in the summary", () => {
    const { container } = render(<ToolCallDisclosure toolName="grade_math" verdict="ok" />);
    // chevron span has aria-hidden="true"
    const ariaHiddenSpans = container.querySelectorAll("[aria-hidden='true']");
    const texts = Array.from(ariaHiddenSpans).map((s) => s.textContent);
    expect(texts.some((t) => t?.includes("▾"))).toBe(true);
  });

  // ── Expand / collapse via native <details> ─────────────────────────────────

  it("is collapsed by default (no [open] attribute)", () => {
    const { container } = render(
      <ToolCallDisclosure
        toolName="grade_math"
        verdict="ok"
        input={{ expr: "x^2" }}
        output={{ score: 10 }}
      />,
    );
    const details = container.querySelector("details");
    expect(details?.hasAttribute("open")).toBe(false);
  });

  it("renders the Input section in the detail panel", () => {
    const { container } = render(
      <ToolCallDisclosure
        toolName="grade_math"
        verdict="ok"
        input={{ expr: "x^2" }}
        output={{ score: 10 }}
      />,
    );
    // The detail panel is always rendered (for native <details> open handling);
    // check that Input / Output headings appear in the DOM.
    expect(container.querySelector("h4")?.textContent).toBeDefined();
    const headings = Array.from(container.querySelectorAll("h4")).map((h) => h.textContent);
    expect(headings).toContain("Input");
    expect(headings).toContain("Output");
  });

  it("renders the error detail section when errorMessage is provided", () => {
    const { container } = render(
      <ToolCallDisclosure
        toolName="grade_math"
        verdict="error"
        errorMessage="Something went wrong."
      />,
    );
    const headings = Array.from(container.querySelectorAll("h4")).map((h) => h.textContent);
    expect(headings).toContain("Error");
    expect(screen.getByText("Something went wrong.")).toBeDefined();
  });

  it("renders no detail panel when no input / output / errorMessage", () => {
    const { container } = render(<ToolCallDisclosure toolName="grade_math" verdict="ok" />);
    // No h4 headings without detail content
    expect(container.querySelectorAll("h4")).toHaveLength(0);
  });

  // ── Hidden tools ──────────────────────────────────────────────────────────

  it("returns null for hidden tools", () => {
    const { container: c1 } = render(
      <ToolCallDisclosure toolName="flashcard.review_next" verdict="ok" />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <ToolCallDisclosure toolName="flashcard.review_next" verdict="running" />,
    );
    expect(c2.firstChild).toBeNull();

    const { container: c3 } = render(
      <ToolCallDisclosure toolName="flashcard.review_next" verdict="error" />,
    );
    expect(c3.firstChild).toBeNull();
  });

  // ── Native <details> element ──────────────────────────────────────────────

  it("renders a <details> root element", () => {
    const { container } = render(<ToolCallDisclosure toolName="grade_math" verdict="ok" />);
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe("details");
  });

  it("has a <summary> child inside <details>", () => {
    const { container } = render(<ToolCallDisclosure toolName="grade_math" verdict="ok" />);
    const details = container.querySelector("details");
    expect(details?.querySelector("summary")).not.toBeNull();
  });
});
