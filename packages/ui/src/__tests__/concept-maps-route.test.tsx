/**
 * Tests for <ConceptMapsRoute /> at /concept-maps.
 *
 * Verifies:
 * - Default load renders cards (sort=recent)
 * - Filter pill click updates search params
 * - Sort tab click updates search params
 * - URL param load (course + sort) passes correct args to client
 * - Empty state: no courses → CTA to /course-create
 * - Empty state: has courses, no maps → course list links
 */
import type { ConceptMapSummary, CourseSummary, PraxisClient, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ConceptMapsRoute } from "../routes/concept-maps.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// ── Router mocks ──────────────────────────────────────────────────────────────

let mockSearchParams: { course?: string; sort?: string } = {};
const mockNavigate = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearch: (_opts: unknown) => mockSearchParams,
  };
});

// ── Factories ─────────────────────────────────────────────────────────────────

function makeMap(
  overrides: Partial<ConceptMapSummary> & {
    id?: string;
    courseId?: string;
    title?: string;
  } = {},
): ConceptMapSummary {
  const now = Date.now() as Timestamp;
  return {
    id: brandId<"ConceptMapId">(overrides.id ?? "map-1"),
    studentId: brandId<"StudentId">("student-1"),
    courseId: brandId<"CourseId">(overrides.courseId ?? "course-abc"),
    title: overrides.title ?? "Test map",
    versionCount: overrides.versionCount ?? 2,
    hasDivergences: overrides.hasDivergences ?? false,
    createdAt: now,
    updatedAt: now,
    linkedNodeCount: overrides.linkedNodeCount ?? 5,
    totalNodeCount: overrides.totalNodeCount ?? 10,
  };
}

function makeCourse(
  overrides: Partial<CourseSummary> & { courseId?: string; title?: string } = {},
): CourseSummary {
  return {
    courseId: overrides.courseId ?? "course-abc",
    title: overrides.title ?? "Algebra I",
    subject: "Mathematics",
    gradeLevel: "9",
    lessonCount: 10,
    conceptCount: 20,
    studiedConcepts: 5,
    createdAt: Date.now() as Timestamp,
  };
}

function makeClient(
  opts: { maps?: ConceptMapSummary[]; courses?: CourseSummary[] } = {},
): PraxisClient {
  const { maps = [], courses = [] } = opts;
  return makeFakeClient({
    conceptMaps: {
      list: vi.fn().mockResolvedValue(maps),
      create: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      rename: vi.fn(),
      delete: vi.fn(),
      updateScene: vi.fn(),
      listVersions: vi.fn().mockResolvedValue([]),
    },
    artifacts: {
      courses: vi.fn().mockResolvedValue(courses),
    } as PraxisClient["artifacts"],
  });
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <ConceptMapsRoute />
    </PraxisClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ConceptMapsRoute", () => {
  describe("default load (sort=recent)", () => {
    it("renders map cards when data is available", async () => {
      mockSearchParams = {};
      const maps = [
        makeMap({ id: "map-1", title: "Cell membrane transport" }),
        makeMap({ id: "map-2", title: "Linear functions" }),
      ];
      const courses = [makeCourse({ courseId: "course-abc", title: "Biology" })];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByText("Cell membrane transport")).toBeDefined();
        expect(screen.getByText("Linear functions")).toBeDefined();
      });
    });

    it("renders coverage label on each card", async () => {
      mockSearchParams = {};
      const maps = [makeMap({ linkedNodeCount: 7, totalNodeCount: 12 })];
      const courses = [makeCourse()];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        // "7 / 12 · 58% mapped"
        expect(screen.getByText(/7 \/ 12/)).toBeDefined();
        expect(screen.getByText(/58% mapped/)).toBeDefined();
      });
    });

    it("passes sort=recent to client.conceptMaps.list when no sort param", async () => {
      mockSearchParams = {};
      const client = makeClient({ maps: [], courses: [] });
      renderRoute(client);

      await waitFor(() => {
        expect(client.conceptMaps.list).toHaveBeenCalledWith(
          expect.objectContaining({ sort: "recent" }),
        );
      });
    });

    it("renders version count on each card", async () => {
      mockSearchParams = {};
      const maps = [makeMap({ versionCount: 5 })];
      const courses = [makeCourse()];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByText(/5 versions/)).toBeDefined();
      });
    });

    it("renders discussion points badge when hasDivergences is true", async () => {
      mockSearchParams = {};
      const maps = [makeMap({ hasDivergences: true })];
      const courses = [makeCourse()];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByText("discussion points")).toBeDefined();
      });
    });

    it("does not render discussion badge when hasDivergences is false", async () => {
      mockSearchParams = {};
      const maps = [makeMap({ hasDivergences: false, title: "Some map" })];
      const courses = [makeCourse()];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByText("Some map")).toBeDefined();
      });
      expect(screen.queryByText("discussion points")).toBeNull();
    });
  });

  describe("filter pill click", () => {
    it("renders 'All courses' pill and a pill per course", async () => {
      mockSearchParams = {};
      const courses = [
        makeCourse({ courseId: "course-1", title: "Algebra I" }),
        makeCourse({ courseId: "course-2", title: "Biology" }),
      ];
      // Provide maps so we stay in the card-grid state (not the no-maps empty state)
      const maps = [
        makeMap({ id: "m1", courseId: "course-1", title: "Map A" }),
        makeMap({ id: "m2", courseId: "course-2", title: "Map B" }),
      ];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "All courses" })).toBeDefined();
        // Each course name appears once as a filter pill (card titles are different)
        expect(screen.getAllByRole("button", { name: "Algebra I" }).length).toBeGreaterThanOrEqual(
          1,
        );
        expect(screen.getAllByRole("button", { name: "Biology" }).length).toBeGreaterThanOrEqual(1);
      });
    });

    it("clicking a course pill calls navigate with course param", async () => {
      mockSearchParams = {};
      mockNavigate.mockClear();
      const courses = [makeCourse({ courseId: "course-abc", title: "Algebra I" })];
      const maps = [makeMap({ id: "m1", courseId: "course-abc", title: "Map A" })];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Algebra I" })).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "Algebra I" }));

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/concept-maps",
          search: expect.objectContaining({ course: "course-abc" }),
        }),
      );
    });

    it("clicking 'All courses' calls navigate with course=undefined", async () => {
      mockSearchParams = { course: "course-abc" };
      mockNavigate.mockClear();
      const courses = [makeCourse({ courseId: "course-abc", title: "Algebra I" })];
      const maps = [makeMap({ id: "m1", courseId: "course-abc", title: "Map A" })];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "All courses" })).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "All courses" }));

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/concept-maps",
          search: expect.objectContaining({ course: undefined }),
        }),
      );
    });
  });

  describe("sort tab click", () => {
    it("renders sort tabs: recent, coverage, course", async () => {
      mockSearchParams = {};
      const courses = [makeCourse()];
      const maps = [makeMap({ id: "m1", title: "Map A" })];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "recent" })).toBeDefined();
        expect(screen.getByRole("button", { name: "coverage" })).toBeDefined();
        expect(screen.getByRole("button", { name: "course" })).toBeDefined();
      });
    });

    it("clicking a sort tab calls navigate with sort param", async () => {
      mockSearchParams = {};
      mockNavigate.mockClear();
      const courses = [makeCourse()];
      const maps = [makeMap({ id: "m1", title: "Map A" })];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "coverage" })).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: "coverage" }));

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/concept-maps",
          search: expect.objectContaining({ sort: "coverage" }),
        }),
      );
    });
  });

  describe("URL param load", () => {
    it("passes courseId to client.conceptMaps.list when course param is set", async () => {
      mockSearchParams = { course: "course-xyz" };
      const client = makeClient({ maps: [], courses: [makeCourse({ courseId: "course-xyz" })] });
      renderRoute(client);

      await waitFor(() => {
        expect(client.conceptMaps.list).toHaveBeenCalledWith(
          expect.objectContaining({ courseId: "course-xyz" }),
        );
      });
    });

    it("passes sort to client.conceptMaps.list when sort param is set", async () => {
      mockSearchParams = { sort: "coverage" };
      const client = makeClient({ maps: [], courses: [makeCourse()] });
      renderRoute(client);

      await waitFor(() => {
        expect(client.conceptMaps.list).toHaveBeenCalledWith(
          expect.objectContaining({ sort: "coverage" }),
        );
      });
    });

    it("passes both courseId and sort when both params are set", async () => {
      mockSearchParams = { course: "course-abc", sort: "coverage" };
      const client = makeClient({
        maps: [],
        courses: [makeCourse({ courseId: "course-abc" })],
      });
      renderRoute(client);

      await waitFor(() => {
        expect(client.conceptMaps.list).toHaveBeenCalledWith(
          expect.objectContaining({ courseId: "course-abc", sort: "coverage" }),
        );
      });
    });
  });

  describe("empty state — no courses", () => {
    it("shows 'Start a course' message and CTA button", async () => {
      mockSearchParams = {};
      renderRoute(makeClient({ maps: [], courses: [] }));

      await waitFor(() => {
        expect(screen.getByText(/Start a course to build concept maps/)).toBeDefined();
        expect(screen.getByRole("button", { name: /Create a course/i })).toBeDefined();
      });
    });

    it("CTA navigates to /course-create", async () => {
      mockSearchParams = {};
      mockNavigate.mockClear();
      renderRoute(makeClient({ maps: [], courses: [] }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Create a course/i })).toBeDefined();
      });

      fireEvent.click(screen.getByRole("button", { name: /Create a course/i }));

      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/course-create" }));
    });

    it("does not render filter pills when there are no courses", async () => {
      mockSearchParams = {};
      renderRoute(makeClient({ maps: [], courses: [] }));

      await waitFor(() => {
        expect(screen.getByText(/Start a course/)).toBeDefined();
      });

      expect(screen.queryByRole("button", { name: "All courses" })).toBeNull();
    });
  });

  describe("empty state — has courses, no maps", () => {
    it("shows 'Open a course' message and course links", async () => {
      mockSearchParams = {};
      const courses = [
        makeCourse({ courseId: "course-1", title: "Algebra I" }),
        makeCourse({ courseId: "course-2", title: "Biology" }),
      ];
      renderRoute(makeClient({ maps: [], courses }));

      await waitFor(() => {
        expect(screen.getByText(/Open a course to build your first concept map/)).toBeDefined();
        // Each course appears as both a filter pill and a course link — at least 2 each.
        expect(screen.getAllByRole("button", { name: "Algebra I" }).length).toBeGreaterThanOrEqual(
          2,
        );
        expect(screen.getAllByRole("button", { name: "Biology" }).length).toBeGreaterThanOrEqual(2);
      });
    });

    it("course links navigate to the per-course concept-maps route", async () => {
      mockSearchParams = {};
      mockNavigate.mockClear();
      const courses = [makeCourse({ courseId: "course-abc", title: "Algebra I" })];
      renderRoute(makeClient({ maps: [], courses }));

      // Wait for the empty-state course links to appear.
      // There are two "Algebra I" buttons: one filter pill, one course link.
      // Click the last one (course link, rendered after the filter pill).
      await waitFor(() => {
        const allButtons = screen.getAllByRole("button", { name: "Algebra I" });
        expect(allButtons.length).toBeGreaterThanOrEqual(2);
      });

      const allButtons = screen.getAllByRole("button", { name: "Algebra I" });
      fireEvent.click(allButtons[allButtons.length - 1]);

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/courses/$courseId/concept-maps",
          params: expect.objectContaining({ courseId: "course-abc" }),
        }),
      );
    });
  });

  describe("card navigation", () => {
    it("clicking a card navigates to the map editor", async () => {
      mockSearchParams = {};
      mockNavigate.mockClear();
      const maps = [makeMap({ id: "map-abc", courseId: "course-xyz", title: "My map" })];
      const courses = [makeCourse({ courseId: "course-xyz" })];
      renderRoute(makeClient({ maps, courses }));

      await waitFor(() => {
        expect(screen.getByText("My map")).toBeDefined();
      });

      fireEvent.click(screen.getByText("My map"));

      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/courses/$courseId/concept-maps/$conceptMapId",
          params: expect.objectContaining({
            courseId: "course-xyz",
            conceptMapId: "map-abc",
          }),
        }),
      );
    });
  });
});
