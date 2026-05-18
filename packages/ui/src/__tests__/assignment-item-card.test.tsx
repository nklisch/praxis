/**
 * Unit tests for AssignmentItemCard component.
 *
 * Verifies:
 *  - Each item kind renders its appropriate input control.
 *  - workRubric items show the "partial credit available" badge and work textarea.
 *  - Radio buttons appear for single-choice items.
 *  - disabled prop disables all inputs.
 *  - Confidence band renders when onConfidenceChange is provided.
 */
import type { AssignmentItem, ConfidenceBand } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssignmentItemCard } from "../components/assignment-item-card.js";

afterEach(() => {
  cleanup();
});

function makeItem(overrides: Partial<AssignmentItem>): AssignmentItem {
  return {
    id: "test-item-1",
    kind: "short-answer",
    prompt: "What is 2 + 2?",
    acceptedAnswers: ["4"],
    ...overrides,
  };
}

const defaultProps = {
  index: 0,
  response: "",
  onResponseChange: () => {},
};

describe("AssignmentItemCard", () => {
  it("renders the item prompt", () => {
    const item = makeItem({ prompt: "What is the speed of light?" });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    expect(screen.getByText("What is the speed of light?")).toBeDefined();
  });

  it("renders item number (1-based)", () => {
    const item = makeItem({});
    render(<AssignmentItemCard item={item} index={2} response="" onResponseChange={() => {}} />);
    expect(screen.getByText("Item 3")).toBeDefined();
  });

  it("renders kind badge", () => {
    const item = makeItem({ kind: "short-answer" });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    expect(screen.getByText("short-answer")).toBeDefined();
  });

  it("renders text input for short-answer items", () => {
    const item = makeItem({ kind: "short-answer", acceptedAnswers: ["4"] });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("renders text input for math items", () => {
    const item = makeItem({
      kind: "math",
      expectedSolution: { variable: "x", value: "3" },
    });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("renders radio buttons for single-choice items", () => {
    const item = makeItem({
      kind: "single-choice",
      options: ["Option A", "Option B", "Option C"],
      correctOptionIndex: 0,
    });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(screen.getByText("Option A")).toBeDefined();
    expect(screen.getByText("Option B")).toBeDefined();
    expect(screen.getByText("Option C")).toBeDefined();
  });

  it("renders textarea for free-response items", () => {
    const item = makeItem({ kind: "free-response" });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    const textareas = screen.getAllByRole("textbox");
    expect(textareas.length).toBeGreaterThan(0);
  });

  it("renders textarea for code items", () => {
    const item = makeItem({
      kind: "code",
      language: "python",
      testCases: [{ expectedStdout: "Hello", stdin: "" }],
    });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    const textareas = screen.getAllByRole("textbox");
    expect(textareas.length).toBeGreaterThan(0);
  });

  it("shows partial credit badge for items with workRubric", () => {
    const item = makeItem({
      kind: "math",
      expectedSolution: { variable: "x", value: "3" },
      workRubric: {
        criteria: [{ id: "process", description: "Steps", weight: 1.0 }],
        maxScore: 10,
      },
    });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    expect(screen.getByText(/partial credit available/i)).toBeDefined();
  });

  it("shows 'Show your work' textarea for math items with workRubric", () => {
    const item = makeItem({
      kind: "math",
      expectedSolution: { variable: "x", value: "3" },
      workRubric: {
        criteria: [{ id: "process", description: "Steps", weight: 1.0 }],
        maxScore: 10,
      },
    });
    render(<AssignmentItemCard item={item} {...defaultProps} work="" onWorkChange={() => {}} />);
    expect(screen.getByText(/show your work/i)).toBeDefined();
  });

  it("does NOT show partial credit badge for items without workRubric", () => {
    const item = makeItem({ kind: "math", expectedSolution: { variable: "x", value: "3" } });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    expect(screen.queryByText(/partial credit available/i)).toBeNull();
  });

  it("disables inputs when disabled prop is true", () => {
    const item = makeItem({ kind: "short-answer", acceptedAnswers: ["4"] });
    render(<AssignmentItemCard item={item} {...defaultProps} disabled={true} />);
    const inputs = screen.getAllByRole("textbox");
    for (const input of inputs) {
      expect((input as HTMLInputElement).disabled).toBe(true);
    }
  });

  it("shows correct radio selection for single-choice when response matches option index", () => {
    const item = makeItem({
      kind: "single-choice",
      options: ["A", "B", "C"],
      correctOptionIndex: 1,
    });
    render(<AssignmentItemCard item={item} {...defaultProps} response="1" />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios[0]?.checked).toBe(false);
    expect(radios[1]?.checked).toBe(true);
    expect(radios[2]?.checked).toBe(false);
  });
});

describe("AssignmentItemCard — confidence band", () => {
  it("does NOT render the confidence band when onConfidenceChange is absent", () => {
    const item = makeItem({ kind: "short-answer", acceptedAnswers: ["4"] });
    render(<AssignmentItemCard item={item} {...defaultProps} />);
    // fieldset is rendered as a "group" role; none should be present without the prop
    expect(screen.queryByText(/confidence in this answer/i)).toBeNull();
    expect(screen.queryByText("guessed")).toBeNull();
  });

  it("renders 4 confidence pips when onConfidenceChange is provided", () => {
    const item = makeItem({ kind: "short-answer", acceptedAnswers: ["4"] });
    render(
      <AssignmentItemCard
        item={item}
        {...defaultProps}
        confidence={null}
        onConfidenceChange={() => {}}
      />,
    );
    // The fieldset legend should be visible
    expect(screen.getByText(/confidence in this answer/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "guessed" })).toBeDefined();
    expect(screen.getByRole("button", { name: "unsure" })).toBeDefined();
    expect(screen.getByRole("button", { name: "pretty sure" })).toBeDefined();
    expect(screen.getByRole("button", { name: "certain" })).toBeDefined();
  });

  it("selected pip has aria-pressed=true, others false", () => {
    const item = makeItem({ kind: "short-answer", acceptedAnswers: ["4"] });
    render(
      <AssignmentItemCard
        item={item}
        {...defaultProps}
        confidence={"pretty_sure" as ConfidenceBand}
        onConfidenceChange={() => {}}
      />,
    );
    expect(
      (screen.getByRole("button", { name: "pretty sure" }) as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(
      (screen.getByRole("button", { name: "guessed" }) as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");
  });

  it("calls onConfidenceChange with the selected band value", () => {
    const item = makeItem({ kind: "single-choice", options: ["A", "B"], correctOptionIndex: 0 });
    const onConfidenceChange = vi.fn();
    render(
      <AssignmentItemCard
        item={item}
        {...defaultProps}
        confidence={null}
        onConfidenceChange={onConfidenceChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "certain" }));
    expect(onConfidenceChange).toHaveBeenCalledWith("certain");
  });

  it("confidence pips are disabled when disabled=true", () => {
    const item = makeItem({ kind: "short-answer", acceptedAnswers: ["4"] });
    render(
      <AssignmentItemCard
        item={item}
        {...defaultProps}
        confidence={null}
        onConfidenceChange={() => {}}
        disabled={true}
      />,
    );
    const pips = ["guessed", "unsure", "pretty sure", "certain"];
    for (const name of pips) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
