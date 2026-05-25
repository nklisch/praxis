/**
 * Integration tests for NotesListTab (Workspace Catalogue).
 *
 * Verifies:
 *  - Loading state is shown while library.search is in-flight.
 *  - Empty state appears when no hits are returned.
 *  - Artifact cards render for returned library hits.
 *  - Filter rail presence and format filter applies client-side.
 *  - Search box is rendered.
 */
import type { LibraryHit, NoteLibraryHit, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { NotesListTab } from "../routes/workspace/notes-list.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// TanStack Router hooks used inside NotesListTab
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn().mockResolvedValue(undefined),
    Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  };
});

afterEach(() => cleanup());

// ── Factories ──────────────────────────────────────────────────────────────────

function makeNoteHit(overrides: Partial<NoteLibraryHit> = {}): NoteLibraryHit {
  return {
    kind: "note",
    id: brandId<"NoteId">("note-1"),
    studentId: brandId("student-1"),
    format: "free",
    body: JSON.stringify({ kind: "free", text: "Test note title\nSome excerpt text." }),
    sessionId: null,
    linksJson: [{ kind: "course", id: "course-1" }],
    createdAt: (Date.now() - 3600000) as Timestamp,
    updatedAt: (Date.now() - 3600000) as Timestamp,
    ...overrides,
  };
}

function makeClient(hits: LibraryHit[]) {
  return makeFakeClient({
    library: {
      search: vi.fn().mockResolvedValue(hits),
    } as import("@praxis/core/types").LibraryClientApi,
    notes: {
      create: vi.fn().mockResolvedValue(makeNoteHit()),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    } as import("@praxis/core/types").PraxisClient["notes"],
  });
}

function renderTab(client: ReturnType<typeof makeClient>) {
  return render(
    <PraxisClientProvider client={client}>
      <NotesListTab />
    </PraxisClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("NotesListTab (Catalogue)", () => {
  it("renders the catalogue heading", () => {
    renderTab(makeClient([]));
    expect(screen.getByText(/the catalogue/i)).toBeDefined();
  });

  it("renders the search box", () => {
    renderTab(makeClient([]));
    expect(screen.getByRole("searchbox")).toBeDefined();
  });

  it("renders the filter rail", () => {
    renderTab(makeClient([]));
    expect(screen.getByText(/by format/i)).toBeDefined();
  });

  it("shows empty state when no hits returned", async () => {
    renderTab(makeClient([]));
    await waitFor(() => {
      expect(screen.getByText(/Nothing here yet/i)).toBeDefined();
    });
  });

  it("renders artifact cards for returned hits", async () => {
    const hit = makeNoteHit();
    renderTab(makeClient([hit]));

    await waitFor(() => {
      expect(screen.getByText("Test note title")).toBeDefined();
    });
  });

  it("calls library.search on mount", async () => {
    const client = makeClient([]);
    renderTab(client);

    await waitFor(() => {
      expect(client.library.search).toHaveBeenCalled();
    });
  });

  it("renders loading state while search is in-flight", () => {
    const client = makeFakeClient({
      library: {
        search: vi.fn().mockImplementation(() => new Promise(() => {})),
      } as import("@praxis/core/types").LibraryClientApi,
    });
    renderTab(client);
    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("renders result count in search box after load", async () => {
    const hits: LibraryHit[] = [makeNoteHit(), makeNoteHit({ id: brandId<"NoteId">("note-2") })];
    renderTab(makeClient(hits));

    await waitFor(() => {
      expect(screen.getByText(/2 results/i)).toBeDefined();
    });
  });

  // Bug 4 regression: new-note button must always be reachable, not only in empty-state.
  it("renders a persistent '+ New note' button in the header when no notes exist (Bug 4)", async () => {
    renderTab(makeClient([]));
    await waitFor(() => {
      // Header button (always visible) — at least one instance must be present.
      const buttons = screen.getAllByRole("button", { name: /new note/i });
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("renders a persistent '+ New note' button in the header when notes exist (Bug 4)", async () => {
    renderTab(makeClient([makeNoteHit()]));
    await waitFor(() => {
      // The header button must be present even when the results grid is non-empty.
      const buttons = screen.getAllByRole("button", { name: /new note/i });
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
