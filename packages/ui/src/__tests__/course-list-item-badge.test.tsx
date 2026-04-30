import type { CourseSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CourseListItem } from "../components/course-list-item.js";

afterEach(() => {
  cleanup();
});

function makeCourse(overrides: Partial<CourseSummary> = {}): CourseSummary {
  return {
    courseId: brandId<"CourseId">("c-1"),
    title: "Algebra 1",
    subject: "mathematics",
    gradeLevel: "grade-8",
    lessonCount: 10,
    conceptCount: 30,
    studiedConcepts: 5,
    createdAt: Date.now() as Timestamp,
    ...overrides,
  };
}

describe("CourseListItem — newly unlocked badge", () => {
  it("does not render a badge when newlyUnlockedCount is undefined", () => {
    render(<CourseListItem course={makeCourse()} onOpen={() => {}} />);
    expect(screen.queryByText(/new unlock/i)).toBeNull();
  });

  it("does not render a badge when newlyUnlockedCount is 0", () => {
    render(<CourseListItem course={makeCourse()} onOpen={() => {}} newlyUnlockedCount={0} />);
    expect(screen.queryByText(/new unlock/i)).toBeNull();
  });

  it("renders badge with singular text when newlyUnlockedCount is 1", () => {
    render(<CourseListItem course={makeCourse()} onOpen={() => {}} newlyUnlockedCount={1} />);
    expect(screen.getByText("1 new unlock")).toBeDefined();
  });

  it("renders badge with plural text when newlyUnlockedCount is 2", () => {
    render(<CourseListItem course={makeCourse()} onOpen={() => {}} newlyUnlockedCount={2} />);
    expect(screen.getByText("2 new unlocks")).toBeDefined();
  });

  it("renders badge with plural text for larger counts", () => {
    render(<CourseListItem course={makeCourse()} onOpen={() => {}} newlyUnlockedCount={7} />);
    expect(screen.getByText("7 new unlocks")).toBeDefined();
  });

  it("badge has accessible role=status", () => {
    render(<CourseListItem course={makeCourse()} onOpen={() => {}} newlyUnlockedCount={3} />);
    // The badge uses role="status" for accessibility
    const badge = screen.getByRole("status");
    expect(badge).toBeDefined();
  });

  it("still renders the course title when badge is present", () => {
    render(
      <CourseListItem
        course={makeCourse({ title: "Biology 101" })}
        onOpen={() => {}}
        newlyUnlockedCount={2}
      />,
    );
    expect(screen.getByText("Biology 101")).toBeDefined();
    expect(screen.getByText("2 new unlocks")).toBeDefined();
  });

  it("still renders the course title when no badge", () => {
    render(<CourseListItem course={makeCourse({ title: "Chemistry" })} onOpen={() => {}} />);
    expect(screen.getByText("Chemistry")).toBeDefined();
  });

  it("renders meta info alongside the badge", () => {
    render(
      <CourseListItem
        course={makeCourse({ subject: "science", gradeLevel: "grade-10" })}
        onOpen={() => {}}
        newlyUnlockedCount={1}
      />,
    );
    expect(screen.getByText(/science/)).toBeDefined();
    expect(screen.getByText(/grade-10/)).toBeDefined();
    expect(screen.getByText("1 new unlock")).toBeDefined();
  });
});
