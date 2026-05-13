import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolEntry } from "../components/tool-entry.js";

describe("ToolEntry", () => {
  // ── In-flight state ───────────────────────────────────────────────────────

  it("renders in-flight state with present-progressive text and animated dots", () => {
    const { container } = render(<ToolEntry toolName="grade_math" status="in_flight" />);

    expect(screen.getByText("Grading your work")).toBeDefined();
    // aria-live on the paragraph
    const p = container.querySelector("p");
    expect(p?.getAttribute("aria-live")).toBe("polite");
    // Three dot spans (aria-hidden wrapper contains them)
    const dotWrapper = container.querySelector("[aria-hidden='true']");
    expect(dotWrapper).toBeDefined();
    const dots = dotWrapper?.querySelectorAll("span");
    expect(dots).toHaveLength(3);
  });

  it("in-flight state has no disclosure button", () => {
    const { container } = render(<ToolEntry toolName="grade_math" status="in_flight" />);
    expect(container.querySelector("button")).toBeNull();
  });

  // ── Settled state ─────────────────────────────────────────────────────────

  it("renders settled state collapsed by default with a disclosure button", () => {
    const { container } = render(<ToolEntry toolName="grade_math" status="settled" />);
    // The disclosure button has type="button" (not a <summary> element)
    const button = container.querySelector("button[type='button']");
    expect(button).toBeDefined();
    // Default collapsed: aria-expanded false
    expect(button?.getAttribute("aria-expanded")).toBe("false");
  });

  it("settled: clicking the summary expands to show details", () => {
    const { container } = render(
      <ToolEntry
        toolName="grade_math"
        status="settled"
        input={{ expr: "x^2" }}
        output={{ score: 1 }}
      />,
    );
    const button = container.querySelector("button[type='button']");
    expect(button).toBeDefined();
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button as HTMLElement);
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    // details panel appears
    expect(container.querySelector("details")).toBeDefined();
  });

  it("settled: expanded view shows Input and Output sections", () => {
    const { container } = render(
      <ToolEntry
        toolName="grade_math"
        status="settled"
        input={{ expr: "x^2" }}
        output={{ score: 10, total: 10 }}
      />,
    );
    const button = container.querySelector("button[type='button']");
    fireEvent.click(button as HTMLElement);
    // Check that <details> elements with <summary> "Input" and "Output" appear
    const detailsSummaries = container.querySelectorAll("details > summary");
    const summaryTexts = Array.from(detailsSummaries).map((s) => s.textContent);
    expect(summaryTexts).toContain("Input");
    expect(summaryTexts).toContain("Output");
  });

  it("settled: collapses again after second click", () => {
    const { container } = render(
      <ToolEntry toolName="grade_math" status="settled" input={{ expr: "x^2" }} output={{}} />,
    );
    const button = container.querySelector("button[type='button']");
    expect(button).toBeDefined();
    fireEvent.click(button as HTMLElement);
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button as HTMLElement);
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("details")).toBeNull();
  });

  it("settled with no details: button is disabled and disclosure is '·'", () => {
    // note.create has no past, no summarizer, and no input/output passed in.
    const { container } = render(<ToolEntry toolName="note.create" status="settled" />);
    const button = container.querySelector("button[type='button']");
    expect(button).toBeDefined();
    expect(button).toHaveProperty("disabled", true);
    // disclosure character for entries with no details
    const disclosure = button?.querySelector("[aria-hidden='true']");
    expect(disclosure?.textContent).toBe("·");
  });

  it("retrieve_from_documents settled with output shows citation count summary", () => {
    render(
      <ToolEntry
        toolName="retrieve_from_documents"
        status="settled"
        output={{ citations: [{ documentId: "d1", page: 1, snippet: "s" }] }}
      />,
    );
    expect(screen.getByText("Cited document — 1 result")).toBeDefined();
  });

  it("retrieve_from_documents settled with multiple citations shows plural", () => {
    render(
      <ToolEntry
        toolName="retrieve_from_documents"
        status="settled"
        output={{
          citations: [
            { documentId: "d1", page: 1, snippet: "s" },
            { documentId: "d2", page: 2, snippet: "t" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Cited document — 2 results")).toBeDefined();
  });

  // ── Errored state ─────────────────────────────────────────────────────────

  it("renders errored state with pedagogical error copy (collapsed)", () => {
    const { container } = render(
      <ToolEntry toolName="grade_math" status="errored" errorMessage="Something went wrong" />,
    );
    expect(screen.getByText(/Couldn't finish grading your work/i)).toBeDefined();
    const button = container.querySelector("button[type='button']");
    expect(button?.getAttribute("aria-expanded")).toBe("false");
  });

  it("errored: clicking expands to show Error section", () => {
    const { container } = render(
      <ToolEntry toolName="grade_math" status="errored" errorMessage="Tool invocation failed." />,
    );
    const button = container.querySelector("button[type='button']");
    fireEvent.click(button as HTMLElement);
    expect(screen.getByText("Error")).toBeDefined();
    expect(screen.getByText("Tool invocation failed.")).toBeDefined();
  });

  // ── Hidden tools ──────────────────────────────────────────────────────────

  it("returns null for hidden tools regardless of status", () => {
    const { container: c1 } = render(
      <ToolEntry toolName="flashcard.review_next" status="in_flight" />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <ToolEntry toolName="flashcard.review_next" status="settled" />,
    );
    expect(c2.firstChild).toBeNull();

    const { container: c3 } = render(
      <ToolEntry toolName="quick_check.single_choice" status="in_flight" />,
    );
    expect(c3.firstChild).toBeNull();

    const { container: c4 } = render(
      <ToolEntry toolName="flashcard.review_next" status="errored" />,
    );
    expect(c4.firstChild).toBeNull();
  });

  // ── Misc ──────────────────────────────────────────────────────────────────

  it("does not render any img, svg, or role=img elements in in-flight state", () => {
    const { container } = render(
      <ToolEntry toolName="retrieve_from_documents" status="in_flight" />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("svg")).toHaveLength(0);
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(0);
  });

  it("in-flight renders a <p> root element", () => {
    const { container } = render(<ToolEntry toolName="grade_math" status="in_flight" />);
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe("p");
  });

  it("settled renders a <div> root element (not a plain <p>)", () => {
    const { container } = render(<ToolEntry toolName="grade_math" status="settled" />);
    // settled/errored wrap in a div to allow the expandable details
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe("div");
  });

  it("renders a humanized fallback for unknown tools in in-flight state", () => {
    render(<ToolEntry toolName="future_unknown_tool" status="in_flight" />);
    expect(screen.getByText("Future unknown tool")).toBeDefined();
  });

  it("settled: unknown tool with no past shows present-tense text as summary", () => {
    const { container } = render(<ToolEntry toolName="future_unknown_tool" status="settled" />);
    // Two renders in same test context can cause duplicate text — use container query
    const button = container.querySelector("button[type='button']");
    expect(button?.textContent).toContain("Future unknown tool");
  });
});
