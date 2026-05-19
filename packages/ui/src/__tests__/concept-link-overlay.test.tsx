/**
 * Tests for <ConceptLinkOverlay />.
 *
 * Verifies: concepts are fetched, typeahead appears on label match,
 * clicking a suggestion fires onLink, and already-linked concepts are filtered.
 *
 * Uses a ref-based editor mock that allows us to trigger store.listen callbacks.
 */
import type { ConceptId, ConceptLink, ConceptMapDrawing, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import type { Editor } from "tldraw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptLinkOverlay } from "../components/concept-link-overlay.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// ── Fake tldraw Editor ───────────────────────────────────────────────────────

let storeListener: ((entry: unknown) => void) | null = null;

const fakeEditor = {
  store: {
    listen: vi.fn((fn: (entry: unknown) => void) => {
      storeListener = fn;
      return () => {
        storeListener = null;
      };
    }),
  },
  getShape: vi.fn().mockReturnValue(null),
  getShapeUtil: vi.fn().mockReturnValue({ getText: vi.fn().mockReturnValue("") }),
  getShapePageBounds: vi.fn().mockReturnValue({ x: 100, y: 200, maxX: 200, maxY: 250 }),
  pageToScreen: vi.fn().mockReturnValue({ x: 150, y: 260 }),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMap(conceptLinks: ConceptLink[] = []): ConceptMapDrawing {
  return {
    id: brandId<"ConceptMapId">("map-1"),
    studentId: brandId<"StudentId">("student-1"),
    courseId: brandId<"CourseId">("course-1"),
    title: "Test Map",
    scene: {},
    conceptLinks,
    createdAt: Date.now() as Timestamp,
    updatedAt: Date.now() as Timestamp,
  };
}

const concepts = [
  {
    id: "c-lin",
    graphId: "g1",
    name: "Linear Equations",
    description: "",
    aliases: [],
    standardsTags: [],
  },
  { id: "c-slope", graphId: "g1", name: "Slope", description: "", aliases: [], standardsTags: [] },
  {
    id: "c-quad",
    graphId: "g1",
    name: "Quadratic Functions",
    description: "",
    aliases: [],
    standardsTags: [],
  },
];

function makeClient() {
  return makeFakeClient({
    artifacts: {
      courses: vi.fn(),
      course: vi.fn(),
      lessons: vi.fn(),
      gates: vi.fn(),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      gateView: vi.fn(),
      evaluateGates: vi.fn(),
      markGatesViewed: vi.fn(),
      newlyUnlockedCount: vi.fn(),
      concepts: vi.fn().mockResolvedValue(concepts),
    } as unknown as import("@praxis/core/types").PraxisClient["artifacts"],
  });
}

function renderOverlay(props: {
  map?: ConceptMapDrawing;
  onLink?: (link: ConceptLink) => void;
  editorRef?: RefObject<Editor | null>;
}) {
  const editorRef = props.editorRef ?? createRef<Editor | null>();
  // Inject fake editor into ref.
  // biome-ignore lint/suspicious/noExplicitAny: test-only ref mutation
  (editorRef as any).current = fakeEditor;

  const onLink = props.onLink ?? vi.fn();
  const map = props.map ?? makeMap();

  const client = makeClient();
  return {
    onLink,
    editorRef,
    ...render(
      <PraxisClientProvider client={client}>
        <ConceptLinkOverlay
          map={map}
          editorRef={editorRef as RefObject<Editor | null>}
          courseId={brandId<"CourseId">("course-1")}
          onLink={onLink}
        />
      </PraxisClientProvider>,
    ),
  };
}

// ── Helper: simulate text shape label edit ───────────────────────────────────

function simulateLabelEdit(shapeId: string, label: string) {
  if (!storeListener) return;

  // Set up getShape to return the shape with getText resolving to label.
  fakeEditor.getShape.mockReturnValue({ id: shapeId, type: "text", props: {} });
  fakeEditor.getShapeUtil.mockReturnValue({
    getText: vi.fn().mockReturnValue(label),
  });

  // Trigger the store listener with a fake update entry.
  storeListener({
    changes: {
      updated: {
        [shapeId]: [
          { id: shapeId, type: "text", props: {} },
          { id: shapeId, type: "text", props: {} },
        ],
      },
      added: {},
      removed: {},
    },
    source: "user",
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("<ConceptLinkOverlay />", () => {
  beforeEach(() => {
    storeListener = null;
    vi.clearAllMocks();
    // Reset store listen mock to capture listener.
    fakeEditor.store.listen.mockImplementation((fn: (entry: unknown) => void) => {
      storeListener = fn;
      return () => {
        storeListener = null;
      };
    });
    fakeEditor.getShapePageBounds.mockReturnValue({ x: 100, y: 200, maxX: 200, maxY: 250 });
    fakeEditor.pageToScreen.mockReturnValue({ x: 150, y: 260 });
  });

  it("renders without crashing (no typeahead initially)", async () => {
    renderOverlay({});
    // No typeahead should be visible initially.
    expect(screen.queryByText("link to concept")).toBeNull();
  });

  it("shows typeahead when a text shape label matches a concept", async () => {
    const client = makeClient();
    const editorRef = createRef<Editor | null>();
    // biome-ignore lint/suspicious/noExplicitAny: test-only ref mutation
    (editorRef as any).current = fakeEditor;

    render(
      <PraxisClientProvider client={client}>
        <ConceptLinkOverlay
          map={makeMap()}
          editorRef={editorRef as RefObject<Editor | null>}
          courseId={brandId<"CourseId">("course-1")}
          onLink={vi.fn()}
        />
      </PraxisClientProvider>,
    );

    // Wait for store.listen to have been called (concepts loaded and effect ran).
    await waitFor(() => {
      expect(fakeEditor.store.listen).toHaveBeenCalled();
    });

    // Wait for concepts to load by checking concepts API was called.
    await waitFor(() => {
      expect(client.artifacts.concepts).toHaveBeenCalled();
    });

    // Give the async concept fetch time to resolve and populate conceptsRef.
    await new Promise((r) => setTimeout(r, 20));

    // Now simulate a label edit.
    simulateLabelEdit("shape:abc", "Linear");

    await waitFor(() => {
      expect(screen.getByText("link to concept")).toBeDefined();
      expect(screen.getByText("Linear Equations")).toBeDefined();
    });
  });

  it("clicking a suggestion fires onLink with correct fields", async () => {
    const onLink = vi.fn();
    const client = makeClient();
    const editorRef = createRef<Editor | null>();
    // biome-ignore lint/suspicious/noExplicitAny: test-only ref mutation
    (editorRef as any).current = fakeEditor;

    render(
      <PraxisClientProvider client={client}>
        <ConceptLinkOverlay
          map={makeMap()}
          editorRef={editorRef as RefObject<Editor | null>}
          courseId={brandId<"CourseId">("course-1")}
          onLink={onLink}
        />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(fakeEditor.store.listen).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(client.artifacts.concepts).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 20));

    simulateLabelEdit("shape:abc", "Slope");

    await waitFor(() => {
      expect(screen.getByText("Slope")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Slope"));

    expect(onLink).toHaveBeenCalledWith(
      expect.objectContaining({
        elementId: "shape:abc",
        conceptId: "c-slope",
        confidence: expect.any(Number),
      }),
    );
  });

  it("dismisses typeahead when × is clicked", async () => {
    const client = makeClient();
    const editorRef = createRef<Editor | null>();
    // biome-ignore lint/suspicious/noExplicitAny: test-only ref mutation
    (editorRef as any).current = fakeEditor;

    render(
      <PraxisClientProvider client={client}>
        <ConceptLinkOverlay
          map={makeMap()}
          editorRef={editorRef as RefObject<Editor | null>}
          courseId={brandId<"CourseId">("course-1")}
          onLink={vi.fn()}
        />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(fakeEditor.store.listen).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(client.artifacts.concepts).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 20));

    simulateLabelEdit("shape:abc", "Linear");

    await waitFor(() => {
      expect(screen.getByText("link to concept")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /dismiss concept suggestions/i }));

    await waitFor(() => {
      expect(screen.queryByText("link to concept")).toBeNull();
    });
  });

  it("excludes already-linked concepts from suggestions", async () => {
    const linkedLink: ConceptLink = {
      elementId: "shape:other",
      conceptId: "c-lin" as ConceptId,
      confidence: 1.0,
    };
    const map = makeMap([linkedLink]);
    renderOverlay({ map });

    await waitFor(() => {
      simulateLabelEdit("shape:abc", "Linear");
    });

    // Linear Equations (c-lin) is already linked — should not appear.
    // The typeahead may not show at all if all matches are filtered.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Linear Equations")).toBeNull();
  });
});
