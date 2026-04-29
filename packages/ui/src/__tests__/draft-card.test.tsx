import type { ProposedCourse } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DraftCard } from "../components/draft-card.js";

afterEach(() => {
  cleanup();
});

function makeProposed(overrides: Partial<ProposedCourse> = {}): ProposedCourse {
  return {
    title: "Introduction to Algebra",
    subject: "mathematics",
    gradeLevel: "grade-8",
    thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
    proposedLessons: [
      {
        draftLessonId: "dl-1",
        title: "Variables and Expressions",
        conceptNames: ["Variable", "Expression", "Constant"],
        references: [],
        suggestedStrategy: "worked-example" as import("@praxis/core/types").StrategyId,
        estimatedMinutes: 45,
      },
      {
        draftLessonId: "dl-2",
        title: "Solving Linear Equations",
        conceptNames: ["Linear Equation", "Isolating the Variable"],
        references: [],
        suggestedStrategy: "worked-example" as import("@praxis/core/types").StrategyId,
        estimatedMinutes: 60,
      },
    ],
    proposedConcepts: [
      { name: "Variable", description: "A symbol representing an unknown value.", evidence: [] },
      {
        name: "Expression",
        description: "A combination of variables and constants.",
        evidence: [],
      },
      { name: "Linear Equation", description: "An equation with degree 1.", evidence: [] },
    ],
    proposedEdges: [
      { fromName: "Variable", toName: "Linear Equation", strength: 0.9, rationale: "Prerequisite" },
    ],
    ...overrides,
  };
}

describe("DraftCard", () => {
  it("renders the course title", () => {
    render(<DraftCard proposed={makeProposed()} />);
    expect(screen.getByText("Introduction to Algebra")).toBeDefined();
  });

  it("renders subject and grade level", () => {
    render(<DraftCard proposed={makeProposed()} />);
    expect(screen.getByText(/mathematics/)).toBeDefined();
    expect(screen.getByText(/grade-8/)).toBeDefined();
  });

  it("renders the lesson list with titles", () => {
    render(<DraftCard proposed={makeProposed()} />);
    expect(screen.getByText("Variables and Expressions")).toBeDefined();
    expect(screen.getByText("Solving Linear Equations")).toBeDefined();
  });

  it("renders concept names inside lessons", () => {
    render(<DraftCard proposed={makeProposed()} />);
    // "Variable" appears both in the lesson concept list and the concepts section
    const variableEls = screen.getAllByText("Variable");
    expect(variableEls.length).toBeGreaterThan(0);
    const expressionEls = screen.getAllByText("Expression");
    expect(expressionEls.length).toBeGreaterThan(0);
  });

  it("renders the lesson count summary", () => {
    render(<DraftCard proposed={makeProposed()} />);
    expect(screen.getByText("2 lessons")).toBeDefined();
  });

  it("renders the concept count summary", () => {
    render(<DraftCard proposed={makeProposed()} />);
    expect(screen.getByText("3 concepts")).toBeDefined();
  });

  it("renders prerequisites when present", () => {
    render(<DraftCard proposed={makeProposed()} />);
    // The prerequisites section should be visible
    expect(screen.getByText("1 prerequisite")).toBeDefined();
  });

  it("does not render prerequisites section when there are none", () => {
    render(<DraftCard proposed={makeProposed({ proposedEdges: [] })} />);
    expect(screen.queryByText(/prerequisite/)).toBeNull();
  });

  it("renders singular 'lesson' when count is 1", () => {
    render(
      <DraftCard
        proposed={makeProposed({
          proposedLessons: [
            {
              draftLessonId: "dl-1",
              title: "Only Lesson",
              conceptNames: [],
              references: [],
              suggestedStrategy: "worked-example" as import("@praxis/core/types").StrategyId,
              estimatedMinutes: 30,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("1 lesson")).toBeDefined();
  });
});
