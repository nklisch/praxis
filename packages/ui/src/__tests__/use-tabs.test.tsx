/**
 * Tests for the useTabs hook.
 *
 * Verifies:
 * - Loads open tabs on mount; sets active to most-recently-active
 * - openTab adds and focuses the new tab
 * - closeTab removes tab; if active, focus shifts to next most-recent
 * - closeTab of last tab sets activeTabId to null
 * - switchTo calls tabs.touch and updates activeTabId
 * - renameTab is optimistic; reverts on server error
 * - reopenTab adds the tab to openTabs and focuses it
 */
import type { PraxisClient, TabId, TabSummary, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { useTabs } from "../hooks/use-tabs.js";

// ── Fixtures ───────────────────────────────────────────────────────────────────

function makeTab(overrides: Partial<TabSummary> = {}): TabSummary {
  return {
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

function makeClient(
  tabList: TabSummary[] = [],
  tabsOverrides?: Partial<PraxisClient["tabs"]>,
): PraxisClient {
  const newTab = tabList[0] ?? makeTab({ id: brandId<"TabId">("new-tab") });

  return {
    session: {} as PraxisClient["session"],
    tabs: {
      // biome-ignore lint/suspicious/noExplicitAny: studentId ignored on client
      listOpen: vi.fn().mockResolvedValue(tabList) as any,
      // biome-ignore lint/suspicious/noExplicitAny: studentId ignored on client
      list: vi.fn().mockResolvedValue(tabList) as any,
      get: vi.fn().mockResolvedValue(null),
      // biome-ignore lint/suspicious/noExplicitAny: studentId resolved server-side
      open: vi.fn().mockResolvedValue(newTab) as any,
      reopen: vi.fn().mockResolvedValue(newTab),
      close: vi.fn().mockResolvedValue(undefined),
      touch: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(newTab),
      ...tabsOverrides,
    },
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
  };
}

function wrapper(client: PraxisClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <PraxisClientProvider client={client}>{children}</PraxisClientProvider>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("useTabs", () => {
  it("loads open tabs on mount", async () => {
    const tab = makeTab();
    const client = makeClient([tab]);
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.openTabs).toHaveLength(1);
      expect(result.current.openTabs[0]?.id).toBe(tab.id);
    });
  });

  it("sets activeTabId to the most recently active tab on mount", async () => {
    const older = makeTab({
      id: brandId<"TabId">("tab-old"),
      lastSeenAt: (Date.now() - 10_000) as Timestamp,
    });
    const newer = makeTab({
      id: brandId<"TabId">("tab-new"),
      sortOrder: 1,
      lastSeenAt: (Date.now() - 1_000) as Timestamp,
    });
    const client = makeClient([older, newer]);
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.activeTabId).toBe(newer.id);
    });
  });

  it("starts with activeTabId null when no tabs", async () => {
    const client = makeClient([]);
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.activeTabId).toBeNull();
  });

  it("openTab adds the new tab to openTabs and focuses it", async () => {
    const tab = makeTab();
    const client = makeClient([], {
      // biome-ignore lint/suspicious/noExplicitAny: studentId resolved server-side
      open: vi.fn().mockResolvedValue(tab) as any,
    });
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.openTab({
        sessionId: brandId<"SessionId">("session-1"),
      });
    });

    expect(result.current.openTabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe(tab.id);
  });

  it("closeTab removes the tab from openTabs", async () => {
    const tab = makeTab();
    const client = makeClient([tab]);
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.openTabs).toHaveLength(1));

    await act(async () => {
      await result.current.closeTab(tab.id);
    });

    expect(result.current.openTabs).toHaveLength(0);
    expect(client.tabs.close).toHaveBeenCalledWith(tab.id);
  });

  it("closeTab of the active tab shifts focus to the most recent remaining tab", async () => {
    const active = makeTab({
      id: brandId<"TabId">("active"),
      lastSeenAt: (Date.now() - 100) as Timestamp,
      sortOrder: 0,
    });
    const other = makeTab({
      id: brandId<"TabId">("other"),
      sortOrder: 1,
      lastSeenAt: (Date.now() - 10_000) as Timestamp,
    });
    const client = makeClient([active, other]);
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(result.current.activeTabId).toBe(active.id);
    });

    await act(async () => {
      await result.current.closeTab(active.id);
    });

    expect(result.current.activeTabId).toBe(other.id);
    expect(result.current.openTabs).toHaveLength(1);
  });

  it("closeTab of the last tab sets activeTabId to null", async () => {
    const tab = makeTab();
    const client = makeClient([tab]);
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.activeTabId).toBe(tab.id));

    await act(async () => {
      await result.current.closeTab(tab.id);
    });

    expect(result.current.activeTabId).toBeNull();
  });

  it("switchTo calls tabs.touch and updates activeTabId", async () => {
    const tab1 = makeTab({
      id: brandId<"TabId">("tab-1"),
      lastSeenAt: (Date.now() - 1_000) as Timestamp,
    });
    const tab2 = makeTab({
      id: brandId<"TabId">("tab-2"),
      sortOrder: 1,
      lastSeenAt: (Date.now() - 5_000) as Timestamp,
    });
    const client = makeClient([tab1, tab2]);
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.activeTabId).toBe(tab1.id));

    await act(async () => {
      await result.current.switchTo(tab2.id);
    });

    expect(result.current.activeTabId).toBe(tab2.id);
    expect(client.tabs.touch).toHaveBeenCalledWith(tab2.id);
  });

  it("renameTab updates the title optimistically", async () => {
    const tab = makeTab({ title: "original title" });
    const renamed = { ...tab, title: "new title" };
    const client = makeClient([tab], {
      rename: vi.fn().mockResolvedValue(renamed),
    });
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.openTabs[0]?.title).toBe("original title"));

    await act(async () => {
      await result.current.renameTab(tab.id, "new title");
    });

    expect(result.current.openTabs[0]?.title).toBe("new title");
    expect(client.tabs.rename).toHaveBeenCalledWith(tab.id, "new title");
  });

  it("renameTab reverts on server error", async () => {
    const tab = makeTab({ title: "original title" });
    const client = makeClient([tab], {
      rename: vi.fn().mockRejectedValue(new Error("network error")),
    });
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.openTabs[0]?.title).toBe("original title"));

    await act(async () => {
      await result.current.renameTab(tab.id, "attempted new title");
    });

    // Title should revert to original on error
    expect(result.current.openTabs[0]?.title).toBe("original title");
    expect(result.current.error).toBeTruthy();
  });

  it("reopenTab adds the tab to openTabs and focuses it", async () => {
    const tab = makeTab({ id: brandId<"TabId">("reopened") });
    const client = makeClient([], {
      reopen: vi.fn().mockResolvedValue(tab),
    });
    const { result } = renderHook(() => useTabs(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reopenTab(tab.id);
    });

    expect(result.current.openTabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe(tab.id);
  });
});
