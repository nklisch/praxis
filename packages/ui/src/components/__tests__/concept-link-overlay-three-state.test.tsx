/**
 * Tests for three-state glyph rendering in <ConceptLinkOverlay />.
 *
 * Verifies that:
 * - "linked" nodes render ✓ glyph
 * - "best_guess" nodes render ? glyph
 * - "unlinked" nodes render no glyph
 * - Ghost edge appears in the DOM when a best_guess glyph is hovered
 */

import type {
  ConceptId,
  ConceptLink,
  ConceptMapDrawing,
  CourseId,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, type RefObject } from "react";
import type { Editor } from "tldraw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { ConceptLinkOverlay } from "../concept-link-overlay.js";

afterEach(() => cleanup());

// ── Fake tldraw Editor ───────────────────────────────────────────────────────

const fakeEditor = {
  store: {
    listen: vi.fn(() => () => {}),
  },
  getShape: vi.fn().mockReturnValue(null),
  getShapeUtil: vi.fn().mockReturnValue({ getText: vi.fn().mockReturnValue("") }),
  getShapePageBounds: vi
    .fn()
    .mockReturnValue({ x: 100, y: 200, maxX: 200, maxY: 250, w: 100, h: 50 }),
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

function renderOverlay(conceptLinks: ConceptLink[]) {
  const editorRef = createRef<Editor | null>();
  // biome-ignore lint/suspicious/noExplicitAny: test-only ref mutation
  (editorRef as any).current = fakeEditor;

  const client = makeFakeClient({
    artifacts: {
      concepts: vi.fn().mockResolvedValue([]),
    } as unknown as import("@praxis/core/types").PraxisClient["artifacts"],
  });

  return render(
    <PraxisClientProvider client={client}>
      <ConceptLinkOverlay
        map={makeMap(conceptLinks)}
        editorRef={editorRef as RefObject<Editor | null>}
        courseId={brandId<"CourseId">("course-1") as CourseId}
        onLink={vi.fn()}
      />
    </PraxisClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  fakeEditor.store.listen.mockImplementation(() => () => {});
  fakeEditor.getShapePageBounds.mockReturnValue({
    x: 100,
    y: 200,
    maxX: 200,
    maxY: 250,
    w: 100,
    h: 50,
  });
  fakeEditor.pageToScreen.mockReturnValue({ x: 150, y: 260 });
});

describe("ConceptLinkOverlay — three-state glyphs", () => {
  it("renders ✓ glyph for a 'linked' node", async () => {
    const links: ConceptLink[] = [
      {
        elementId: "shape:linked",
        conceptId: "concept-a" as ConceptId,
        confidence: 1.0,
        linkState: "linked",
      },
    ];
    renderOverlay(links);

    await waitFor(() => {
      const glyph = screen.getByRole("img", { name: "Confirmed canonical link" });
      expect(glyph).toBeDefined();
      expect(glyph.textContent).toBe("✓");
    });
  });

  it("renders ? glyph for a 'best_guess' node", async () => {
    const links: ConceptLink[] = [
      {
        elementId: "shape:guess",
        conceptId: "concept-b" as ConceptId,
        confidence: 0.75,
        linkState: "best_guess",
      },
    ];
    renderOverlay(links);

    await waitFor(() => {
      const glyph = screen.getByRole("img", { name: /tentative canonical link/i });
      expect(glyph).toBeDefined();
      expect(glyph.textContent).toBe("?");
    });
  });

  it("renders no glyph for an 'unlinked' node", async () => {
    const links: ConceptLink[] = [
      {
        elementId: "shape:unlinked",
        conceptId: "concept-c" as ConceptId,
        confidence: 0.0,
        linkState: "unlinked",
      },
    ];
    renderOverlay(links);

    // Wait for effects to run then check no glyph is rendered.
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("img", { name: /canonical link/i })).toBeNull();
  });

  it("renders no glyph when linkState is absent (backwards compat)", async () => {
    const links: ConceptLink[] = [
      {
        elementId: "shape:old",
        conceptId: "concept-d" as ConceptId,
        confidence: 0.8,
        // No linkState field — pre-feature map
      },
    ];
    renderOverlay(links);

    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("img", { name: /canonical link/i })).toBeNull();
  });

  it("renders ghost edge SVG when best_guess glyph is hovered", async () => {
    const links: ConceptLink[] = [
      {
        elementId: "shape:hover-test",
        conceptId: "concept-e" as ConceptId,
        confidence: 0.8,
        linkState: "best_guess",
      },
    ];
    renderOverlay(links);

    await waitFor(() => {
      const glyph = screen.getByRole("img", { name: /tentative canonical link/i });
      expect(glyph).toBeDefined();
    });

    const glyph = screen.getByRole("img", { name: /tentative canonical link/i });

    // Ghost edge should not exist before hover.
    expect(document.querySelector("svg line")).toBeNull();

    // Hover the glyph.
    fireEvent.mouseEnter(glyph);

    await waitFor(() => {
      // After hover, a ghost edge SVG line should appear.
      const line = document.querySelector("svg line");
      expect(line).not.toBeNull();
    });

    // Mouse leave removes the ghost edge.
    fireEvent.mouseLeave(glyph);

    await waitFor(() => {
      expect(document.querySelector("svg line")).toBeNull();
    });
  });
});
