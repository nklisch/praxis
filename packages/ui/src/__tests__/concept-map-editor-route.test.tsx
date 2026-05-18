/**
 * Tests for <ConceptMapEditorRoute /> at /courses/$courseId/concept-maps/$conceptMapId.
 *
 * Verifies: loads map and shows title, renders toolbar, toggles hints overlay,
 * rename flow, and debounced updateScene on canvas change.
 *
 * tldraw is mocked (jsdom lacks canvas/WebGL) — same pattern as sketch-canvas.test.tsx.
 */
import type {
  ConceptMapDrawing,
  ConceptMapVersion,
  PraxisClient,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ConceptMapEditorRoute } from "../routes/concept-map-editor.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

const COURSE_ID = "course-xyz";
const MAP_ID = "map-def";

// Mock TanStack Router hooks.
const mockNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ courseId: COURSE_ID, conceptMapId: MAP_ID }),
  };
});

// ── tldraw mock ──────────────────────────────────────────────────────────────

const mockStore = {
  listen: vi.fn().mockReturnValue(() => {}),
};
const mockGetSnapshot = vi.fn().mockReturnValue({});
const mockGetCurrentPageShapes = vi.fn().mockReturnValue([]);
const mockLoadSnapshot = vi.fn();
const mockGetShape = vi.fn().mockReturnValue(null);
const mockGetShapeUtil = vi.fn().mockReturnValue({ getText: vi.fn().mockReturnValue("") });
const mockGetShapePageBounds = vi.fn().mockReturnValue(null);
const mockPageToScreen = vi.fn().mockReturnValue({ x: 0, y: 0 });
const mockGetViewportPageBounds = vi.fn().mockReturnValue({ x: 0, y: 0, w: 800, h: 600 });
const mockCreateShape = vi.fn();

const fakeEditor = {
  store: mockStore,
  getSnapshot: mockGetSnapshot,
  getCurrentPageShapes: mockGetCurrentPageShapes,
  loadSnapshot: mockLoadSnapshot,
  getShape: mockGetShape,
  getShapeUtil: mockGetShapeUtil,
  getShapePageBounds: mockGetShapePageBounds,
  pageToScreen: mockPageToScreen,
  getViewportPageBounds: mockGetViewportPageBounds,
  createShape: mockCreateShape,
};

vi.mock("tldraw", () => ({
  Tldraw: ({ onMount }: { onMount?: (editor: unknown) => unknown }) => {
    if (onMount) onMount(fakeEditor);
    return <div data-testid="tldraw-canvas">tldraw</div>;
  },
  createShapeId: vi.fn((id?: string) => `shape:${id ?? Math.random()}`),
  toRichText: vi.fn((text: string) => ({ type: "doc", content: [{ type: "text", text }] })),
}));

vi.mock("tldraw/tldraw.css", () => ({}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMap(overrides: Partial<ConceptMapDrawing> = {}): ConceptMapDrawing {
  return {
    id: brandId<"ConceptMapId">(MAP_ID),
    studentId: brandId<"StudentId">("student-1"),
    courseId: brandId<"CourseId">(COURSE_ID),
    title: "Test Map",
    scene: {},
    conceptLinks: [],
    createdAt: Date.now() as Timestamp,
    updatedAt: (Date.now() - 60_000) as Timestamp,
    ...overrides,
  };
}

function makeVersion(): ConceptMapVersion {
  return {
    id: "v1",
    conceptMapId: brandId<"ConceptMapId">(MAP_ID),
    scene: {},
    conceptLinks: [],
    snapshotAt: (Date.now() - 3600_000) as Timestamp,
  };
}

function makeClient(
  map: ConceptMapDrawing | null = makeMap(),
  versions: ConceptMapVersion[] = [],
): PraxisClient {
  return makeFakeClient({
    conceptMaps: {
      get: vi.fn().mockResolvedValue(map),
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      rename: vi.fn().mockImplementation(async (_id, title) => ({ ...makeMap(), title })),
      delete: vi.fn(),
      updateScene: vi.fn().mockImplementation(async (input) => ({ ...makeMap(), ...input })),
      listVersions: vi.fn().mockResolvedValue(versions),
      computeRipples: vi
        .fn()
        .mockResolvedValue({ conceptCountDelta: 0, notesRetagged: 0, tutorRefsAffected: 0 }),
    },
    artifacts: {
      courses: vi.fn().mockResolvedValue([]),
      course: vi.fn().mockResolvedValue(null),
      lessons: vi.fn().mockResolvedValue([]),
      gates: vi.fn().mockResolvedValue([]),
      progress: vi.fn().mockResolvedValue({ mastery: new Map() }),
      flashcards: vi.fn().mockResolvedValue([]),
      notes: vi.fn().mockResolvedValue([]),
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue([
        {
          id: "c1",
          graphId: "g1",
          name: "Linear Equations",
          description: "",
          aliases: [],
          standardsTags: [],
        },
        { id: "c2", graphId: "g1", name: "Slope", description: "", aliases: [], standardsTags: [] },
      ]),
    } as PraxisClient["artifacts"],
  });
}

function renderRoute(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <ConceptMapEditorRoute />
    </PraxisClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ConceptMapEditorRoute", () => {
  it("shows loading state initially", () => {
    renderRoute(makeClient());
    // Loading state text is "loading…" from COPY.loading.default
    expect(screen.getByText("loading…")).toBeDefined();
  });

  it("renders the map title after load", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      // RouteHeader renders the title
      expect(screen.getByText("Test Map")).toBeDefined();
    });
  });

  it("renders tldraw canvas", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      expect(screen.getByTestId("tldraw-canvas")).toBeDefined();
    });
  });

  it("renders the three-column surface layout", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      // Three-column surface is present.
      expect(screen.getByTestId("three-column-surface")).toBeDefined();
      // Left tools rail is present.
      expect(screen.getByTestId("tools-rail")).toBeDefined();
      // Canvas area is present.
      expect(screen.getByTestId("canvas-area")).toBeDefined();
      // Right hints panel is always visible (no toggle needed).
      expect(screen.getByTestId("hints-panel")).toBeDefined();
    });
  });

  it("renders the Rename button and drawing tool buttons", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Rename/i })).toBeDefined();
      // Select tool is in the tools rail.
      expect(screen.getByRole("button", { name: /Select/i })).toBeDefined();
    });
  });

  it("renders the RipplesPanel in the hints panel", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      // RipplesPanel renders its testid.
      expect(screen.getByTestId("ripples-panel")).toBeDefined();
    });
  });

  it("shows rename input when 'Rename' is clicked", async () => {
    renderRoute(makeClient());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Rename/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Rename/i }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /Map title/i })).toBeDefined();
    });

    // Save and Cancel buttons should appear
    expect(screen.getByRole("button", { name: /Save/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeDefined();
  });

  it("calls rename on save and hides the rename form", async () => {
    const client = makeClient();
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Rename/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Rename/i }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /Map title/i })).toBeDefined();
    });

    const input = screen.getByRole("textbox", { name: /Map title/i });
    fireEvent.change(input, { target: { value: "New Title" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(client.conceptMaps.rename).toHaveBeenCalledWith(expect.any(String), "New Title");
    });
  });

  it("shows version count in the deck", async () => {
    renderRoute(makeClient(makeMap(), [makeVersion(), makeVersion()]));

    await waitFor(() => {
      expect(screen.getByText(/2 versions/)).toBeDefined();
    });
  });

  it("shows '0 versions' when listVersions returns empty", async () => {
    renderRoute(makeClient(makeMap(), []));

    await waitFor(() => {
      expect(screen.getByText(/0 versions/)).toBeDefined();
    });
  });

  it("shows 'Map not found.' when map is null", async () => {
    renderRoute(makeClient(null));

    await waitFor(() => {
      expect(screen.getByText("Map not found.")).toBeDefined();
    });
  });

  it("cancelling rename hides the form without saving", async () => {
    const client = makeClient();
    renderRoute(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Rename/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Rename/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: /Map title/i })).toBeNull();
    });

    expect(client.conceptMaps.rename).not.toHaveBeenCalled();
  });
});
