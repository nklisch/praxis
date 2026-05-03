/**
 * Tests for <ConceptMapsListRoute /> at /courses/$courseId/concept-maps.
 *
 * Verifies: empty state with "+ new map" CTA, list rendering with version count
 * and divergence badge, and navigation on create.
 */
import type {
  ConceptMapDrawing,
  ConceptMapSummary,
  PraxisClient,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ConceptMapsListRoute } from "../routes/concept-maps-list.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

const COURSE_ID = "course-abc";

// Mock TanStack Router hooks.
const mockNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ courseId: COURSE_ID }),
  };
});

function makeSummary(overrides: Partial<ConceptMapSummary> = {}): ConceptMapSummary {
  return {
    id: brandId<"ConceptMapId">("map-1"),
    studentId: brandId<"StudentId">("student-1"),
    courseId: brandId<"CourseId">(COURSE_ID),
    title: "Whole course map",
    versionCount: 3,
    hasDivergences: false,
    createdAt: Date.now() as Timestamp,
    updatedAt: Date.now() as Timestamp,
    ...overrides,
  };
}

function makeDrawing(overrides: Partial<ConceptMapDrawing> = {}): ConceptMapDrawing {
  return {
    id: brandId<"ConceptMapId">("map-new"),
    studentId: brandId<"StudentId">("student-1"),
    courseId: brandId<"CourseId">(COURSE_ID),
    title: "untitled",
    scene: {},
    conceptLinks: [],
    createdAt: Date.now() as Timestamp,
    updatedAt: Date.now() as Timestamp,
    ...overrides,
  };
}

function makeClient(
  maps: ConceptMapSummary[] = [],
  createResult?: ConceptMapDrawing,
): PraxisClient {
  return makeFakeClient({
    conceptMaps: {
      list: vi.fn().mockResolvedValue(maps),
      create: vi.fn().mockResolvedValue(createResult ?? makeDrawing()),
      get: vi.fn().mockResolvedValue(null),
      rename: vi.fn(),
      delete: vi.fn(),
      updateScene: vi.fn(),
      listVersions: vi.fn().mockResolvedValue([]),
    },
  });
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <ConceptMapsListRoute />
    </PraxisClientProvider>,
  );
}

describe("ConceptMapsListRoute", () => {
  it("shows empty state when no maps exist", async () => {
    renderRoute(makeClient([]));

    await waitFor(() => {
      // The COPY.empty.conceptMaps text starts with "No concept maps yet."
      expect(screen.getByText(/No concept maps yet/)).toBeDefined();
    });
  });

  it("shows '+ new map' CTA in the empty state", async () => {
    renderRoute(makeClient([]));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /\+ new map/i })).toBeDefined();
    });
  });

  it("creates a map and navigates when '+ new map' is clicked (empty state)", async () => {
    const createResult = makeDrawing({ id: brandId<"ConceptMapId">("map-new") });
    const client = makeClient([], createResult);
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /\+ new map/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /\+ new map/i }));

    await waitFor(() => {
      expect(client.conceptMaps.create).toHaveBeenCalledWith({
        courseId: expect.any(String),
        title: "untitled",
      });
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/courses/$courseId/concept-maps/$conceptMapId",
        }),
      );
    });
  });

  it("renders a list of maps with title and version count", async () => {
    const maps = [
      makeSummary({
        id: brandId<"ConceptMapId">("map-1"),
        title: "Whole course map",
        versionCount: 3,
      }),
      makeSummary({
        id: brandId<"ConceptMapId">("map-2"),
        title: "Linear equations",
        versionCount: 1,
      }),
    ];
    renderRoute(makeClient(maps));

    await waitFor(() => {
      expect(screen.getByText("Whole course map")).toBeDefined();
      expect(screen.getByText("Linear equations")).toBeDefined();
    });

    expect(screen.getByText(/3 versions/)).toBeDefined();
    expect(screen.getByText(/1 version/)).toBeDefined();
  });

  it("renders 'discussion points' badge for maps with divergences", async () => {
    const maps = [makeSummary({ hasDivergences: true })];
    renderRoute(makeClient(maps));

    await waitFor(() => {
      expect(screen.getByText("discussion points")).toBeDefined();
    });
  });

  it("does NOT show 'discussion points' badge when hasDivergences is false", async () => {
    const maps = [makeSummary({ hasDivergences: false })];
    renderRoute(makeClient(maps));

    await waitFor(() => {
      expect(screen.getByText("Whole course map")).toBeDefined();
    });

    expect(screen.queryByText("discussion points")).toBeNull();
  });

  it("navigates to the editor when a map is clicked", async () => {
    const maps = [makeSummary({ id: brandId<"ConceptMapId">("map-abc") })];
    renderRoute(makeClient(maps));

    await waitFor(() => {
      expect(screen.getByText("Whole course map")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Whole course map"));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "/courses/$courseId/concept-maps/$conceptMapId",
          params: expect.objectContaining({ conceptMapId: "map-abc" }),
        }),
      );
    });
  });
});
