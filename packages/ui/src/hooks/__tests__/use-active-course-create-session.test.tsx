/**
 * Tests for useActiveCourseCreateSession.
 *
 * The hook reads open tabs from useTabs() and returns the sessionId of the
 * first course-create session tab, or null when none exists.
 */
import type {
  DocumentTabSummary,
  SessionTabSummary,
  TabId,
  TabSummary,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UseTabsResult } from "../use-tabs.js";

// ── Stable mock for useTabs ───────────────────────────────────────────────────
const mockUseTabsReturn: UseTabsResult = {
  openTabs: [],
  activeTabId: null,
  loading: false,
  error: null,
  refresh: vi.fn(),
  openTab: vi.fn(),
  openDocumentTab: vi.fn(),
  reopenTab: vi.fn(),
  closeTab: vi.fn(),
  switchTo: vi.fn(),
  renameTab: vi.fn(),
};

vi.mock("../use-tabs.js", () => ({
  useTabs: () => mockUseTabsReturn,
}));

// Import after mock registration.
const { useActiveCourseCreateSession } = await import("../use-active-course-create-session.js");

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSessionTab(overrides: Partial<SessionTabSummary> = {}): SessionTabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-1"),
    sessionId: brandId<"SessionId">("session-1"),
    modeId: "teach",
    title: "teach · algebra",
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

function setTabs(tabs: TabSummary[], activeTabId: TabId | null = null): void {
  mockUseTabsReturn.openTabs = tabs;
  mockUseTabsReturn.activeTabId = activeTabId;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useActiveCourseCreateSession", () => {
  beforeEach(() => {
    mockUseTabsReturn.openTabs = [];
    mockUseTabsReturn.activeTabId = null;
  });

  it("returns null when no tabs are open", () => {
    setTabs([]);
    const { result } = renderHook(() => useActiveCourseCreateSession());
    expect(result.current).toBeNull();
  });

  it("returns null when only teach-mode tabs are open", () => {
    setTabs([makeSessionTab({ modeId: "teach" })]);
    const { result } = renderHook(() => useActiveCourseCreateSession());
    expect(result.current).toBeNull();
  });

  it("returns null when only document tabs are open", () => {
    setTabs([makeDocumentTab()]);
    const { result } = renderHook(() => useActiveCourseCreateSession());
    expect(result.current).toBeNull();
  });

  it("returns the sessionId of the course-create tab", () => {
    const courseCreateSession = brandId<"SessionId">("course-create-session");
    setTabs([
      makeSessionTab({
        id: brandId<"TabId">("tab-course-create"),
        sessionId: courseCreateSession,
        modeId: "course-create",
      }),
    ]);
    const { result } = renderHook(() => useActiveCourseCreateSession());
    expect(result.current).toBe(courseCreateSession);
  });

  it("returns the first course-create sessionId when multiple tabs are open", () => {
    const firstSession = brandId<"SessionId">("course-create-first");
    const secondSession = brandId<"SessionId">("course-create-second");
    setTabs([
      makeSessionTab({ modeId: "teach" }),
      makeSessionTab({
        id: brandId<"TabId">("tab-cc-1"),
        sessionId: firstSession,
        modeId: "course-create",
        sortOrder: 1,
      }),
      makeSessionTab({
        id: brandId<"TabId">("tab-cc-2"),
        sessionId: secondSession,
        modeId: "course-create",
        sortOrder: 2,
      }),
    ]);
    const { result } = renderHook(() => useActiveCourseCreateSession());
    expect(result.current).toBe(firstSession);
  });

  it("returns null when tabs include quiz, homework, exam but no course-create", () => {
    setTabs([
      makeSessionTab({ modeId: "quiz" }),
      makeSessionTab({ id: brandId<"TabId">("tab-2"), modeId: "homework", sortOrder: 1 }),
    ]);
    const { result } = renderHook(() => useActiveCourseCreateSession());
    expect(result.current).toBeNull();
  });
});
