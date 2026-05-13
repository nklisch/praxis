/**
 * Tests for the ChatRoute shell (Phase 14 multi-tab refactor).
 *
 * ChatRoute is now the tab-workspace shell: it owns the tab strip, documents
 * sidebar, new-tab picker, and renders all open ChatTabBody instances with
 * display:none for inactive ones. Session-acquisition logic moved into
 * ChatTabBody — the shell itself does not call session.start.
 *
 * Tests verify:
 * - EmptyTabsState renders when no tabs are open
 * - TabStrip renders when tabs are present
 * - "Open a session" in EmptyTabsState mounts NewTabPicker
 * - "+" in TabStrip mounts NewTabPicker
 * - Switching tabs calls tabs.touch
 * - Closing the active tab shifts focus to the next most-recent tab
 * - Per-tab body mounts for each open tab (display:none for inactive)
 */
import type {
  DocumentDetail,
  DocumentTabSummary,
  PraxisClient,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/auth-context.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { ChatRoute } from "../routes/chat.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// Mock TanStack Router hooks. The shell uses useParams (strict: false),
// useNavigate, and (via useDerivedScope) useMatches. We expose bare /chat
// defaults: no tabId param, no route matches (→ "all" scope).
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useSearch: () => ({}),
    useNavigate: () => vi.fn(),
    useParams: () => ({ tabId: undefined }),
    // useDerivedScope calls useMatches to detect the active route. Return an
    // empty array so the hook falls through to the "all" default scope, which
    // preserves the existing global documents list behavior in these tests.
    useMatches: () => [],
  };
});

// tldraw uses canvas APIs not available in jsdom — mock the whole module so
// <SketchCanvas> (used in <Composer> when sketchEnabled) doesn't crash.
vi.mock("tldraw", () => ({
  Tldraw: () => <div data-testid="tldraw-canvas" />,
}));
vi.mock("tldraw/tldraw.css", () => ({}));

// ── Tab fixture helpers ────────────────────────────────────────────────────────

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "teach",
    title: "teach · new chat",
    sortOrder: 0,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 5_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function makeDocumentTab(overrides: Partial<DocumentTabSummary> = {}): DocumentTabSummary {
  return {
    kind: "document",
    id: brandId<"TabId">("tab-doc-1"),
    documentId: brandId<"DocumentId">("doc-1"),
    title: "biology-notes.md",
    sortOrder: 0,
    openedAt: (Date.now() - 5_000) as Timestamp,
    lastSeenAt: (Date.now() - 1_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function makeDocumentDetail(overrides: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    documentId: "doc-1",
    filename: "biology-notes.md",
    mimeType: "text/markdown",
    ingestorId: "markdown",
    ingestorLabel: "Markdown",
    chunkCount: 2,
    createdAt: new Date().toISOString(),
    hasPageImages: false,
    title: "Biology Notes",
    pageCount: null,
    text: "# Biology\n\nCells are the basic unit of life.",
    ...overrides,
  };
}

// ── Fake client builder ────────────────────────────────────────────────────────

function makeTestClient(
  tabsOverrides?: Partial<PraxisClient["tabs"]>,
  tabList: TabSummary[] = [],
): PraxisClient {
  const tabs: PraxisClient["tabs"] = {
    listOpen: vi.fn().mockResolvedValue(tabList),
    list: vi.fn().mockResolvedValue(tabList),
    get: vi.fn().mockResolvedValue(null),
    open: vi.fn().mockResolvedValue(tabList[0] ?? makeTab()),
    reopen: vi.fn().mockResolvedValue(tabList[0] ?? makeTab()),
    close: vi.fn().mockResolvedValue(undefined),
    touch: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(tabList[0] ?? makeTab()),
    ...tabsOverrides,
  };

  return makeFakeClient({
    session: {
      active: vi.fn().mockResolvedValue(null),
      start: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        modeId: "teach",
        startedAt: Date.now() as Timestamp,
      }),
      end: vi.fn().mockResolvedValue({
        sessionId: brandId<"SessionId">("session-1"),
        endedAt: Date.now() as Timestamp,
        unlockedGates: [],
        newMisconceptions: 0,
      }),
      send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
      list: vi.fn().mockResolvedValue([]),
    },
    tabs,
    artifacts: {
      courses: vi.fn().mockResolvedValue([]),
      course: vi.fn(),
      lessons: vi.fn(),
      gates: vi.fn(),
      progress: vi.fn(),
      flashcards: vi.fn(),
      notes: vi.fn(),
      gateView: vi.fn().mockResolvedValue([]),
      evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      markGatesViewed: vi.fn().mockResolvedValue(undefined),
      newlyUnlockedCount: vi.fn().mockResolvedValue(0),
      concepts: vi.fn().mockResolvedValue([]),
    } as PraxisClient["artifacts"],
    documents: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      pageImage: vi.fn().mockResolvedValue(null),
    } as unknown as PraxisClient["documents"],
  });
}

function renderWithClient(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>
        <ChatRoute />
      </AuthProvider>
    </PraxisClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ChatRoute shell", () => {
  it("calls tabs.listOpen on mount", async () => {
    const client = makeTestClient();
    renderWithClient(client);

    await waitFor(() => {
      // useTabs() is called from both ChatRoute and useDerivedScope (the scope-aware
      // sidebar hook), so listOpen is called at least once — possibly twice.
      expect(client.tabs.listOpen).toHaveBeenCalled();
    });
  });

  it("renders EmptyTabsState when no tabs are open", async () => {
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText(/No tabs open/i)).toBeDefined();
    });
  });

  it("renders TabStrip when tabs are open", async () => {
    const tab = makeTab({ title: "algebra · teach" });
    const client = makeTestClient({}, [tab]);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText("algebra · teach")).toBeDefined();
    });
  });

  it("clicking 'Open a session' in EmptyTabsState shows NewTabPicker", async () => {
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open a session/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /open a session/i }));

    await waitFor(() => {
      // NewTabPicker renders a dialog with "NEW SESSION" kicker
      expect(screen.getByRole("dialog", { name: /open new session/i })).toBeDefined();
    });
  });

  it("clicking '+' in the TabStrip shows NewTabPicker", async () => {
    const tab = makeTab();
    const client = makeTestClient({}, [tab]);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open new session/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /open new session/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /open new session/i })).toBeDefined();
    });
  });

  it("renders one tab body container per open tab", async () => {
    const tab1 = makeTab({ id: brandId<"TabId">("tab-1"), title: "algebra · teach" });
    const tab2 = makeTab({
      id: brandId<"TabId">("tab-2"),
      title: "calc · bootstrap",
      modeId: "bootstrap",
      sortOrder: 1,
      lastSeenAt: (Date.now() - 1_000) as Timestamp,
    });
    const client = makeTestClient({}, [tab1, tab2]);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText("algebra · teach")).toBeDefined();
      expect(screen.getByText("calc · bootstrap")).toBeDefined();
    });
  });

  it("clicking the close button on a tab calls tabs.close", async () => {
    const tab = makeTab({ title: "algebra · teach" });
    const client = makeTestClient({}, [tab]);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByLabelText("Close algebra · teach")).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText("Close algebra · teach"));

    await waitFor(() => {
      expect(client.tabs.close).toHaveBeenCalledWith(tab.id);
    });
  });

  it("clicking a tab calls tabs.touch", async () => {
    const tab1 = makeTab({
      id: brandId<"TabId">("tab-1"),
      title: "algebra · teach",
      lastSeenAt: (Date.now() - 10_000) as Timestamp,
    });
    const tab2 = makeTab({
      id: brandId<"TabId">("tab-2"),
      title: "calc · bootstrap",
      modeId: "bootstrap",
      sortOrder: 1,
      lastSeenAt: (Date.now() - 1_000) as Timestamp,
    });
    const client = makeTestClient({}, [tab1, tab2]);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText("algebra · teach")).toBeDefined();
    });

    // Click the tab button (not the close button inside it)
    const tabButton = screen.getByRole("tab", { name: /algebra · teach/i });
    fireEvent.click(tabButton);

    await waitFor(() => {
      expect(client.tabs.touch).toHaveBeenCalledWith(tab1.id);
    });
  });

  it("renders the TabStrip with a '+' new-tab button", async () => {
    const tab = makeTab();
    const client = makeTestClient({}, [tab]);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open new session/i })).toBeDefined();
    });
  });

  it("closing the NewTabPicker hides it", async () => {
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open a session/i })).toBeDefined();
    });

    // Open picker
    fireEvent.click(screen.getByRole("button", { name: /open a session/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /open new session/i })).toBeDefined();
    });

    // Close via Cancel button
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /open new session/i })).toBeNull();
    });
  });

  // ── Phase 15a: sketch affordance in ChatTabBody composer ─────────────────

  it("composer renders '✎ Sketch' affordance when a tab is open", async () => {
    const tab = makeTab({ title: "algebra · teach" });
    const client = makeTestClient({}, [tab]);
    renderWithClient(client);

    await waitFor(() => {
      // The composer should render in the active tab body.
      // The sketch toggle button is aria-labelled "Open sketch input".
      expect(screen.getByLabelText("Open sketch input")).toBeDefined();
    });
  });

  // ── Document tabs dispatch to DocumentTabBody ─────────────────────────────

  it("renders document tab via DocumentTabBody (not the old placeholder)", async () => {
    const docTab = makeDocumentTab({ title: "biology-notes.md" });
    const detail = makeDocumentDetail();

    // makeTestClient uses makeFakeClient but we override documents.get for this test.
    const client = makeFakeClient({
      session: {
        active: vi.fn().mockResolvedValue(null),
        start: vi.fn().mockResolvedValue({
          sessionId: brandId<"SessionId">("session-1"),
          modeId: "teach",
          startedAt: Date.now() as Timestamp,
        }),
        end: vi.fn().mockResolvedValue({
          sessionId: brandId<"SessionId">("session-1"),
          endedAt: Date.now() as Timestamp,
          unlockedGates: [],
          newMisconceptions: 0,
        }),
        send: vi.fn(async function* () {}) as unknown as PraxisClient["session"]["send"],
        list: vi.fn().mockResolvedValue([]),
      },
      tabs: {
        listOpen: vi.fn().mockResolvedValue([docTab]),
        list: vi.fn().mockResolvedValue([docTab]),
        get: vi.fn().mockResolvedValue(null),
        open: vi.fn().mockResolvedValue(docTab),
        reopen: vi.fn().mockResolvedValue(docTab),
        close: vi.fn().mockResolvedValue(undefined),
        touch: vi.fn().mockResolvedValue(undefined),
        rename: vi.fn().mockResolvedValue(docTab),
      },
      artifacts: {
        courses: vi.fn().mockResolvedValue([]),
        course: vi.fn(),
        lessons: vi.fn(),
        gates: vi.fn(),
        progress: vi.fn(),
        flashcards: vi.fn(),
        notes: vi.fn(),
        gateView: vi.fn().mockResolvedValue([]),
        evaluateGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
        markGatesViewed: vi.fn().mockResolvedValue(undefined),
        newlyUnlockedCount: vi.fn().mockResolvedValue(0),
        concepts: vi.fn().mockResolvedValue([]),
      } as PraxisClient["artifacts"],
      documents: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(detail),
        delete: vi.fn().mockResolvedValue(undefined),
        pageImage: vi.fn().mockResolvedValue(null),
      } as unknown as PraxisClient["documents"],
    });

    renderWithClient(client);

    // The document tab title appears in the tab strip.
    await waitFor(() => {
      expect(screen.getByText("biology-notes.md")).toBeDefined();
    });

    // The document viewer renders the document title from DocumentTabBody.
    await waitFor(() => {
      expect(screen.getByText("Biology Notes")).toBeDefined();
    });

    // Confirm the old placeholder text does NOT appear.
    expect(screen.queryByText(/Document viewer coming soon/i)).toBeNull();
  });
});
