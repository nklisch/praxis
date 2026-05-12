/**
 * Tests for <CourseConceptsListRoute /> at /courses/$courseId/concepts.
 *
 * Covers:
 *   - Empty state when course has no concepts.
 *   - Renders concept names in lesson-grouped sections.
 *   - Filter input narrows the visible list (case-insensitive substring).
 *   - Filter includes description in the search.
 *   - Escape key clears the filter.
 *   - Clear button (×) clears the filter.
 *   - "Ungrouped" section for concepts not in any lesson.
 */
import type { Lesson } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import type { ConceptRow } from "../hooks/use-course-gates.js";
import { CourseConceptsListRoute } from "../routes/course-concepts-list.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

const COURSE_ID = "course-concepts-test";

const mockNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ courseId: COURSE_ID }),
  };
});

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeConceptRow(id: string, name: string, description = ""): ConceptRow {
  return {
    id,
    graphId: "test-graph",
    name,
    description,
    aliases: [],
    standardsTags: [],
  };
}

function makeLesson(id: string, title: string, conceptIds: string[]): Lesson {
  return {
    id: brandId<"LessonId">(id),
    courseId: brandId<"CourseId">(COURSE_ID),
    title,
    conceptIds: conceptIds.map((c) => brandId<"ConceptId">(c)) as Lesson["conceptIds"],
    references: [],
    suggestedStrategy: brandId("strategy-default"),
    estimatedMinutes: 30,
  };
}

function renderRoute(concepts: ConceptRow[] = [], lessons: Lesson[] = []) {
  const client = makeFakeClient({
    artifacts: {
      concepts: vi.fn().mockResolvedValue(concepts),
      lessons: vi.fn().mockResolvedValue(lessons),
    } as unknown as Parameters<typeof makeFakeClient>[0]["artifacts"],
  });

  return render(
    <PraxisClientProvider client={client}>
      <CourseConceptsListRoute />
    </PraxisClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("CourseConceptsListRoute", () => {
  it("shows empty state when the course has no concepts", async () => {
    renderRoute([], []);

    await waitFor(() => {
      expect(screen.getByText(/No concepts yet/)).toBeDefined();
    });
  });

  it("renders concept names grouped by lesson title", async () => {
    const concepts = [
      makeConceptRow("concept:vars", "Variables"),
      makeConceptRow("concept:exprs", "Expressions"),
    ];
    const lessons = [makeLesson("lesson-1", "Algebra Basics", ["concept:vars", "concept:exprs"])];

    renderRoute(concepts, lessons);

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
      expect(screen.getByText("Expressions")).toBeDefined();
    });

    // The lesson title appears as a group header.
    expect(screen.getByText("Algebra Basics")).toBeDefined();
  });

  it("places concepts not in any lesson in an 'Ungrouped' section", async () => {
    const concepts = [
      makeConceptRow("concept:vars", "Variables"),
      makeConceptRow("concept:orphan", "Orphan Concept"),
    ];
    const lessons = [makeLesson("lesson-1", "Algebra Basics", ["concept:vars"])];

    renderRoute(concepts, lessons);

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
      expect(screen.getByText("Orphan Concept")).toBeDefined();
    });

    expect(screen.getByText("Ungrouped")).toBeDefined();
  });

  it("filter input narrows the visible list (case-insensitive name match)", async () => {
    const concepts = [
      makeConceptRow("concept:vars", "Variables"),
      makeConceptRow("concept:funcs", "Functions"),
    ];
    const lessons = [makeLesson("lesson-1", "Math", ["concept:vars", "concept:funcs"])];

    renderRoute(concepts, lessons);

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/filter concepts/i);
    fireEvent.change(input, { target: { value: "func" } });

    await waitFor(() => {
      expect(screen.queryByText("Variables")).toBeNull();
      expect(screen.getByText("Functions")).toBeDefined();
    });
  });

  it("filter is case-insensitive", async () => {
    const concepts = [makeConceptRow("concept:vars", "Variables")];
    const lessons = [makeLesson("lesson-1", "Math", ["concept:vars"])];

    renderRoute(concepts, lessons);

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/filter concepts/i);
    fireEvent.change(input, { target: { value: "VARIABLE" } });

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
    });
  });

  it("filter matches against concept description", async () => {
    const concepts = [
      makeConceptRow("concept:vars", "Variables", "a named memory location"),
      makeConceptRow("concept:funcs", "Functions", "a reusable block of code"),
    ];
    const lessons = [makeLesson("lesson-1", "Math", ["concept:vars", "concept:funcs"])];

    renderRoute(concepts, lessons);

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/filter concepts/i);
    fireEvent.change(input, { target: { value: "memory location" } });

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
      expect(screen.queryByText("Functions")).toBeNull();
    });
  });

  it("Escape key clears the filter and restores the full list", async () => {
    const concepts = [
      makeConceptRow("concept:vars", "Variables"),
      makeConceptRow("concept:funcs", "Functions"),
    ];
    const lessons = [makeLesson("lesson-1", "Math", ["concept:vars", "concept:funcs"])];

    renderRoute(concepts, lessons);

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/filter concepts/i);
    fireEvent.change(input, { target: { value: "func" } });

    await waitFor(() => {
      expect(screen.queryByText("Variables")).toBeNull();
    });

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
      expect(screen.getByText("Functions")).toBeDefined();
    });
  });

  it("clear button (×) is visible when input is non-empty and clears the filter", async () => {
    const concepts = [makeConceptRow("concept:vars", "Variables")];
    const lessons = [makeLesson("lesson-1", "Math", ["concept:vars"])];

    renderRoute(concepts, lessons);

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/filter concepts/i);

    // Clear button should not be visible initially.
    expect(screen.queryByRole("button", { name: /clear filter/i })).toBeNull();

    fireEvent.change(input, { target: { value: "xyz" } });

    await waitFor(() => {
      const clearBtn = screen.getByRole("button", { name: /clear filter/i });
      expect(clearBtn).toBeDefined();
      fireEvent.click(clearBtn);
    });

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
      // Clear button disappears after clearing.
      expect(screen.queryByRole("button", { name: /clear filter/i })).toBeNull();
    });
  });

  it("shows 'no results' message when filter matches nothing", async () => {
    const concepts = [makeConceptRow("concept:vars", "Variables")];
    const lessons = [makeLesson("lesson-1", "Math", ["concept:vars"])];

    renderRoute(concepts, lessons);

    await waitFor(() => {
      expect(screen.getByText("Variables")).toBeDefined();
    });

    const input = screen.getByPlaceholderText(/filter concepts/i);
    fireEvent.change(input, { target: { value: "xyzzy" } });

    await waitFor(() => {
      expect(screen.getByText(/No concepts match/)).toBeDefined();
    });
  });

  it("renders the back button that navigates to the course detail", async () => {
    renderRoute([], []);

    await waitFor(() => {
      expect(screen.getByText(/No concepts yet/)).toBeDefined();
    });

    const backBtn = screen.getByRole("button", { name: /← Course/i });
    fireEvent.click(backBtn);

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/courses/$courseId" }),
    );
  });
});
