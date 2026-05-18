/**
 * Tests for the ChatRoute shell (Phase 14 multi-tab refactor).
 *
 * ChatRoute owns the documents sidebar, new-tab picker, and renders all open
 * ChatTabBody instances with display:none for inactive ones. The tab strip
 * has moved to the running head (<TopNav tabsSlot>) — tab-strip interactions
 * are covered in tab-strip.test.tsx and tab-strip-parent-child.test.tsx.
 * Session-acquisition logic lives in ChatTabBody — the shell itself does not
 * call session.start.
 *
 * Tests verify:
 * - EmptyTabsState renders when no tabs are open
 * - "Open a session" in EmptyTabsState mounts NewTabPicker
 * - Per-tab body mounts for each open tab (display:none for inactive)
 * - Scoped sidebar does not re-fetch when the tabs context emits an update
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabStrip } from "../components/tab-strip.js";
import { AuthProvider } from "../context/auth-context.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { TabsProvider } from "../context/tabs-context.js";
import { useTabs } from "../hooks/use-tabs.js";
import { ChatRoute } from "../routes/chat.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// Mutable route-match list — individual tests override this to simulate
// different route contexts (e.g. course route for scoped-docs tests).
// Default is an empty array → "all" scope → global documents list.
let mockRouteMatches: Array<{ routeId: string; params: Record<string, string> }> = [];

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
    // useDerivedScope calls useMatches to detect the active route. References
    // the mutable mockRouteMatches variable so per-test overrides work.
    useMatches: () => mockRouteMatches,
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
        <TabsProvider>
          <ChatRoute />
        </TabsProvider>
      </AuthProvider>
    </PraxisClientProvider>,
  );
}

/**
 * Renders ChatRoute alongside a TabStrip (connected via the shared TabsProvider)
 * to simulate the running-head + workspace layout for tests that need to click
 * tab buttons. The tab strip has moved to the running head in production, so
 * tests that exercise tab switching must include it explicitly.
 */
function renderWithTabStrip(client: PraxisClient) {
  function ShellWithTabs() {
    const { openTabs, activeTabId, closeTab, switchTo } = useTabs();
    return (
      <>
        <TabStrip
          tabs={openTabs}
          activeTabId={activeTabId}
          onSwitch={switchTo}
          onClose={closeTab}
          onNew={vi.fn()}
        />
        <ChatRoute />
      </>
    );
  }
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>
        <TabsProvider>
          <ShellWithTabs />
        </TabsProvider>
      </AuthProvider>
    </PraxisClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ChatRoute shell", () => {
  // Reset the mutable route-match list between tests so no test bleeds state
  // into the next. beforeEach runs after vitest's hoisted vi.mock factories.
  beforeEach(() => {
    mockRouteMatches = [];
  });

  it("calls tabs.listOpen exactly once on mount", async () => {
    const client = makeTestClient();
    renderWithClient(client);

    await waitFor(() => {
      // After lift-tabs-state-to-context: tabs state lives in <TabsProvider>;
      // all consumers (ChatRoute, useDerivedScope, sidebar) share one instance,
      // so listOpen fires exactly once per route navigation.
      expect(client.tabs.listOpen).toHaveBeenCalledTimes(1);
    });
  });

  it("renders EmptyTabsState when no tabs are open", async () => {
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText(/No tabs open/i)).toBeDefined();
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

  it("renders one tab body container per open tab (chat bodies visible)", async () => {
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
      // Chat bodies render session heads with their titles (not the tab strip).
      expect(screen.getAllByText("algebra · teach").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("calc · bootstrap").length).toBeGreaterThanOrEqual(1);
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

  // ── Three-column layout (epic-ui-redesign-ground-up-chat-workspace-side-panels-restyle) ──

  it("renders three-column layout: docs panel, workspace center, right panel", async () => {
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      // Left column: docs panel with aria-label
      expect(screen.getByRole("complementary", { name: /documents/i })).toBeDefined();
      // Right column: concepts + sidekick panel
      expect(screen.getByRole("complementary", { name: /concepts and sidekick/i })).toBeDefined();
    });
  });

  it("docs panel and right panel both render resize handles with separator role", async () => {
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      // Two separators: docs (right edge) + sidekick (left edge)
      const separators = screen.getAllByRole("separator");
      expect(separators.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("docs panel has aria-label 'Documents' in global scope", async () => {
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      const docsPanel = screen.getByRole("complementary", { name: /^documents$/i });
      expect(docsPanel).toBeDefined();
    });
  });

  it("right panel renders 'Concepts active' and 'Sidekick' sections", async () => {
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText(/concepts active/i)).toBeDefined();
      expect(screen.getByText(/sidekick/i)).toBeDefined();
    });
  });

  it("docs resize handle uses storage key praxis.panel.documents.width", async () => {
    // Seed a persisted width so the panel renders at that width.
    window.localStorage.setItem("praxis.panel.documents.width", "260");
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      const docsPanel = screen.getByRole("complementary", { name: /^documents$/i });
      // Width should reflect the persisted value from localStorage.
      expect((docsPanel as HTMLElement).style.width).toBe("260px");
    });

    window.localStorage.removeItem("praxis.panel.documents.width");
  });

  it("sidekick resize handle uses storage key praxis.panel.sidekick.width", async () => {
    // Seed a persisted width so the panel renders at that width.
    window.localStorage.setItem("praxis.panel.sidekick.width", "300");
    const client = makeTestClient({}, []);
    renderWithClient(client);

    await waitFor(() => {
      const rightPanel = screen.getByRole("complementary", { name: /concepts and sidekick/i });
      // Width should reflect the persisted value from localStorage.
      expect((rightPanel as HTMLElement).style.width).toBe("300px");
    });

    window.localStorage.removeItem("praxis.panel.sidekick.width");
  });

  // ── Regression: scoped docs sidebar stability (bug-chat-documents-sidebar-flicker) ───
  //
  // Root cause: useDerivedScope() returned a fresh object literal on every
  // render (e.g. `{ kind: "course", id: rawId }`). Even though the values
  // were identical, a new object reference caused the useCallback-wrapped
  // scopedLoader in chat.tsx to get a new identity, which re-triggered
  // useResource's useEffect and fired setLoading(true) — producing the
  // visible loading flash. Fix: useDerivedScope now wraps its return value
  // in useMemo keyed on (kind, id) primitives.
  //
  // This test pins the fix: listForScope must be called exactly once (on
  // initial mount), NOT again when openTabs gets a new array reference (e.g.
  // after switchTo updates lastSeenAt). Without the useMemo fix, openTabs
  // changing reference would propagate through useDerivedScope and produce
  // a new scope object, causing a second listForScope call.

  it("scoped sidebar does not re-fetch when the tabs context emits an unrelated update", async () => {
    // Arrange: course route → scope = { kind: "course", id: "course-stable" }
    mockRouteMatches = [{ routeId: "/courses/$courseId", params: { courseId: "course-stable" } }];

    const tab1 = makeTab({
      id: brandId<"TabId">("tab-s1"),
      title: "biology · teach",
      lastSeenAt: (Date.now() - 10_000) as Timestamp,
    });
    const tab2 = makeTab({
      id: brandId<"TabId">("tab-s2"),
      title: "chemistry · teach",
      modeId: "teach",
      sortOrder: 1,
      lastSeenAt: (Date.now() - 5_000) as Timestamp,
    });

    const listForScope = vi.fn().mockResolvedValue([]);

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
        listOpen: vi.fn().mockResolvedValue([tab1, tab2]),
        list: vi.fn().mockResolvedValue([tab1, tab2]),
        get: vi.fn().mockResolvedValue(null),
        open: vi.fn().mockResolvedValue(tab1),
        openDocument: vi.fn().mockResolvedValue(tab1),
        reopen: vi.fn().mockResolvedValue(tab1),
        close: vi.fn().mockResolvedValue(undefined),
        touch: vi.fn().mockResolvedValue(undefined),
        rename: vi.fn().mockResolvedValue(tab1),
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
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
        pageImage: vi.fn().mockResolvedValue(null),
      } as unknown as PraxisClient["documents"],
      documentScopes: {
        listForScope,
        listOrphaned: vi.fn().mockResolvedValue([]),
        listScopesForDocument: vi.fn().mockResolvedValue([]),
        attach: vi.fn().mockResolvedValue({ attached: true }),
        detach: vi.fn().mockResolvedValue({ detached: true }),
      } as PraxisClient["documentScopes"],
    });

    renderWithTabStrip(client);

    // Wait for the initial scoped-docs fetch to complete.
    await waitFor(() => {
      expect(listForScope).toHaveBeenCalledTimes(1);
    });

    // Act: click tab2 → calls switchTo(tab2.id) → sets activeTabId to tab2,
    // then after tabs.touch resolves sets openTabs to a new array reference
    // ({...t, lastSeenAt: ...} for tab2). This re-renders all useTabs()
    // consumers including useDerivedScope in ChatRoute.
    // The tab strip is rendered by renderWithTabStrip (simulating the running head).
    // Use getAllByRole + [0] to pick the first match (strip tab button) in case
    // multiple elements share the role="tab" name.
    const [tab2Button] = screen.getAllByRole("tab", { name: /chemistry · teach/i });
    fireEvent.click(tab2Button);

    // Let React flush the state updates from switchTo / openTabs change.
    await waitFor(() => {
      expect(client.tabs.touch).toHaveBeenCalledWith(tab2.id);
    });

    // Assert: listForScope must still have been called exactly once.
    // If useDerivedScope returned a new object on re-render, scopedLoader's
    // useCallback identity would change, useResource would re-fire its
    // useEffect, and listForScope would be called a second time.
    expect(listForScope).toHaveBeenCalledTimes(1);
  });
});
