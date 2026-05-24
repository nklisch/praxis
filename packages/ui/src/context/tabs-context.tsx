import type {
  DocumentId,
  DocumentTabSummary,
  SessionId,
  TabId,
  TabSummary,
} from "@praxis/core/types";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePraxisClient } from "./client-context.js";

/**
 * The reactive tabs API surfaced to renderer code.
 *
 * This is the same shape `useTabs` used to return when it produced its own
 * state. Lifting the state into a context lets the chat workspace and the
 * `useDerivedScope` hook share a single source of truth — one
 * `client.tabs.listOpen()` fetch per page mount instead of N.
 */
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

  /**
   * Open a document viewer tab and focus it.
   * The `title` should be the document filename, truncated to ~40 chars.
   * Returns the new DocumentTabSummary.
   */
  openDocumentTab(input: { documentId: DocumentId; title: string }): Promise<DocumentTabSummary>;

  /** Reopen an archived tab and focus it. */
  reopenTab(tabId: TabId): Promise<TabSummary>;

  /** Close a tab. If it was the active tab, focus shifts to the most-recently-active remaining tab (or null). */
  closeTab(tabId: TabId): Promise<void>;

  /** Switch focus. Calls `tabs.touch` server-side. */
  switchTo(tabId: TabId): Promise<void>;

  /** Rename a tab. Updates local state optimistically; reverts on error. */
  renameTab(tabId: TabId, title: string): Promise<void>;
}

const TabsContext = createContext<UseTabsResult | null>(null);

export interface TabsProviderProps {
  children: ReactNode;
}

/**
 * Hosts the open-tabs list and active-tab state shared by every consumer of
 * `useTabs()`. Mounted near the router root so the tab strip, the chat
 * workspace, and the sidebar scope-derivation hook all read from one
 * instance — one `client.tabs.listOpen()` fetch per route navigation,
 * not one per consumer.
 */
export function TabsProvider({ children }: TabsProviderProps) {
  const value = useTabsState();
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

/**
 * Read the shared tabs state. Throws if no `<TabsProvider>` is mounted —
 * surfacing missing-provider bugs immediately rather than producing a
 * silent second instance.
 */
export function useTabs(): UseTabsResult {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("useTabs must be used within a TabsProvider");
  }
  return ctx;
}

/**
 * Internal: the actual state hook that builds the `UseTabsResult` value.
 * Lives in the provider only — consumers should never call this directly.
 *
 * Behaviour mirrors the prior `useTabs()` implementation 1:1:
 *  - Loads `client.tabs.listOpen()` on mount.
 *  - Sets the initial active tab to the most-recently-active.
 *  - Mutations update local state optimistically and revert on error.
 */
function useTabsState(): UseTabsResult {
  const client = usePraxisClient();
  const [openTabs, setOpenTabs] = useState<TabSummary[]>([]);
  const [activeTabId, setActiveTabId] = useState<TabId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tabs = await client.tabs.listOpen();
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
      const tab = await client.tabs.open(input);
      setOpenTabs((prev) => {
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

  const openDocumentTab = useCallback(
    async (input: { documentId: DocumentId; title: string }): Promise<DocumentTabSummary> => {
      const tab = await client.tabs.openDocument(input);
      setOpenTabs((prev) => {
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
      // Capture the tab before removing it from state so we can fire the
      // best-effort discardIfUnpromoted call after the server close.
      const tab = openTabs.find((t) => t.id === tabId);

      setOpenTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabId);

        setActiveTabId((currentActive) => {
          if (currentActive !== tabId) return currentActive;
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
        setError(err instanceof Error ? err.message : String(err));
        await refresh();
      }

      // empty-session-cleanup: best-effort discard for session tabs that were
      // closed without ever receiving a user message. The server returns
      // { discarded: false } for already-promoted sessions — no harm calling
      // on any session tab. Fire-and-forget; errors are non-blocking.
      if (tab?.kind === "session" && tab.sessionId !== null) {
        client.session.discardIfUnpromoted(tab.sessionId).catch(() => {
          // Non-blocking: discard failure is tolerated; the sweep job is the
          // safety net for window-close and app-crash cases.
        });
      }
    },
    [client, openTabs, refresh],
  );

  const switchTo = useCallback(
    async (tabId: TabId): Promise<void> => {
      setActiveTabId(tabId);
      try {
        await client.tabs.touch(tabId);
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
      const prevTabs = openTabs;
      setOpenTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title } : t)));
      try {
        await client.tabs.rename(tabId, title);
      } catch (err) {
        setOpenTabs(prevTabs);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [client, openTabs],
  );

  return useMemo<UseTabsResult>(
    () => ({
      openTabs,
      activeTabId,
      loading,
      error,
      refresh,
      openTab,
      openDocumentTab,
      reopenTab,
      closeTab,
      switchTo,
      renameTab,
    }),
    [
      openTabs,
      activeTabId,
      loading,
      error,
      refresh,
      openTab,
      openDocumentTab,
      reopenTab,
      closeTab,
      switchTo,
      renameTab,
    ],
  );
}
