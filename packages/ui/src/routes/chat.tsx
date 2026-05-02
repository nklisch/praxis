import type { TabId } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AddDocumentButton } from "../components/add-document-button.js";
import { ChatTabBody } from "../components/chat-tab-body.js";
import { DocumentList } from "../components/document-list.js";
import { EmptyTabsState } from "../components/empty-tabs-state.js";
import { NewTabPicker } from "../components/new-tab-picker.js";
import { TabStrip } from "../components/tab-strip.js";
import { useDocuments } from "../hooks/use-documents.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { useTabs } from "../hooks/use-tabs.js";
import styles from "./chat.module.css";

/**
 * Chat workspace shell — owns the tab strip, documents sidebar, and new-tab
 * picker. All open tab bodies are mounted at once; inactive ones are hidden via
 * display:none so their message logs and in-flight streams survive tab switches.
 *
 * Handles both /chat (bare) and /chat/$tabId routes. When tabId param is
 * present, syncs it to the active tab; when activeTabId changes (e.g. closing
 * a tab), navigates to /chat/$tabId for the new active tab.
 */
export function ChatRoute() {
  const navigate = useNavigate();
  // strict: false handles both /chat and /chat/$tabId without throwing
  const { tabId } = useParams({ strict: false }) as { tabId?: string };

  const { openTabs, activeTabId, openTab, closeTab, switchTo, loading } = useTabs();
  const [showPicker, setShowPicker] = useState(false);

  // Documents sidebar — global to workspace, not per-tab
  const {
    documents,
    loading: docsLoading,
    error: docsError,
    refresh: refreshDocs,
    deleteDocument,
  } = useDocuments();
  const ingestion = useIngestion(refreshDocs);

  // Sync route param → active tab: when the URL has a tabId, ensure the hook
  // knows that tab is active. Intentionally omits activeTabId and switchTo from
  // deps — we only want this to fire when the URL tabId changes (navigation event),
  // not every time the hook's active tab shifts.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional one-way sync on tabId change
  useEffect(() => {
    if (tabId && tabId !== activeTabId) {
      switchTo(tabId as TabId);
    }
  }, [tabId]);

  // Sync active tab → route: when the hook's activeTabId changes (e.g. after
  // closing the active tab), navigate to the new active tab's URL.
  // Intentionally omits navigate, tabId, and openTabs from deps — we only want
  // to navigate when the hook's active tab id changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional one-way sync on activeTabId change
  useEffect(() => {
    if (loading) return; // don't navigate before initial load settles
    if (activeTabId && activeTabId !== tabId) {
      navigate({ to: "/chat/$tabId", params: { tabId: activeTabId } });
    } else if (!activeTabId && openTabs.length === 0 && tabId) {
      // All tabs closed — go to bare /chat
      navigate({ to: "/chat" });
    }
  }, [activeTabId, loading]);

  return (
    <div className={styles.layout}>
      {/* Documents sidebar — shared across all tabs */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Documents</span>
        </div>
        <div className={styles.sidebarContent}>
          <AddDocumentButton ingestion={ingestion} />
          <DocumentList
            documents={documents}
            loading={docsLoading}
            error={docsError}
            onDelete={deleteDocument}
          />
        </div>
      </aside>

      {/* Main workspace area */}
      <div className={styles.workspace}>
        <TabStrip
          tabs={openTabs}
          activeTabId={activeTabId}
          onSwitch={switchTo}
          onClose={closeTab}
          onNew={() => setShowPicker(true)}
        />

        {/* All tab bodies mounted; inactive ones display:none to preserve state. */}
        {openTabs.map((t) => (
          <div
            key={t.id}
            style={{ display: t.id === activeTabId ? "contents" : "none" }}
            className={styles.tabBodyMount}
          >
            <ChatTabBody tab={t} />
          </div>
        ))}

        {openTabs.length === 0 && !loading && <EmptyTabsState onNew={() => setShowPicker(true)} />}
      </div>

      {showPicker && (
        <NewTabPicker
          onClose={() => setShowPicker(false)}
          openTab={openTab}
          onOpened={(newTabId) => {
            setShowPicker(false);
            navigate({ to: "/chat/$tabId", params: { tabId: newTabId } });
          }}
        />
      )}
    </div>
  );
}
