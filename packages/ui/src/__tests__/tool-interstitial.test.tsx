import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolInterstitial } from "../components/tool-interstitial.js";

describe("ToolInterstitial", () => {
  it("renders in-flight state with present-progressive text and animated dots", () => {
    const { container } = render(<ToolInterstitial toolName="grade_math" status="in_flight" />);

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

  it("renders settled-with-past state using past-tense copy", () => {
    render(<ToolInterstitial toolName="grade_math" status="settled" />);
    expect(screen.getByText("Graded")).toBeDefined();
    // No aria-live on settled
    const p = screen.getByText("Graded").closest("p");
    expect(p?.getAttribute("aria-live")).toBeNull();
  });

  it("returns null for settled-without-past (silent collapse)", () => {
    const { container } = render(<ToolInterstitial toolName="note.create" status="settled" />);
    // note.create has no `past` → should render nothing
    expect(container.firstChild).toBeNull();
  });

  it("renders errored state with pedagogical error copy", () => {
    render(<ToolInterstitial toolName="grade_math" status="settled" errored={true} />);
    // "Couldn't finish grading your work."
    const text = screen.getByText(/Couldn't finish grading your work/i);
    expect(text).toBeDefined();
  });

  it("returns null for hidden tools regardless of status", () => {
    const { container: c1 } = render(
      <ToolInterstitial toolName="flashcard.review_next" status="in_flight" />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <ToolInterstitial toolName="flashcard.review_next" status="settled" />,
    );
    expect(c2.firstChild).toBeNull();

    const { container: c3 } = render(
      <ToolInterstitial toolName="quick_check.single_choice" status="in_flight" />,
    );
    expect(c3.firstChild).toBeNull();
  });

  it("does not render any img, svg, or role=img elements", () => {
    const { container } = render(
      <ToolInterstitial toolName="retrieve_from_textbook" status="in_flight" />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("svg")).toHaveLength(0);
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(0);
  });

  it("does not render bubble-style elements (root is a p, no nested divs)", () => {
    const { container } = render(<ToolInterstitial toolName="grade_math" status="in_flight" />);
    // The root element should be a <p>, not a bubble container <div>
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe("p");
    // No nested divs
    expect(container.querySelectorAll("div")).toHaveLength(0);
  });

  it("renders a humanized fallback for unknown tools in in-flight state", () => {
    render(<ToolInterstitial toolName="future_unknown_tool" status="in_flight" />);
    expect(screen.getByText("Future unknown tool")).toBeDefined();
  });

  it("retrieve_from_textbook settled shows 'Cited textbook' past copy", () => {
    render(<ToolInterstitial toolName="retrieve_from_textbook" status="settled" />);
    expect(screen.getByText("Cited textbook")).toBeDefined();
  });
});
