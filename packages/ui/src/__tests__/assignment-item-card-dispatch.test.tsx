/**
 * Dispatch tests for AssignmentItemCard.
 *
 * Verifies that the refactored switch-based dispatch renders the correct
 * per-kind body control for each of the ten item kinds.
 */
import type { AssignmentItem } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssignmentItemCard } from "../components/assignment-item-card.js";

afterEach(() => {
  cleanup();
});

const noop = () => {};

function renderItem(item: AssignmentItem) {
  render(<AssignmentItemCard item={item} index={0} response="" onResponseChange={noop} />);
}

describe("AssignmentItemCard dispatch", () => {
  it("single-choice — renders radio buttons", () => {
    renderItem({
      kind: "single-choice",
      id: "sc1",
      prompt: "Pick one",
      options: ["A", "B"],
      correctOptionIndex: 0,
    });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("multi-select — renders checkboxes", () => {
    renderItem({
      kind: "multi-select",
      id: "ms1",
      prompt: "Pick all",
      options: ["X", "Y", "Z"],
      correctOptionIndices: [0, 2],
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("short-answer — renders text input", () => {
    renderItem({
      kind: "short-answer",
      id: "sa1",
      prompt: "Spell it out",
      acceptedAnswers: ["hello"],
    });
    // aria-label "short answer"
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("free-response — renders textarea", () => {
    renderItem({
      kind: "free-response",
      id: "fr1",
      prompt: "Explain in depth",
    });
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("math — renders text input for the answer", () => {
    renderItem({
      kind: "math",
      id: "m1",
      prompt: "Solve x",
      expectedSolution: { variable: "x", value: "3" },
    });
    // math input has aria-label "math answer"
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("code — renders textarea", () => {
    renderItem({
      kind: "code",
      id: "c1",
      prompt: "Write a function",
      language: "python",
      testCases: [{ expectedStdout: "ok" }],
    });
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("numerical — renders number input", () => {
    renderItem({
      kind: "numerical",
      id: "n1",
      prompt: "What is the mass?",
      expectedValue: 9.81,
    });
    expect(screen.getByRole("spinbutton")).toBeDefined();
  });

  it("numerical with units — renders both inputs", () => {
    renderItem({
      kind: "numerical",
      id: "n2",
      prompt: "Speed of light?",
      expectedValue: 3e8,
      expectedUnits: "m/s",
    });
    // one spinbutton for value, one textbox for units
    expect(screen.getByRole("spinbutton")).toBeDefined();
    expect(screen.getByPlaceholderText("m/s")).toBeDefined();
  });

  it("matching — renders the matching UI (dropdown fallback in jsdom)", () => {
    renderItem({
      kind: "matching",
      id: "mt1",
      prompt: "Match the pairs",
      leftItems: [{ id: "l1", text: "Dog" }],
      rightItems: [{ id: "r1", text: "Woof" }],
      correctPairs: [{ leftId: "l1", rightId: "r1" }],
    });
    // In jsdom window.matchMedia returns matches: false (pointer is not coarse,
    // no reduced motion), so the DnD mode renders. The left item text is visible.
    expect(screen.getByText("Dog")).toBeDefined();
    expect(screen.getByText("Woof")).toBeDefined();
  });

  it("ordering — renders ordered list items with move buttons", () => {
    renderItem({
      kind: "ordering",
      id: "or1",
      prompt: "Put in order",
      items: [
        { id: "a", text: "First" },
        { id: "b", text: "Second" },
      ],
      correctOrder: ["a", "b"],
    });
    expect(screen.getByText("First")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
    // Each item has up/down buttons
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("two-tier — renders tier-1 radios and hides tier-2 initially", () => {
    renderItem({
      kind: "two-tier",
      id: "tt1",
      prompt: "What is the answer?",
      options: ["Yes", "No"],
      correctOptionIndex: 0,
      reasonPrompt: "Why?",
      reasonOptions: ["Because A", "Because B"],
      correctReasonIndex: 0,
      misconceptionByReasonIndex: [null, "mc-1"],
    });
    // Tier-1 radios visible
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    // Tier-2 section is hidden (aria-hidden on the wrapper)
    const tier2 = document.querySelector('[aria-hidden="true"]');
    expect(tier2).not.toBeNull();
  });

  it("renders item number header", () => {
    renderItem({
      kind: "short-answer",
      id: "hdr",
      prompt: "p",
      acceptedAnswers: [],
    });
    expect(screen.getByText("Item 1")).toBeDefined();
  });

  it("shows partial credit badge for math with workRubric", () => {
    renderItem({
      kind: "math",
      id: "math-wk",
      prompt: "Show work",
      expectedSolution: { variable: "x", value: "1" },
      workRubric: { criteria: [{ id: "c", description: "d", weight: 1 }], maxScore: 10 },
    });
    expect(screen.getByText(/partial credit available/i)).toBeDefined();
  });
});
