import type {
  CourseId,
  DocumentId,
  DocumentScopeAttachment,
  DocumentScopeSource,
  DocumentSummary,
  SessionId,
} from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePraxisClient } from "../../context/client-context.js";
import { useActiveBootstrapSession } from "../../hooks/use-active-bootstrap-session.js";
import { useResource } from "../../hooks/use-resource.js";
import { COPY } from "../../lib/copy.js";
import { openDocumentInTab } from "../../lib/open-document-in-tab.js";
import { AddDocumentButton } from "../add-document-button.js";
import { AddFolderButton } from "../add-folder-button.js";
import { EmptyState } from "../empty-state.js";
import { ErrorMessage } from "../error-message.js";
import { LoadingState } from "../loading-state.js";
import styles from "./documents-section.module.css";
import { LibrarySection } from "./library-section.js";

// ─── Tab types ───────────────────────────────────────────────────────────────

type LibraryTab = "all" | "course" | "session" | "orphaned";

// ─── Filter state ────────────────────────────────────────────────────────────

interface FilterState {
  mimeType: string;
  source: DocumentScopeSource | "any";
  dateRange: "any" | "last_7d" | "last_30d" | "last_year";
}

const DEFAULT_FILTERS: FilterState = {
  mimeType: "any",
  source: "any",
  dateRange: "any",
};

// ─── Normalised document row ─────────────────────────────────────────────────
//
// The "All" tab uses DocumentSummary (no scope fields); other tabs yield
// DocumentScopeAttachment. We normalise both into a common shape so the
// filter + render path is unified.

interface NormalisedDoc {
  documentId: string;
  filename: string;
  mimeType: string;
  chunkCount: number;
  hasPageImages: boolean;
  source: DocumentScopeSource | null;
  attachedAt: Date | null;
  /** For display in the deck line (All tab only). */
  ingestorLabel?: string;
}

function normaliseSummary(doc: DocumentSummary): NormalisedDoc {
  return {
    documentId: doc.documentId,
    filename: doc.filename,
    mimeType: doc.mimeType,
    chunkCount: doc.chunkCount,
    hasPageImages: doc.hasPageImages,
    source: null,
    attachedAt: null,
    ingestorLabel: doc.ingestorLabel,
  };
}

function normaliseAttachment(doc: DocumentScopeAttachment): NormalisedDoc {
  return {
    documentId: doc.documentId,
    filename: doc.filename,
    mimeType: doc.mimeType,
    chunkCount: doc.chunkCount,
    hasPageImages: doc.hasPageImages,
    source: doc.source,
    attachedAt: doc.attachedAt,
  };
}

// ─── Filter application ──────────────────────────────────────────────────────

function isWithin(date: Date | null, range: FilterState["dateRange"]): boolean {
  if (range === "any") return true;
  if (!date) return false;
  const now = Date.now();
  const ms = date.getTime();
  if (range === "last_7d") return now - ms <= 7 * 24 * 60 * 60 * 1000;
  if (range === "last_30d") return now - ms <= 30 * 24 * 60 * 60 * 1000;
  if (range === "last_year") return now - ms <= 365 * 24 * 60 * 60 * 1000;
  return true;
}

function applyFilters(docs: NormalisedDoc[], filters: FilterState): NormalisedDoc[] {
  return docs.filter((doc) => {
    if (filters.mimeType !== "any" && doc.mimeType !== filters.mimeType) return false;
    if (filters.source !== "any" && doc.source !== filters.source) return false;
    if (!isWithin(doc.attachedAt, filters.dateRange)) return false;
    return true;
  });
}

// ─── useTabDocuments — per-tab data loader ───────────────────────────────────
//
// Returns a UseResourceResult<NormalisedDoc[]>. The loader identity changes
// when the tab, courseId, or sessionId changes, triggering a fresh fetch.

function useTabDocuments(
  tab: LibraryTab,
  allTabDocs: ReadonlyArray<DocumentSummary> | undefined,
  allTabLoading: boolean,
  courseId: CourseId | null,
  sessionId: SessionId | null,
): { data: NormalisedDoc[] | undefined; loading: boolean; error: string | null } {
  const client = usePraxisClient();

  const courseLoader = useCallback(() => {
    if (!courseId) return Promise.resolve<DocumentScopeAttachment[]>([]);
    return client.documentScopes.listForScope({ kind: "course", id: courseId });
  }, [client, courseId]);

  const sessionLoader = useCallback(() => {
    if (!sessionId) return Promise.resolve<DocumentScopeAttachment[]>([]);
    return client.documentScopes.listForScope({ kind: "session", id: sessionId });
  }, [client, sessionId]);

  const orphanedLoader = useCallback(() => client.documentScopes.listOrphaned(), [client]);

  const courseResource = useResource(courseLoader);
  const sessionResource = useResource(sessionLoader);
  const orphanedResource = useResource(orphanedLoader);

  if (tab === "all") {
    return {
      data: allTabDocs?.map(normaliseSummary),
      loading: allTabLoading,
      error: null,
    };
  }
  if (tab === "course") {
    return {
      data: courseResource.data?.map(normaliseAttachment),
      loading: courseResource.loading,
      error: courseResource.error,
    };
  }
  if (tab === "session") {
    return {
      data: sessionResource.data?.map(normaliseAttachment),
      loading: sessionResource.loading,
      error: sessionResource.error,
    };
  }
  // orphaned
  return {
    data: orphanedResource.data?.map(normaliseAttachment),
    loading: orphanedResource.loading,
    error: orphanedResource.error,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface DocumentsSectionProps {
  documents: ReadonlyArray<DocumentSummary> | undefined;
  loading: boolean;
  /**
   * Ingestion state — passed to AddDocumentButton so the Library can trigger
   * the same ingestion flow as the chat sidebar.
   */
  // biome-ignore lint/suspicious/noExplicitAny: useIngestion return type; keeps dep direction clean
  ingestion?: any;
  /** Optional courseId from the current route context. */
  courseId?: CourseId;
}

/**
 * Scope-aware documents library surface.
 *
 * Renders a tab strip (All / This course / This session / Orphaned) and a
 * filter bar (file type, source, date range) above the document list.
 *
 * - "This course" tab is only visible when a courseId is provided.
 * - "This session" tab is only visible when a bootstrap session tab is open.
 * - Filter changes are client-side projections; they do not trigger re-fetches.
 * - Switching tabs resets all filters.
 */
export function DocumentsSection({
  documents,
  loading,
  ingestion,
  courseId,
}: DocumentsSectionProps) {
  const client = usePraxisClient();
  const navigate = useNavigate();
  const activeBootstrapSessionId = useActiveBootstrapSession();

  const [activeTab, setActiveTab] = useState<LibraryTab>("all");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const visibleTabs = useMemo<LibraryTab[]>(() => {
    const tabs: LibraryTab[] = ["all"];
    if (courseId) tabs.push("course");
    if (activeBootstrapSessionId) tabs.push("session");
    tabs.push("orphaned");
    return tabs;
  }, [courseId, activeBootstrapSessionId]);

  // If the active tab is no longer in the visible set (e.g., session closed), reset.
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab("all");
    }
  }, [visibleTabs, activeTab]);

  // Reset filters on tab switch.
  const handleTabChange = (tab: LibraryTab) => {
    setActiveTab(tab);
    setFilters(DEFAULT_FILTERS);
  };

  const {
    data: rawDocs,
    loading: tabLoading,
    error: tabError,
  } = useTabDocuments(activeTab, documents, loading, courseId ?? null, activeBootstrapSessionId);

  // Distinct mimeTypes from current tab's data — for the filter select.
  const mimeTypeOptions = useMemo<string[]>(() => {
    if (!rawDocs) return [];
    const seen = new Set<string>();
    for (const d of rawDocs) seen.add(d.mimeType);
    return Array.from(seen).sort();
  }, [rawDocs]);

  const filtered = useMemo(() => applyFilters(rawDocs ?? [], filters), [rawDocs, filters]);

  const hasActiveFilters =
    filters.mimeType !== "any" || filters.source !== "any" || filters.dateRange !== "any";

  const emptyMessage = hasActiveFilters
    ? COPY.empty.libraryDocumentsFiltered
    : emptyMessageForTab(activeTab);

  const tabLabel: Record<LibraryTab, string> = {
    all: "All",
    course: "This course",
    session: "This session",
    orphaned: "Orphaned",
  };

  return (
    <LibrarySection
      ornament="‡"
      kicker="DOCUMENTS"
      headerAction={
        ingestion ? (
          <div className={styles.headerButtons}>
            <AddDocumentButton ingestion={ingestion} />
            <AddFolderButton ingestion={ingestion} />
          </div>
        ) : undefined
      }
      loading={false}
      items={[true]}
      emptyMessage=""
      renderItems={() => (
        <div className={styles.surface}>
          {/* ── Tab strip ──────────────────────────────────────────────── */}
          {visibleTabs.length > 1 && (
            <nav className={styles.tabStrip} aria-label="Document scope tabs">
              {visibleTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={[
                    styles.tabButton,
                    activeTab === tab ? styles.tabButtonActive : "",
                  ].join(" ")}
                  onClick={() => handleTabChange(tab)}
                  aria-current={activeTab === tab ? "true" : undefined}
                >
                  {tabLabel[tab]}
                </button>
              ))}
            </nav>
          )}

          {/* ── Filter bar ─────────────────────────────────────────────── */}
          <div className={styles.filterBar}>
            {/* File type — derived from current tab data */}
            <label className={styles.filterLabel} htmlFor="doc-filter-mime">
              File type
            </label>
            <select
              id="doc-filter-mime"
              className={styles.filterSelect}
              value={filters.mimeType}
              onChange={(e) => setFilters((f) => ({ ...f, mimeType: e.target.value }))}
            >
              <option value="any">Any type</option>
              {mimeTypeOptions.map((mt) => (
                <option key={mt} value={mt}>
                  {mimeTypeLabel(mt)}
                </option>
              ))}
            </select>

            {/* Source — only meaningful for scope tabs */}
            {activeTab !== "all" && (
              <>
                <label className={styles.filterLabel} htmlFor="doc-filter-source">
                  Source
                </label>
                <select
                  id="doc-filter-source"
                  className={styles.filterSelect}
                  value={filters.source}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, source: e.target.value as FilterState["source"] }))
                  }
                >
                  <option value="any">Any source</option>
                  <option value="course-create">Course create</option>
                  <option value="manual">Manual</option>
                  <option value="ingestion">Ingestion</option>
                </select>
              </>
            )}

            {/* Date range */}
            <label className={styles.filterLabel} htmlFor="doc-filter-date">
              Date
            </label>
            <select
              id="doc-filter-date"
              className={styles.filterSelect}
              value={filters.dateRange}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateRange: e.target.value as FilterState["dateRange"] }))
              }
            >
              <option value="any">Any time</option>
              <option value="last_7d">Last 7 days</option>
              <option value="last_30d">Last 30 days</option>
              <option value="last_year">Last year</option>
            </select>
          </div>

          {/* ── Document list ───────────────────────────────────────────── */}
          {tabLoading ? (
            <LoadingState />
          ) : tabError ? (
            <ErrorMessage error={tabError} />
          ) : filtered.length === 0 ? (
            <EmptyState message={emptyMessage} compact />
          ) : (
            <ol className={styles.list}>
              {filtered.map((doc) => (
                <li key={doc.documentId} className={styles.item}>
                  <button
                    type="button"
                    className={styles.itemButton}
                    onClick={() =>
                      openDocumentInTab({
                        client,
                        navigate,
                        documentId: doc.documentId as DocumentId,
                        title: doc.filename.slice(0, 40),
                      })
                    }
                  >
                    <div className={styles.itemBody}>
                      <span className={styles.itemTitle}>{doc.filename}</span>
                      <span className={styles.itemDeck}>
                        {doc.ingestorLabel
                          ? `${doc.ingestorLabel} · `
                          : doc.source
                            ? `${doc.source} · `
                            : ""}
                        {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""}
                        {doc.hasPageImages ? " · pages" : ""}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    />
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyMessageForTab(tab: LibraryTab): string {
  switch (tab) {
    case "all":
      return COPY.empty.libraryDocumentsEmpty;
    case "course":
      return COPY.empty.libraryDocumentsCourseEmpty;
    case "session":
      return COPY.empty.libraryDocumentsSessionEmpty;
    case "orphaned":
      return COPY.empty.libraryDocumentsOrphanedEmpty;
  }
}

/** Human-readable label for a MIME type. Falls back to the raw string. */
function mimeTypeLabel(mimeType: string): string {
  const MAP: Record<string, string> = {
    "application/pdf": "PDF",
    "text/plain": "Plain text",
    "text/markdown": "Markdown",
    "text/html": "HTML",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
    "application/epub+zip": "EPUB",
  };
  return MAP[mimeType] ?? mimeType;
}
