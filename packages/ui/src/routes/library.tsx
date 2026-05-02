import type { CourseId, SessionId, TabId } from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CoursesSection } from "../components/library/courses-section.js";
import { DocumentsSection } from "../components/library/documents-section.js";
import { PacksSection } from "../components/library/packs-section.js";
import { RecentSessionsSection } from "../components/library/recent-sessions-section.js";
import { RouteHeader } from "../components/route-header.js";
import { usePraxisClient } from "../context/client-context.js";
import { useDocuments } from "../hooks/use-documents.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { useLibrary } from "../hooks/use-library.js";
import { useTabs } from "../hooks/use-tabs.js";
import { openSessionInTab } from "../lib/open-session-in-tab.js";
import styles from "./library.module.css";

/**
 * Library route — the front door of Praxis at both `/` and `/library`.
 *
 * Four editorial sections:
 * - Courses: in-progress courses with "Continue" → teach tab
 * - Packs: available knowledge packs with "Use this pack" → bootstrap tab
 * - Documents: ingested documents with add-document affordance
 * - Recent Sessions: open + closed sessions with reopen flow
 *
 * Pack import note: `client.packs.import(packId)` creates the concept graph
 * but does NOT create a course directly. "Use this pack" imports the pack
 * (idempotent) and then opens a bootstrap session so the agent creates the
 * course from the pack concept graph. This is a deliberate v1 trade-off —
 * the conversational tailoring of bootstrap is preserved.
 */
export function LibraryRoute() {
  const navigate = useNavigate();
  const client = usePraxisClient();
  const { data, loading, error, refresh } = useLibrary();
  const { openTabs, openTab, switchTo } = useTabs();
  const [importing, setImporting] = useState<string | null>(null);

  // Documents ingestion — refresh lib data after ingestion completes
  const { refresh: refreshDocuments } = useDocuments();
  const ingestion = useIngestion(async () => {
    await refreshDocuments();
    await refresh();
  });

  /** "Continue" on a course — opens a teach session in a new tab. */
  const handleCourseOpen = async (input: { courseId: CourseId; courseTitle: string }) => {
    await openSessionInTab({
      client,
      navigate,
      startOpts: { modeId: "teach", courseId: input.courseId },
      courseTitle: input.courseTitle,
    });
  };

  /**
   * "Use this pack" — imports the pack (idempotent) then opens a bootstrap
   * session so the agent creates a course from the concept graph.
   * The bootstrap agent is aware of imported packs via the packs tool.
   */
  const handleUsePack = async (packId: string, packName: string) => {
    setImporting(packId);
    try {
      // Import idempotent — no-op if already imported
      await client.packs.import(packId);
      // Open a bootstrap session; the agent handles course creation from the pack
      await openSessionInTab({
        client,
        navigate,
        startOpts: { modeId: "bootstrap" },
        courseTitle: packName,
      });
    } finally {
      setImporting(null);
    }
  };

  /**
   * Click a recent session row:
   * - If there's already an open tab for that session → switch to it
   * - Otherwise → open a new tab for the existing session (skip session.start)
   */
  const handleOpenSession = async (sessionId: SessionId, existingTabId?: TabId) => {
    if (existingTabId) {
      // Tab already open — just switch to it
      await switchTo(existingTabId);
      await navigate({ to: "/chat/$tabId", params: { tabId: existingTabId } });
    } else {
      // Open a new tab for the existing session (no session.start needed)
      const tab = await openTab({ sessionId });
      await navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
    }
  };

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament="⁂"
        kicker="LIBRARY"
        title="your library"
        deck="what you have to work with"
      />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.sections}>
        <CoursesSection courses={data?.courses} loading={loading} onOpenInTab={handleCourseOpen} />
        <PacksSection
          packs={data?.packs}
          loading={loading}
          onUsePack={handleUsePack}
          importing={importing}
        />
        <DocumentsSection documents={data?.documents} loading={loading} ingestion={ingestion} />
        <RecentSessionsSection
          sessions={data?.recentSessions}
          loading={loading}
          openTabs={openTabs}
          onOpenSession={handleOpenSession}
        />
      </div>
    </div>
  );
}
