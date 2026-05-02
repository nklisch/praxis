import type { SessionId, StudentId, TabId, TabSummary } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useCallback, useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseTabsResult {
  /** Open tabs, sorted by sortOrder. */
  readonly openTabs: ReadonlyArray<TabSummary>;
  /** The currently focused tab id, or null when no tabs are open. */
  readonly activeTabId: TabId | null;
  readonly loading: boolean;
  readonly error: string | null;

  /** Refresh the open-tabs list from the server. */
  refresh(): Promise<void>;

  /** Open a tab for an existing session and focus it. Returns the new tab. */
  openTab(input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary>;

  /** Reopen an archived tab and focus it. */
  reopenTab(tabId: TabId): Promise<TabSummary>;

  /** Close a tab. If it was the active tab, focus shifts to the most-recently-active remaining tab (or null). */
  closeTab(tabId: TabId): Promise<void>;

  /** Switch focus. Calls `tabs.touch` server-side. */
  switchTo(tabId: TabId): Promise<void>;

  /** Rename a tab. Updates local state optimistically; reverts on error. */
  renameTab(tabId: TabId, title: string): Promise<void>;
}

/**
 * Manages the open-tabs list and active tab for the chat workspace.
 *
 * All mutations update local state optimistically and call the server;
 * they revert on error. Loads `client.tabs.listOpen()` on mount and sets
 * the initial active tab to the most recently active (highest `lastSeenAt`).
 */
export function useTabs(): UseTabsResult {
  const client = usePraxisClient();
  const [openTabs, setOpenTabs] = useState<TabSummary[]>([]);
  const [activeTabId, setActiveTabId] = useState<TabId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // studentId is ignored by TabsClient — the IPC server resolves it from the
      // active student. Pass an empty branded value to satisfy the interface.
      const tabs = await client.tabs.listOpen(brandId<"StudentId">("") as StudentId);
      setOpenTabs(tabs);
      // On initial load, set active to the most recently active tab
      if (tabs.length > 0) {
        setActiveTabId((prev) => {
          if (prev !== null && tabs.some((t) => t.id === prev)) return prev;
          const mostRecent = tabs.reduce((best, t) => (t.lastSeenAt > best.lastSeenAt ? t : best));
          return mostRecent.id;
        });
      } else {
        setActiveTabId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Load on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const openTab = useCallback(
    async (input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary> => {
      // studentId is ignored by TabsClient — the IPC server resolves it from the
      // active student. Pass an empty branded value to satisfy the interface.
      const tab = await client.tabs.open({
        ...input,
        studentId: brandId<"StudentId">("") as StudentId,
      });
      setOpenTabs((prev) => {
        // Insert in sortOrder position; remove any duplicate if it somehow existed
        const without = prev.filter((t) => t.id !== tab.id);
        const insertAt = without.findIndex((t) => t.sortOrder > tab.sortOrder);
        if (insertAt === -1) return [...without, tab];
        return [...without.slice(0, insertAt), tab, ...without.slice(insertAt)];
      });
      setActiveTabId(tab.id);
      return tab;
    },
    [client],
  );

  const reopenTab = useCallback(
    async (tabId: TabId): Promise<TabSummary> => {
      const tab = await client.tabs.reopen(tabId);
      setOpenTabs((prev) => {
        const without = prev.filter((t) => t.id !== tab.id);
        return [...without, tab];
      });
      setActiveTabId(tab.id);
      return tab;
    },
    [client],
  );

  const closeTab = useCallback(
    async (tabId: TabId): Promise<void> => {
      // Optimistically remove from local state
      setOpenTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabId);

        setActiveTabId((currentActive) => {
          if (currentActive !== tabId) return currentActive;
          // Was the active tab — pick the most recently active remaining, or null
          if (remaining.length === 0) return null;
          const mostRecent = remaining.reduce((best, t) =>
            t.lastSeenAt > best.lastSeenAt ? t : best,
          );
          return mostRecent.id;
        });

        return remaining;
      });

      try {
        await client.tabs.close(tabId);
      } catch (err) {
        // Revert — refresh the full list from server
        setError(err instanceof Error ? err.message : String(err));
        await refresh();
      }
    },
    [client, refresh],
  );

  const switchTo = useCallback(
    async (tabId: TabId): Promise<void> => {
      setActiveTabId(tabId);
      try {
        await client.tabs.touch(tabId);
        // Update lastSeenAt optimistically
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.id === tabId ? { ...t, lastSeenAt: Date.now() as TabSummary["lastSeenAt"] } : t,
          ),
        );
      } catch {
        // Non-fatal: switching still works visually; server touch failing is cosmetic
      }
    },
    [client],
  );

  const renameTab = useCallback(
    async (tabId: TabId, title: string): Promise<void> => {
      // Optimistic update
      const prevTabs = openTabs;
      setOpenTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title } : t)));
      try {
        await client.tabs.rename(tabId, title);
      } catch (err) {
        // Revert
        setOpenTabs(prevTabs);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client, openTabs],
  );

  return {
    openTabs,
    activeTabId,
    loading,
    error,
    refresh,
    openTab,
    reopenTab,
    closeTab,
    switchTo,
    renameTab,
  };
}
