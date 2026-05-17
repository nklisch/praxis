import type { TabId } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AddDocumentButton } from "../components/add-document-button.js";
import { ChatTabBody } from "../components/chat-tab-body.js";
import { DocumentList } from "../components/document-list.js";
import { EmptyState } from "../components/empty-state.js";
import { NewTabPicker } from "../components/new-tab-picker.js";
import { ResizeHandle } from "../components/resize-handle.js";
import { TabStrip } from "../components/tab-strip.js";
import { usePraxisClient } from "../context/client-context.js";
import { useAssignmentIssuedSpawn } from "../hooks/use-assignment-issued-spawn.js";
import { useDerivedScope } from "../hooks/use-derived-scope.js";
import { useDocuments } from "../hooks/use-documents.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { useResizableWidth } from "../hooks/use-resizable-width.js";
import { useResource } from "../hooks/use-resource.js";
import { useTabs } from "../hooks/use-tabs.js";
import { COPY } from "../lib/copy.js";
import styles from "./chat.module.css";

/**
 * Chat workspace shell — owns the tab strip, documents sidebar, and new-tab
 * picker. All open tab bodies are mounted at once; inactive ones are hidden via
 * display:none so their message logs and in-flight streams survive tab switches.
 *
 * Handles both /chat (bare) and /chat/$tabId routes. When tabId param is
 * present, syncs it to the active tab; when activeTabId changes (e.g. closing
 * a tab), navigates to /chat/$tabId for the new active tab.
 *
 * No RouteHeader: this is a full-screen workspace shell (sidebar + tab strip +
 * chat bodies). It is a structural container, not a library/list route — it has
 * no persistent page title or kicker that RouteHeader would provide.
 */
export function ChatRoute() {
  const navigate = useNavigate();
  // strict: false handles both /chat and /chat/$tabId without throwing
  const { tabId } = useParams({ strict: false }) as { tabId?: string };

  const { openTabs, activeTabId, openTab, closeTab, switchTo, loading } = useTabs();
  const [showPicker, setShowPicker] = useState(false);

  // Phase 16: auto-spawn quiz/homework/exam tabs when the tutor authors an
  // assignment. Mounted here (once per workspace) so it fires regardless of
  // which tab is active. No navigation — the new tab appears in the strip.
  // We pass openTab from the existing useTabs() instance to avoid a duplicate
  // hook mount that would fire a second tabs.listOpen call.
  useAssignmentIssuedSpawn(openTab);

  // Scope-aware sidebar: derive scope from active route + active tab.
  const scope = useDerivedScope();

  // Global (unscoped) document list — used when scope is "all".
  const {
    documents: allDocuments,
    loading: allDocsLoading,
    error: allDocsError,
    refresh: refreshDocs,
    deleteDocument,
  } = useDocuments();

  // Scoped document list — used when scope is "course" or "session".
  const client = usePraxisClient();
  const scopedLoader = useCallback(async () => {
    if (scope.kind === "all") return null;
    return client.documentScopes.listForScope(scope);
  }, [client, scope]);
  const {
    data: scopedDocs,
    loading: scopedLoading,
    error: scopedError,
  } = useResource(scopedLoader);

  const isScoped = scope.kind !== "all";
  const documents = isScoped
    ? (scopedDocs ?? []).map((d) => ({
        documentId: d.documentId,
        filename: d.filename,
        mimeType: d.mimeType,
        ingestorId: "",
        ingestorLabel: "",
        chunkCount: d.chunkCount,
        createdAt: d.attachedAt.toISOString(),
        hasPageImages: d.hasPageImages,
      }))
    : allDocuments;
  const docsLoading = isScoped ? scopedLoading : allDocsLoading;
  const docsError = isScoped ? scopedError : allDocsError;

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

  // Persisted user-resizable width for the documents sidebar. Per-device
  // (localStorage); zero IPC round-trip on read = no flash-of-default-width.
  // See feature epic-editorial-polish-pass-resizable-panels.
  const { width: sidebarWidth, handleProps: sidebarHandleProps } = useResizableWidth({
    storageKey: "praxis.panel.chat-documents.width",
    defaultWidth: 220,
    minWidth: 160,
    maxWidth: 480,
    side: "right",
  });

  return (
    <div className={styles.layout}>
      {/* Documents sidebar — scope-aware: shows docs for the active context */}
      <aside className={styles.sidebar} style={{ width: `${sidebarWidth}px` }}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>
            {scope.kind === "course"
              ? "Course Documents"
              : scope.kind === "session"
                ? "Session Documents"
                : "Documents"}
          </span>
        </div>
        <div className={styles.sidebarContent}>
          {/* Only show the add-document affordance in the global (all) view;
              scoped views use the library picker or course doc-picker instead. */}
          {!isScoped && <AddDocumentButton ingestion={ingestion} />}
          {isScoped && !docsLoading && !docsError && documents.length === 0 ? (
            <EmptyState
              message={COPY.empty.attachedDocsEmpty}
              compact
              action={{ label: "Go to library", onClick: () => navigate({ to: "/library" }) }}
            />
          ) : (
            <DocumentList
              documents={documents}
              loading={docsLoading}
              error={docsError}
              onDelete={deleteDocument}
            />
          )}
        </div>
      </aside>

      <ResizeHandle side="right" {...sidebarHandleProps} />

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

        {openTabs.length === 0 && !loading && (
          <EmptyState
            message={COPY.empty.tabs}
            action={{ label: "Open a session", onClick: () => setShowPicker(true) }}
          />
        )}
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
