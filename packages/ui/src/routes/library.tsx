import type {
  CourseId,
  Recommendation,
  SessionId,
  SessionSummary,
  TabId,
} from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { AddDocumentButton } from "../components/add-document-button.js";
import { getModeMeta } from "../components/mode-meta.js";
import { RecommendationRow } from "../components/recommendation-row.js";
import { usePraxisClient } from "../context/client-context.js";
import { useDocuments } from "../hooks/use-documents.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { useLibrary } from "../hooks/use-library.js";
import { useRecommendations } from "../hooks/use-recommendations.js";
import { useTabs } from "../hooks/use-tabs.js";
import { openSessionInTab } from "../lib/open-session-in-tab.js";
import styles from "./library.module.css";

/**
 * LibraryRoute — the Workbench.
 *
 * Replaces the old catalogue posture with "where do I pick up":
 * - Greeting line with count of ready recommendations
 * - Two-column layout: what's-next queue (left) + lately timeline (right)
 * - Footer row: packs / concept maps / documents
 *
 * The existing CoursesSection, PacksSection, DocumentsSection content
 * is surfaced through the footer cards and the "+ Create a course" CTA
 * per the Option-4 Workbench locked mock.
 */
export function LibraryRoute() {
  const navigate = useNavigate();
  const client = usePraxisClient();
  const { data, loading, error, refresh } = useLibrary();
  const { openTabs, openTab, switchTo } = useTabs();
  const { recommendations, loading: recsLoading } = useRecommendations({ limit: 5 });
  const [importing, setImporting] = useState<string | null>(null);

  // Documents ingestion — refresh lib data after ingestion completes
  const { refresh: refreshDocuments } = useDocuments();
  const ingestion = useIngestion(async () => {
    await refreshDocuments();
    await refresh();
  });

  // ── Session open helpers ────────────────────────────────────────────────────

  /** Click on a recent session row — switch to open tab or reopen. */
  const handleOpenSession = useCallback(
    async (sessionId: SessionId, existingTabId?: TabId) => {
      if (existingTabId) {
        await switchTo(existingTabId);
        await navigate({ to: "/chat/$tabId", params: { tabId: existingTabId } });
      } else {
        const tab = await openTab({ sessionId });
        await navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
      }
    },
    [navigate, openTab, switchTo],
  );

  /** "+ Create a course" — navigate to the upload / material step. */
  const handleCreateCourse = useCallback(async () => {
    await navigate({ to: "/course-create" });
  }, [navigate]);

  /** "Use this pack" — import pack then open a course-create session. */
  const handleUsePack = useCallback(
    async (packId: string, packName: string) => {
      setImporting(packId);
      try {
        await client.packs.import(packId);
        await openSessionInTab({
          client,
          navigate,
          openTab,
          startOpts: { modeId: "course-create" },
          courseTitle: packName,
        });
      } finally {
        setImporting(null);
      }
    },
    [client, navigate, openTab],
  );

  // Keep packName accessible but avoid lint warning if it's not used yet.
  void handleUsePack;
  void importing;

  // ── Recommendation action dispatch ─────────────────────────────────────────

  const handleRecAction = useCallback(
    async (rec: Recommendation) => {
      switch (rec.kind) {
        case "resume_session": {
          const existingTab = openTabs.find(
            (t) => t.kind === "session" && t.sessionId === rec.sessionId,
          );
          await handleOpenSession(rec.sessionId, existingTab?.id);
          break;
        }
        case "review_cards": {
          // Open a study-skills (flashcard review) session
          await openSessionInTab({
            client,
            navigate,
            openTab,
            startOpts: {
              modeId: "study-skills",
              ...(rec.courseId != null && { courseId: rec.courseId as CourseId }),
            },
          });
          break;
        }
        case "practice_concept": {
          await openSessionInTab({
            client,
            navigate,
            openTab,
            startOpts: { modeId: "teach", courseId: rec.courseId as CourseId },
          });
          break;
        }
        case "resume_draft": {
          // Re-open the course-create session that produced this draft
          await openSessionInTab({
            client,
            navigate,
            openTab,
            startOpts: { modeId: "course-create" },
          });
          break;
        }
        case "quick_check": {
          // Open a quiz session; the lessonId carries context for the agent
          // but the session API accepts modeId only at open time.
          await openSessionInTab({
            client,
            navigate,
            openTab,
            startOpts: { modeId: "quiz" },
          });
          break;
        }
      }
    },
    [client, navigate, openTab, openTabs, handleOpenSession],
  );

  // ── Greeting copy ──────────────────────────────────────────────────────────

  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const readyCount = recommendations.length;
  const countWord = numberWord(readyCount);

  // ── Timeline grouping ──────────────────────────────────────────────────────

  const timelineGroups = groupSessionsByAge(data?.recentSessions ?? []);

  // ── Footer card data ───────────────────────────────────────────────────────

  const packCount = data?.packs?.length ?? 0;
  const docCount = data?.documents?.length ?? 0;

  return (
    <div className={styles.layout}>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.body}>
        {/* ── Greeting ─────────────────────────────────────────────────────── */}
        <div className={styles.greeting}>
          <div className={styles.greetingKicker}>§ Library · workbench</div>
          <h1 className={styles.greetingTitle}>
            Good {timeOfDay}.{" "}
            {recsLoading ? (
              "Loading what's ready…"
            ) : readyCount === 0 ? (
              "You're all caught up."
            ) : (
              <>
                There's{" "}
                <span className={styles.greetingCount}>
                  {countWord} {readyCount === 1 ? "thing" : "things"}
                </span>{" "}
                ready for you.
              </>
            )}
          </h1>
          <p className={styles.greetingDeck}>
            A workbench rather than a catalogue. The left column is what to do next; the right is
            what you did recently. Everything else is a click away.
          </p>
        </div>

        {/* ── Two-column workbench ─────────────────────────────────────────── */}
        <div className={styles.workbench}>
          {/* Left: what's next queue */}
          <div className={styles.column}>
            <h2 className={styles.columnHeading}>
              <span className={styles.columnGlyph}>‖</span> What's next
            </h2>

            {recsLoading ? (
              <p className={styles.emptyQueue}>loading recommendations…</p>
            ) : recommendations.length === 0 ? (
              <p className={styles.emptyQueue}>
                Nothing urgent. Keep going with any course, or{" "}
                <button
                  type="button"
                  className={styles.footerCardLink}
                  onClick={handleCreateCourse}
                >
                  + Create a course
                </button>
                .
              </p>
            ) : (
              recommendations.map((rec, i) => (
                <RecommendationRow
                  key={recKey(rec, i)}
                  rec={rec}
                  priority={i + 1}
                  onAction={handleRecAction}
                />
              ))
            )}
          </div>

          {/* Right: lately timeline */}
          <div className={styles.column}>
            <h2 className={styles.columnHeading}>
              <span className={styles.columnGlyph}>§</span> Lately
            </h2>

            {loading ? (
              <p className={styles.timelineEmpty}>loading sessions…</p>
            ) : timelineGroups.length === 0 ? (
              <p className={styles.timelineEmpty}>No sessions yet. Open a course to begin.</p>
            ) : (
              <div className={styles.timeline}>
                {timelineGroups.map(({ label, sessions }) => (
                  <div key={label}>
                    <div className={styles.timelineSection}>{label}</div>
                    {sessions.map((session) => {
                      const meta = getModeMeta(session.modeId);
                      const existingTab = openTabs.find(
                        (t) => t.kind === "session" && t.sessionId === session.sessionId,
                      );
                      const isOpen = existingTab !== undefined;
                      const timeStr = formatTime(session.startedAt);

                      return (
                        <button
                          key={session.sessionId}
                          type="button"
                          className={`${styles.timelineEntry} ${styles.timelineEntrySession}`}
                          style={{ "--mode-dot-color": meta.tint } as React.CSSProperties}
                          onClick={() => handleOpenSession(session.sessionId, existingTab?.id)}
                          aria-label={`Open ${meta.name} session`}
                        >
                          <div className={styles.timelineWhen}>{timeStr}</div>
                          <div className={styles.timelineTitle}>
                            {meta.name}
                            {session.firstUserMessage ? ` · ${session.firstUserMessage}` : ""}
                          </div>
                          <div className={styles.timelineMeta}>
                            <span
                              className={styles.timelineModeDot}
                              style={{ background: meta.tint }}
                            />
                            {meta.name}
                            {isOpen && <span className={styles.timelineOpenBadge}>open</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer row ────────────────────────────────────────────────────── */}
        <div className={styles.footerRow}>
          {/* Packs */}
          <div className={styles.footerCard}>
            <h3 className={styles.footerCardHeading}>
              <span className={styles.footerCardGlyph}>¶</span> Packs available
            </h3>
            <div className={styles.footerCardCount}>{packCount}</div>
            <div className={styles.footerCardDetail}>
              {packCount === 0
                ? "No knowledge packs yet."
                : data?.packs
                    ?.slice(0, 2)
                    .map((p) => p.name)
                    .join(" · ")}
            </div>
            <button type="button" className={styles.footerCardLink} onClick={handleCreateCourse}>
              + Create a course ↗
            </button>
          </div>

          {/* Concept maps — navigate to the concept maps index */}
          <div className={styles.footerCard}>
            <h3 className={styles.footerCardHeading}>
              <span className={styles.footerCardGlyph}>‡</span> Concept maps
            </h3>
            <div className={styles.footerCardCount}>—</div>
            <div className={styles.footerCardDetail}>
              Sketch how the ideas connect — your tutor will compare and discuss.
            </div>
            <button
              type="button"
              className={styles.footerCardLink}
              onClick={() => navigate({ to: "/concept-maps" })}
            >
              open concept maps ↗
            </button>
          </div>

          {/* Documents */}
          <div className={styles.footerCard}>
            <h3 className={styles.footerCardHeading}>
              <span className={styles.footerCardGlyph}>†</span> Documents
            </h3>
            <div className={styles.footerCardCount}>{docCount}</div>
            <div className={styles.footerCardDetail}>
              {docCount === 0
                ? "No documents ingested."
                : data?.documents
                    ?.slice(0, 2)
                    .map((d) => d.filename)
                    .join(" · ")}
            </div>
            <AddDocumentButton ingestion={ingestion} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Group sessions into labelled time buckets: Today, Yesterday, "N days ago". */
function groupSessionsByAge(
  sessions: ReadonlyArray<SessionSummary>,
): Array<{ label: string; sessions: SessionSummary[] }> {
  if (sessions.length === 0) return [];

  const DAY = 86_400_000;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const buckets = new Map<string, SessionSummary[]>();

  for (const s of sessions) {
    const diffDays = Math.floor((startOfToday.getTime() - s.startedAt) / DAY);
    let label: string;
    if (diffDays <= 0) {
      label = "Today";
    } else if (diffDays === 1) {
      label = "Yesterday";
    } else if (diffDays < 7) {
      label = `${diffDays} days ago`;
    } else {
      label = `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? "s" : ""} ago`;
    }

    const bucket = buckets.get(label);
    if (bucket) {
      bucket.push(s);
    } else {
      buckets.set(label, [s]);
    }
  }

  return Array.from(buckets.entries()).map(([label, sessions]) => ({ label, sessions }));
}

/** Format a Timestamp as a short time string: "14:22" or "Mon 14:22". */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();

  const isSameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isSameDay) return time;

  const day = d.toLocaleDateString([], { weekday: "short" });
  return `${day} ${time}`;
}

/** A stable key for a recommendation in a list. */
function recKey(rec: Recommendation, fallbackIdx: number): string {
  switch (rec.kind) {
    case "resume_session":
      return `resume_session:${rec.sessionId}`;
    case "review_cards":
      return `review_cards:${rec.courseId ?? "global"}`;
    case "practice_concept":
      return `practice_concept:${rec.conceptId}`;
    case "resume_draft":
      return `resume_draft:${rec.draftId}`;
    case "quick_check":
      return `quick_check:${rec.lessonId}`;
    default:
      return `rec:${fallbackIdx}`;
  }
}

/** Convert a small number to a word for the greeting line. */
function numberWord(n: number): string {
  const WORDS = ["zero", "one", "two", "three", "four", "five"];
  return n < WORDS.length ? (WORDS[n] ?? String(n)) : String(n);
}
