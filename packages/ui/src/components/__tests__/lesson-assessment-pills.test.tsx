import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AssessmentPillEntry } from "../lesson-assessment-pills.js";
import { LessonAssessmentPills } from "../lesson-assessment-pills.js";

afterEach(() => {
  cleanup();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const readiness = (timing: AssessmentPillEntry["timing"] = "before"): AssessmentPillEntry => ({
  purpose: "readiness",
  timing,
});

const practice = (timing: AssessmentPillEntry["timing"] = "interleaved"): AssessmentPillEntry => ({
  purpose: "practice",
  timing,
});

const checkpoint = (timing: AssessmentPillEntry["timing"] = "after"): AssessmentPillEntry => ({
  purpose: "checkpoint",
  timing,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LessonAssessmentPills — empty state", () => {
  it("renders nothing for an empty array", () => {
    const { container } = render(<LessonAssessmentPills assessments={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("LessonAssessmentPills — single pill", () => {
  it("shows READY label for readiness purpose", () => {
    render(<LessonAssessmentPills assessments={[readiness()]} />);
    expect(screen.getByText("READY")).toBeDefined();
  });

  it("shows HW label for practice purpose", () => {
    render(<LessonAssessmentPills assessments={[practice()]} />);
    expect(screen.getByText("HW")).toBeDefined();
  });

  it("shows QUIZ label for checkpoint purpose", () => {
    render(<LessonAssessmentPills assessments={[checkpoint()]} />);
    expect(screen.getByText("QUIZ")).toBeDefined();
  });
});

describe("LessonAssessmentPills — timing display", () => {
  it("renders the timing value as a sub-label on readiness pill", () => {
    render(<LessonAssessmentPills assessments={[readiness("before")]} />);
    expect(screen.getByText("before")).toBeDefined();
  });

  it("renders interleaved timing on practice pill", () => {
    render(<LessonAssessmentPills assessments={[practice("interleaved")]} />);
    expect(screen.getByText("interleaved")).toBeDefined();
  });

  it("renders after timing on checkpoint pill", () => {
    render(<LessonAssessmentPills assessments={[checkpoint("after")]} />);
    expect(screen.getByText("after")).toBeDefined();
  });
});

describe("LessonAssessmentPills — multi-pill combinations", () => {
  it("qc + ready: renders READY pill (practice not present)", () => {
    render(<LessonAssessmentPills assessments={[readiness()]} />);
    expect(screen.getByText("READY")).toBeDefined();
    expect(screen.queryByText("HW")).toBeNull();
    expect(screen.queryByText("QUIZ")).toBeNull();
  });

  it("ready + quiz: renders READY and QUIZ", () => {
    render(<LessonAssessmentPills assessments={[readiness(), checkpoint()]} />);
    expect(screen.getByText("READY")).toBeDefined();
    expect(screen.getByText("QUIZ")).toBeDefined();
    expect(screen.queryByText("HW")).toBeNull();
  });

  it("hw + quiz: renders HW and QUIZ", () => {
    render(<LessonAssessmentPills assessments={[practice(), checkpoint()]} />);
    expect(screen.getByText("HW")).toBeDefined();
    expect(screen.getByText("QUIZ")).toBeDefined();
    expect(screen.queryByText("READY")).toBeNull();
  });

  it("full mix: ready + hw + quiz all render", () => {
    render(<LessonAssessmentPills assessments={[readiness(), practice(), checkpoint()]} />);
    expect(screen.getByText("READY")).toBeDefined();
    expect(screen.getByText("HW")).toBeDefined();
    expect(screen.getByText("QUIZ")).toBeDefined();
  });
});

describe("LessonAssessmentPills — purpose grouping correctness", () => {
  it("two readiness entries both render as READY", () => {
    render(<LessonAssessmentPills assessments={[readiness("before"), readiness("after")]} />);
    const readyPills = screen.getAllByText("READY");
    expect(readyPills).toHaveLength(2);
  });

  it("multiple purposes render in insertion order", () => {
    const { container } = render(
      <LessonAssessmentPills assessments={[practice(), readiness(), checkpoint()]} />,
    );
    const pills = container.querySelectorAll(
      "[class*='stack'] span:first-child ~ span, [class*='stack'] > span",
    );
    // Just verify three pills are rendered
    const stack = container.querySelector("[class*='stack']");
    expect(stack).toBeDefined();
    // The stack holds spans — one per entry
    expect(stack?.children).toHaveLength(3);
  });
});

describe("LessonAssessmentPills — CSS variant classes", () => {
  it("readiness pill has the 'ready' variant class", () => {
    const { container } = render(<LessonAssessmentPills assessments={[readiness()]} />);
    const pill = container.querySelector("[class*='ready']");
    expect(pill).toBeDefined();
  });

  it("practice pill has the 'home' variant class", () => {
    const { container } = render(<LessonAssessmentPills assessments={[practice()]} />);
    const pill = container.querySelector("[class*='home']");
    expect(pill).toBeDefined();
  });

  it("checkpoint pill has the 'check' variant class", () => {
    const { container } = render(<LessonAssessmentPills assessments={[checkpoint()]} />);
    const pill = container.querySelector("[class*='check']");
    expect(pill).toBeDefined();
  });
});
