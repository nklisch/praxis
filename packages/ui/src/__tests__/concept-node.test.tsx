import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ConceptNodeData } from "../components/concept-node.js";
import { ConceptNodeDisplay } from "../components/concept-node.js";

// Test ConceptNodeDisplay rather than ConceptNode to avoid needing a ReactFlowProvider
// (ConceptNode wraps Handle components which require the zustand store context).
// ConceptNodeDisplay contains all the visual logic under test.

afterEach(() => {
  cleanup();
});

function renderNode(data: ConceptNodeData) {
  return render(<ConceptNodeDisplay data={data} />);
}

describe("ConceptNode", () => {
  describe("mastered tone", () => {
    it("renders the concept name", () => {
      renderNode({ name: "Linear Equations", mastery: 0.75, studied: true, locked: false });
      expect(screen.getByText("Linear Equations")).toBeDefined();
    });

    it("applies mastered class when mastery >= 0.7", () => {
      const { container } = renderNode({
        name: "Algebra",
        mastery: 0.8,
        studied: true,
        locked: false,
      });
      const node = container.querySelector("[data-tone='mastered']");
      expect(node).toBeTruthy();
    });

    it("shows mastery score in mastered state", () => {
      renderNode({ name: "Algebra", mastery: 0.85, studied: true, locked: false });
      // Score is rendered as toFixed(2)
      expect(screen.getByText(/0\.85/)).toBeDefined();
    });

    it("shows a check mark for mastered concepts", () => {
      renderNode({ name: "Algebra", mastery: 0.9, studied: true, locked: false });
      // The check mark is ✓
      expect(screen.getByText(/✓/)).toBeDefined();
    });
  });

  describe("in-progress tone", () => {
    it("applies in-progress class when 0 < mastery < 0.7", () => {
      const { container } = renderNode({
        name: "Fractions",
        mastery: 0.4,
        studied: true,
        locked: false,
      });
      const node = container.querySelector("[data-tone='in-progress']");
      expect(node).toBeTruthy();
    });

    it("shows the mastery score", () => {
      renderNode({ name: "Fractions", mastery: 0.4, studied: true, locked: false });
      expect(screen.getByText(/0\.40/)).toBeDefined();
    });
  });

  describe("not-started tone", () => {
    it("applies not-started class when mastery == 0 and not locked", () => {
      const { container } = renderNode({
        name: "Calculus",
        mastery: 0,
        studied: false,
        locked: false,
      });
      const node = container.querySelector("[data-tone='not-started']");
      expect(node).toBeTruthy();
    });

    it("shows 0.00 score", () => {
      renderNode({ name: "Calculus", mastery: 0, studied: false, locked: false });
      expect(screen.getByText(/0\.00/)).toBeDefined();
    });
  });

  describe("locked tone", () => {
    it("applies locked class when locked is true", () => {
      const { container } = renderNode({
        name: "Word Problems",
        mastery: 0,
        studied: false,
        locked: true,
      });
      const node = container.querySelector("[data-tone='locked']");
      expect(node).toBeTruthy();
    });

    it("shows lock icon for locked concepts", () => {
      renderNode({ name: "Word Problems", mastery: 0, studied: false, locked: true });
      // The lock icon is 🔒 with aria-label "locked"
      const lockIcon = screen.getByLabelText("locked");
      expect(lockIcon).toBeTruthy();
    });

    it("does not show mastery score when locked", () => {
      renderNode({ name: "Word Problems", mastery: 0, studied: false, locked: true });
      // No score element should appear
      expect(screen.queryByText(/0\.00/)).toBeNull();
    });

    it("locked overrides mastered tone even when mastery >= 0.7", () => {
      // Edge case: a concept might have high mastery but its lesson is still locked.
      const { container } = renderNode({
        name: "Advanced Topic",
        mastery: 0.9,
        studied: true,
        locked: true,
      });
      const node = container.querySelector("[data-tone='locked']");
      expect(node).toBeTruthy();
      // No mastered node
      expect(container.querySelector("[data-tone='mastered']")).toBeNull();
    });
  });

  it("renders the concept name in all tones", () => {
    const { rerender } = renderNode({
      name: "Concept X",
      mastery: 0,
      studied: false,
      locked: false,
    });
    expect(screen.getByText("Concept X")).toBeDefined();

    rerender(
      <ConceptNodeDisplay
        data={{ name: "Concept X", mastery: 0.5, studied: true, locked: false }}
      />,
    );
    expect(screen.getByText("Concept X")).toBeDefined();

    rerender(
      <ConceptNodeDisplay data={{ name: "Concept X", mastery: 0, studied: false, locked: true }} />,
    );
    expect(screen.getByText("Concept X")).toBeDefined();
  });
});
