/**
 * Tests for useDerivedScope — the 4-branch scope-inference hook.
 *
 * The hook combines:
 *   - useMatches() from @tanstack/react-router (route detection)
 *   - useTabs() (active tab detection)
 *
 * Both are mocked at the module level so tests control the exact route/tab
 * context for each scenario without a full router or client setup.
 *
 * Branches exercised:
 *   1. Course route + non-course-create session tab → { kind: "course", id }
 *   2. Course-create session tab is active          → { kind: "session", id }
 *   3. Active document tab                      → { kind: "all" } (pending listScopesForDocument)
 *   4. No relevant context                      → { kind: "all" } (default)
 *
 * Empty-state scenario:
 *   5. No tabs open on library route → { kind: "all" } (sidebar shows full library)
 */
import type {
  DocumentScope,
  DocumentTabSummary,
  PraxisClient,
  SessionTabSummary,
  TabId,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import type { UseTabsResult } from "../use-tabs.js";

// ── Stable mock for useTabs ────────────────────────────────────────────────────
// vi.mock hoists to the top of the file; the factory is re-evaluated per call.
// We store a mutable reference so individual tests can override the return value.
const mockUseTabsReturn: UseTabsResult = {
  openTabs: [],
  activeTabId: null,
  loading: false,
  error: null,
  refresh: vi.fn(),
  openTab: vi.fn(),
  reopenTab: vi.fn(),
  closeTab: vi.fn(),
  switchTo: vi.fn(),
  renameTab: vi.fn(),
};

vi.mock("../use-tabs.js", () => ({
  useTabs: () => mockUseTabsReturn,
}));

// ── Stable mock for @tanstack/react-router ────────────────────────────────────
// useMatches returns the currently-active route match stack.
let mockMatches: Array<{ routeId: string; params: Record<string, string> }> = [];

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useMatches: () => mockMatches,
  };
});

// Import after mocks are registered (vitest hoists vi.mock calls automatically).
const { useDerivedScope } = await import("../use-derived-scope.js");

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeSessionTab(overrides: Partial<SessionTabSummary> = {}): SessionTabSummary {
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
    title: "textbook.pdf",
    sortOrder: 1,
    openedAt: (Date.now() - 10_000) as Timestamp,
    lastSeenAt: (Date.now() - 3_000) as Timestamp,
    closedAt: null,
    ...overrides,
  };
}

function setTabs(tabs: TabSummary[], activeTabId: TabId | null): void {
  mockUseTabsReturn.openTabs = tabs;
  mockUseTabsReturn.activeTabId = activeTabId;
}

function setCourseRoute(courseId: string): void {
  mockMatches = [{ routeId: "/courses/$courseId", params: { courseId } }];
}

function clearRoute(): void {
  mockMatches = [];
}

// ── PraxisClient wrapper for the hook ─────────────────────────────────────────
// useDerivedScope reads `client.documentScopes.listScopesForDocument` to resolve
// branch 3. Most tests don't exercise branch 3 (no active document tab), so the
// default stub returns an empty array; branch-3 tests override via
// `setListScopesForDocument`.

let fakeClient: PraxisClient = makeFakeClient({
  documentScopes: {
    listScopesForDocument: vi.fn(async () => [] as DocumentScope[]),
  } as PraxisClient["documentScopes"],
});

function setListScopesForDocument(fn: (documentId: string) => Promise<DocumentScope[]>): void {
  fakeClient = makeFakeClient({
    documentScopes: {
      listScopesForDocument: vi.fn(fn),
    } as PraxisClient["documentScopes"],
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return <PraxisClientProvider client={fakeClient}>{children}</PraxisClientProvider>;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("useDerivedScope", () => {
  // Reset shared state between tests.
  beforeEach(() => {
    mockMatches = [];
    mockUseTabsReturn.openTabs = [];
    mockUseTabsReturn.activeTabId = null;
    fakeClient = makeFakeClient({
      documentScopes: {
        listScopesForDocument: vi.fn(async () => [] as DocumentScope[]),
      } as PraxisClient["documentScopes"],
    });
  });

  // ── Branch 1: course route ───────────────────────────────────────────────────

  it("branch 1: returns course scope when on a course route with no tabs open", () => {
    setCourseRoute("course-abc");
    setTabs([], null);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    expect(result.current).toEqual({ kind: "course", id: "course-abc" });
  });

  it("branch 1: returns course scope when on a course route with a teach tab active", () => {
    setCourseRoute("course-xyz");
    const tab = makeSessionTab({ modeId: "teach" });
    setTabs([tab], tab.id);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    expect(result.current).toEqual({ kind: "course", id: "course-xyz" });
  });

  it("branch 1: matches sub-routes of /courses/$courseId", () => {
    mockMatches = [{ routeId: "/courses/$courseId/map", params: { courseId: "course-map" } }];
    setTabs([], null);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    expect(result.current).toEqual({ kind: "course", id: "course-map" });
  });

  it("branch 1: course route with active document tab falls through (document tab excludes branch 1)", async () => {
    // When a document tab is active on a course route, branch 1 is skipped
    // (the document tab takes priority for what's "in view"). Branch 3 fires
    // and resolves to the document's primary scope.
    setCourseRoute("course-with-doc-tab");
    const tab = makeDocumentTab();
    setTabs([tab], tab.id);
    setListScopesForDocument(async () => []); // orphan document

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    // Branch 1 is skipped (document tab); branch 3 fires with no scopes → "all".
    await waitFor(() => {
      expect(result.current).toEqual({ kind: "all" });
    });
  });

  // ── Branch 2: course-create tab ──────────────────────────────────────────────

  it("branch 2: returns session scope when course-create tab is active", () => {
    clearRoute();
    const tab = makeSessionTab({
      id: brandId<"TabId">("tab-boot"),
      sessionId: brandId<"SessionId">("session-boot"),
      modeId: "course-create",
    });
    setTabs([tab], tab.id);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    expect(result.current).toEqual({ kind: "session", id: "session-boot" });
  });

  it("branch 2: course-create tab on a non-course route wins over branch 4 default", () => {
    // Library route — no course match.
    mockMatches = [{ routeId: "/library", params: {} }];
    const tab = makeSessionTab({
      id: brandId<"TabId">("tab-boot2"),
      sessionId: brandId<"SessionId">("session-boot2"),
      modeId: "course-create",
    });
    setTabs([tab], tab.id);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    expect(result.current).toEqual({ kind: "session", id: "session-boot2" });
  });

  it("branch 2: course-create tab on course route — branch 1 fires first (course wins)", () => {
    // Branch 1 fires before branch 2 — course scope is returned even when the
    // active session tab is course-create. The sidebar follows the route context first.
    setCourseRoute("course-priority");
    const tab = makeSessionTab({
      id: brandId<"TabId">("tab-boot3"),
      sessionId: brandId<"SessionId">("session-boot3"),
      modeId: "course-create",
    });
    setTabs([tab], tab.id);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    // Branch 1 wins: course route + session tab (not document tab).
    expect(result.current).toEqual({ kind: "course", id: "course-priority" });
  });

  // ── Branch 3: document tab — resolves to the document's primary scope ───────

  it("branch 3: active document tab resolves to its primary (course) scope", async () => {
    clearRoute();
    const tab = makeDocumentTab({
      id: brandId<"TabId">("tab-doc2"),
      documentId: brandId<"DocumentId">("doc-999"),
    });
    setTabs([tab], tab.id);
    setListScopesForDocument(async () => [
      { kind: "course", id: brandId<"CourseId">("course-from-doc") },
    ]);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    await waitFor(() => {
      expect(result.current).toEqual({ kind: "course", id: "course-from-doc" });
    });
  });

  it("branch 3: course scope is preferred over session scope when both exist", async () => {
    clearRoute();
    const tab = makeDocumentTab({
      id: brandId<"TabId">("tab-doc-multi"),
      documentId: brandId<"DocumentId">("doc-multi"),
    });
    setTabs([tab], tab.id);
    setListScopesForDocument(async () => [
      { kind: "session", id: brandId<"SessionId">("session-multi") },
      { kind: "course", id: brandId<"CourseId">("course-multi") },
    ]);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    await waitFor(() => {
      expect(result.current).toEqual({ kind: "course", id: "course-multi" });
    });
  });

  it("branch 3: session scope is returned when no course scope exists", async () => {
    clearRoute();
    const tab = makeDocumentTab({
      id: brandId<"TabId">("tab-doc-sess"),
      documentId: brandId<"DocumentId">("doc-sess"),
    });
    setTabs([tab], tab.id);
    setListScopesForDocument(async () => [
      { kind: "session", id: brandId<"SessionId">("session-only") },
    ]);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    await waitFor(() => {
      expect(result.current).toEqual({ kind: "session", id: "session-only" });
    });
  });

  it("branch 3: orphan document (no scopes attached) falls back to all", async () => {
    clearRoute();
    const tab = makeDocumentTab({
      id: brandId<"TabId">("tab-doc-orph"),
      documentId: brandId<"DocumentId">("doc-orphan"),
    });
    setTabs([tab], tab.id);
    setListScopesForDocument(async () => []);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    // While fetching → "all"; after resolution with [] → still "all".
    expect(result.current).toEqual({ kind: "all" });
    await waitFor(() => {
      expect(result.current).toEqual({ kind: "all" });
    });
  });

  // ── Branch 4: default ────────────────────────────────────────────────────────

  it("branch 4: returns all when on library route with a teach tab", () => {
    mockMatches = [{ routeId: "/library", params: {} }];
    const tab = makeSessionTab({ modeId: "teach" });
    setTabs([tab], tab.id);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    expect(result.current).toEqual({ kind: "all" });
  });

  it("branch 4: returns all when no tabs are open and no relevant route", () => {
    clearRoute();
    setTabs([], null);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    expect(result.current).toEqual({ kind: "all" });
  });

  it("branch 4: returns all when on the chat route with a non-course-create teach tab", () => {
    mockMatches = [{ routeId: "/chat/$tabId", params: { tabId: "tab-1" } }];
    const tab = makeSessionTab({ modeId: "teach" });
    setTabs([tab], tab.id);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    expect(result.current).toEqual({ kind: "all" });
  });

  // ── Empty-state scenario ─────────────────────────────────────────────────────

  it("empty-state: no open tabs on library route → all scope (full library shown)", () => {
    mockMatches = [{ routeId: "/", params: {} }];
    setTabs([], null);

    const { result } = renderHook(() => useDerivedScope(), { wrapper });

    expect(result.current).toEqual({ kind: "all" });
  });

  // ── Reference-stability scenarios (loop-flickers fix) ────────────────────────

  it("reference-stability: two renders with identical course-route state return the SAME reference", () => {
    // Anchor for loop-flickers-sidebar fix: the chat documents sidebar was
    // flashing because useDerivedScope returned a fresh object literal each
    // render. The hook now memoises on (kind, id) primitives so equal scopes
    // yield equal references.
    setCourseRoute("course-stable");
    setTabs([], null);

    const { result, rerender } = renderHook(() => useDerivedScope(), { wrapper });
    const first = result.current;
    rerender();
    const second = result.current;

    expect(Object.is(first, second)).toBe(true);
  });

  it("reference-stability: changing courseId produces a NEW reference with the new id", () => {
    setCourseRoute("course-a");
    setTabs([], null);

    const { result, rerender } = renderHook(() => useDerivedScope(), { wrapper });
    const first = result.current;

    setCourseRoute("course-b");
    rerender();
    const second = result.current;

    expect(Object.is(first, second)).toBe(false);
    expect(second).toEqual({ kind: "course", id: "course-b" });
  });

  it("reference-stability: course-create session branch returns a stable reference across re-renders", () => {
    clearRoute();
    const tab = makeSessionTab({
      id: brandId<"TabId">("tab-boot-stable"),
      sessionId: brandId<"SessionId">("session-boot-stable"),
      modeId: "course-create",
    });
    setTabs([tab], tab.id);

    const { result, rerender } = renderHook(() => useDerivedScope(), { wrapper });
    const first = result.current;
    rerender();
    const second = result.current;

    expect(Object.is(first, second)).toBe(true);
  });
});
