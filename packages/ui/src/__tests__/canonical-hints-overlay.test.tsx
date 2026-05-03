/**
 * Tests for <CanonicalHintsOverlay />.
 *
 * Verifies: canonical concepts are fetched, unlinked concepts are shown as
 * ghost cards, already-linked concepts are excluded, and "+ add to map"
 * creates a tldraw shape and emits onAddToMap.
 */
import type { ConceptId, ConceptLink, CourseId, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import type { Editor } from "tldraw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanonicalHintsOverlay } from "../components/canonical-hints-overlay.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// ── tldraw mock ──────────────────────────────────────────────────────────────

const mockCreateShape = vi.fn();
const mockGetViewportPageBounds = vi.fn().mockReturnValue({ x: 0, y: 0, w: 800, h: 600 });

const fakeEditor = {
  createShape: mockCreateShape,
  getViewportPageBounds: mockGetViewportPageBounds,
};

vi.mock("tldraw", () => ({
  createShapeId: vi.fn((id?: string) => `shape:${id ?? "gen"}`),
  toRichText: vi.fn((text: string) => ({ type: "doc", content: [{ type: "text", text }] })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const allConcepts = [
  {
    id: "c1",
    graphId: "g1",
    name: "Linear Equations",
    description: "",
    aliases: [],
    standardsTags: [],
  },
  { id: "c2", graphId: "g1", name: "Slope", description: "", aliases: [], standardsTags: [] },
  {
    id: "c3",
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
      concepts: vi.fn().mockResolvedValue(allConcepts),
    } as unknown as import("@praxis/core/types").PraxisClient["artifacts"],
  });
}

function renderOverlay(props: {
  drawnConceptIds?: ReadonlyArray<ConceptId>;
  onAddToMap?: (link: ConceptLink) => void;
  editorRef?: RefObject<Editor | null>;
}) {
  const editorRef = props.editorRef ?? createRef<Editor | null>();
  // biome-ignore lint/suspicious/noExplicitAny: test-only ref mutation
  (editorRef as any).current = fakeEditor;

  const onAddToMap = props.onAddToMap ?? vi.fn();
  const drawnConceptIds = props.drawnConceptIds ?? [];
  const client = makeClient();

  return {
    onAddToMap,
    editorRef,
    ...render(
      <PraxisClientProvider client={client}>
        <CanonicalHintsOverlay
          courseId={brandId<"CourseId">("course-1")}
          drawnConceptIds={drawnConceptIds}
          editorRef={editorRef as RefObject<Editor | null>}
          onAddToMap={onAddToMap}
        />
      </PraxisClientProvider>,
    ),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("<CanonicalHintsOverlay />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetViewportPageBounds.mockReturnValue({ x: 0, y: 0, w: 800, h: 600 });
  });

  it("shows all canonical concepts as ghosts when drawnConceptIds is empty", async () => {
    renderOverlay({ drawnConceptIds: [] });

    await waitFor(() => {
      expect(screen.getByText("Linear Equations")).toBeDefined();
      expect(screen.getByText("Slope")).toBeDefined();
      expect(screen.getByText("Quadratic Functions")).toBeDefined();
    });
  });

  it("renders '+ add to map' buttons for each undrawn concept", async () => {
    renderOverlay({ drawnConceptIds: [] });

    await waitFor(() => {
      const addBtns = screen.getAllByRole("button", { name: /\+ add to map/i });
      expect(addBtns.length).toBe(3);
    });
  });

  it("excludes already-drawn concepts from the ghost list", async () => {
    renderOverlay({
      drawnConceptIds: [brandId<"ConceptId">("c1")], // "Linear Equations" is drawn
    });

    await waitFor(() => {
      // Slope and Quadratic still shown
      expect(screen.getByText("Slope")).toBeDefined();
      expect(screen.getByText("Quadratic Functions")).toBeDefined();
    });

    // Linear Equations should NOT appear
    expect(screen.queryByText("Linear Equations")).toBeNull();
  });

  it("renders nothing (null) when all concepts are already drawn", async () => {
    const allIds = allConcepts.map((c) => brandId<"ConceptId">(c.id));
    renderOverlay({ drawnConceptIds: allIds });

    await waitFor(() => {
      // Overlay renders null — no ghosts visible.
      expect(screen.queryByText("Linear Equations")).toBeNull();
      expect(screen.queryByText("Slope")).toBeNull();
    });
  });

  it("calls onAddToMap and createShape when '+ add to map' is clicked", async () => {
    const onAddToMap = vi.fn();
    renderOverlay({ onAddToMap });

    await waitFor(() => {
      expect(screen.getByText("Slope")).toBeDefined();
    });

    // Find the "Slope" ghost and click its "+ add to map" button.
    // The ghost div contains the name + button; we hover to make the button visible
    // (CSS hover makes it visible; in jsdom all elements are "visible" for testing).
    const addBtns = screen.getAllByRole("button", { name: /\+ add to map/i });
    // Find the one near "Slope" — order matches concepts array.
    // Concepts: Linear Equations (0), Slope (1), Quadratic (2)
    fireEvent.click(addBtns[1]!);

    expect(onAddToMap).toHaveBeenCalledWith(
      expect.objectContaining({
        conceptId: "c2", // Slope's conceptId
        confidence: 1.0,
      }),
    );

    // createShape should have been called on the editor.
    expect(mockCreateShape).toHaveBeenCalled();
  });

  it("uses viewport center as the initial position for new shapes", async () => {
    const onAddToMap = vi.fn();
    mockGetViewportPageBounds.mockReturnValue({ x: 0, y: 0, w: 1000, h: 800 });
    renderOverlay({ onAddToMap });

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /\+ add to map/i }).length).toBeGreaterThan(0);
    });

    const addBtns = screen.getAllByRole("button", { name: /\+ add to map/i });
    fireEvent.click(addBtns[0]!);

    // createShape should have been called with x=500 (0+1000/2) and y=400 (0+800/2).
    expect(mockCreateShape).toHaveBeenCalledWith(expect.objectContaining({ x: 500, y: 400 }));
  });

  it("shows the panel header with ornament and count", async () => {
    renderOverlay({ drawnConceptIds: [brandId<"ConceptId">("c1")] }); // 2 undrawn

    await waitFor(() => {
      expect(screen.getByText("canonical concepts")).toBeDefined();
      expect(screen.getByText("2 to explore")).toBeDefined();
    });
  });
});
