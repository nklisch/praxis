/**
 * Tests for useTabs hook — focusing on the openDocumentTab callback added
 * in the document-library tab-kind foundation story.
 *
 * Existing session tab behaviour (openTab, reopenTab, closeTab, switchTo,
 * renameTab, refresh) is exercised by the integration tests in the session
 * flow; here we cover the discriminated-union extension path.
 */
import type {
  DocumentId,
  DocumentTabSummary,
  PraxisClient,
  SessionId,
  TabId,
  TabSummary,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { useTabs } from "../use-tabs.js";

afterEach(() => cleanup());

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDocumentTab(overrides?: Partial<DocumentTabSummary>): DocumentTabSummary {
  return {
    kind: "document",
    id: brandId<"TabId">("tab-doc-1") as TabId,
    documentId: brandId<"DocumentId">("doc-1") as DocumentId,
    title: "lecture-notes.pdf",
    sortOrder: 0,
    openedAt: Date.now() as DocumentTabSummary["openedAt"],
    lastSeenAt: Date.now() as DocumentTabSummary["lastSeenAt"],
    closedAt: null,
    ...overrides,
  };
}

function makeSessionTab(): TabSummary {
  return {
    kind: "session",
    id: brandId<"TabId">("tab-sess-1") as TabId,
    sessionId: brandId<"SessionId">("sess-1") as SessionId,
    modeId: "teach",
    title: "teach · new chat",
    sortOrder: 0,
    openedAt: Date.now() as TabSummary["openedAt"],
    lastSeenAt: Date.now() as TabSummary["lastSeenAt"],
    closedAt: null,
  };
}

function makeClient(overrides: Partial<PraxisClient["tabs"]> = {}): PraxisClient {
  return makeFakeClient({
    tabs: {
      listOpen: vi.fn().mockResolvedValue([]),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      open: vi.fn().mockResolvedValue(makeSessionTab()),
      openDocument: vi.fn().mockResolvedValue(makeDocumentTab()),
      reopen: vi.fn().mockResolvedValue(makeSessionTab()),
      close: vi.fn().mockResolvedValue(undefined),
      touch: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(makeSessionTab()),
      ...overrides,
    } as PraxisClient["tabs"],
  });
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("useTabs — openDocumentTab", () => {
  it("calls client.tabs.openDocument with the given documentId and title", async () => {
    const docTab = makeDocumentTab();
    const openDocumentMock = vi.fn().mockResolvedValue(docTab);
    const client = makeClient({ openDocument: openDocumentMock });

    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const documentId = brandId<"DocumentId">("doc-xyz") as DocumentId;
    await act(async () => {
      await result.current.openDocumentTab({ documentId, title: "slides.pdf" });
    });

    expect(openDocumentMock).toHaveBeenCalledWith({ documentId, title: "slides.pdf" });
  });

  it("adds the document tab to openTabs and sets it as activeTabId", async () => {
    const docTab = makeDocumentTab({ id: brandId<"TabId">("tab-new-doc") as TabId });
    const client = makeClient({ openDocument: vi.fn().mockResolvedValue(docTab) });

    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.openDocumentTab({
        documentId: brandId<"DocumentId">("doc-1") as DocumentId,
        title: "lecture-notes.pdf",
      });
    });

    expect(result.current.openTabs.some((t) => t.id === docTab.id)).toBe(true);
    expect(result.current.activeTabId).toBe(docTab.id);
  });

  it("returns a DocumentTabSummary with kind=document", async () => {
    const docTab = makeDocumentTab();
    const client = makeClient({ openDocument: vi.fn().mockResolvedValue(docTab) });

    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: DocumentTabSummary | undefined;
    await act(async () => {
      returned = await result.current.openDocumentTab({
        documentId: brandId<"DocumentId">("doc-1") as DocumentId,
        title: "lecture-notes.pdf",
      });
    });

    expect(returned?.kind).toBe("document");
    expect(returned?.documentId).toBe(docTab.documentId);
    expect(returned?.title).toBe(docTab.title);
  });

  it("inserts document tab in sortOrder position", async () => {
    // Pre-populate with a session tab at sortOrder=0
    const existingSession = makeSessionTab();
    const docTab = makeDocumentTab({
      id: brandId<"TabId">("tab-doc-2") as TabId,
      sortOrder: 1,
    });

    const client = makeClient({
      listOpen: vi.fn().mockResolvedValue([existingSession]),
      openDocument: vi.fn().mockResolvedValue(docTab),
    });

    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.openTabs).toHaveLength(1));

    await act(async () => {
      await result.current.openDocumentTab({
        documentId: brandId<"DocumentId">("doc-2") as DocumentId,
        title: "doc-2.pdf",
      });
    });

    expect(result.current.openTabs).toHaveLength(2);
    // Session tab (sortOrder=0) comes first; document tab (sortOrder=1) comes second
    expect(result.current.openTabs[0]?.id).toBe(existingSession.id);
    expect(result.current.openTabs[1]?.id).toBe(docTab.id);
  });

  it("openDocumentTab coexists with openTab in the same hook instance", async () => {
    const sessionTab = makeSessionTab();
    const docTab = makeDocumentTab({ sortOrder: 1 });

    const client = makeClient({
      open: vi.fn().mockResolvedValue(sessionTab),
      openDocument: vi.fn().mockResolvedValue(docTab),
    });

    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.openTab({
        sessionId: brandId<"SessionId">("sess-1") as SessionId,
      });
    });

    await act(async () => {
      await result.current.openDocumentTab({
        documentId: brandId<"DocumentId">("doc-1") as DocumentId,
        title: "my-doc.pdf",
      });
    });

    expect(result.current.openTabs).toHaveLength(2);
    const kinds = result.current.openTabs.map((t) => t.kind);
    expect(kinds).toContain("session");
    expect(kinds).toContain("document");
  });
});
