import type { SessionId, SessionSummary, TabSummary } from "@praxis/core/types";
import { COPY } from "../../lib/copy.js";
import { getModeMeta } from "../mode-meta.js";
import { LibrarySection } from "./library-section.js";
import styles from "./recent-sessions-section.module.css";

export interface RecentSessionsSectionProps {
  sessions: ReadonlyArray<SessionSummary> | undefined;
  loading: boolean;
  /**
   * Open tabs list from useTabs — used to detect whether a session already
   * has an open tab so we can switch to it rather than opening a duplicate.
   */
  openTabs: ReadonlyArray<TabSummary>;
  /**
   * Called when the user clicks a session row.
   * - If there's already an open tab for the session: caller switches to it
   * - Otherwise: caller opens a new tab for the existing session
   */
  onOpenSession: (sessionId: SessionId, existingTabId?: import("@praxis/core/types").TabId) => void;
}

/**
 * Editorial listing of recent sessions (open + closed) with the first user
 * message as a deck line. Clicking reopens or focuses the session in the chat.
 */
export function RecentSessionsSection({
  sessions,
  loading,
  openTabs,
  onOpenSession,
}: RecentSessionsSectionProps) {
  return (
    <LibrarySection<SessionSummary>
      ornament="❦"
      kicker="RECENT SESSIONS"
      loading={loading}
      items={sessions}
      emptyMessage={COPY.empty.librarySessionsEmpty}
      renderItems={(items) => (
        <ol className={styles.list}>
          {items.map((session) => {
            const meta = getModeMeta(session.modeId);
            const existingTab = openTabs.find((t) => t.sessionId === session.sessionId);
            const isOpen = existingTab !== undefined;

            return (
              <li key={session.sessionId} className={styles.item}>
                <button
                  type="button"
                  className={styles.itemButton}
                  onClick={() => onOpenSession(session.sessionId, existingTab?.id)}
                >
                  <span
                    className={styles.modeOrnament}
                    style={{ color: meta.tint }}
                    aria-hidden="true"
                  >
                    {meta.ornament}
                  </span>
                  <div className={styles.itemBody}>
                    <span className={styles.itemTitle}>
                      {meta.name}
                      {session.courseId ? " · session" : ""}
                      {isOpen && <span className={styles.openBadge}>open</span>}
                    </span>
                    {session.firstUserMessage && (
                      <span className={styles.itemDeck}>{session.firstUserMessage}</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    />
  );
}
