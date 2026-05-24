/**
 * /progress — Course-by-Course Review (Option 1).
 *
 * One chapter per course: mastery rollup in the header, three-column body
 * (you-are-here / stuck-on / recently). Consumes CourseProgressRollup[] from
 * ProgressService via the client.progress.rollup() IPC call.
 */

import type { CourseProgressRollup } from "@praxis/core/types";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { CoverageBar } from "../components/coverage-bar.js";
import { EmptyState } from "../components/empty-state.js";
import { ErrorMessage } from "../components/error-message.js";
import { LoadingState } from "../components/loading-state.js";
import { RouteHeader } from "../components/route-header.js";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import styles from "./progress.module.css";

// ── Roman numeral helpers ──────────────────────────────────────────────────────

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"] as const;

function toRoman(n: number): string {
  return (n <= ROMAN.length ? ROMAN[n - 1] : String(n)) ?? String(n);
}

// ── Relative-time formatter ───────────────────────────────────────────────────

/**
 * Format a Unix-millisecond timestamp as a relative label.
 * e.g. "today", "yesterday", "3 days ago", "2 weeks ago".
 */
function formatRelativeTime(atMs: number): string {
  const DAY = 86_400_000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((startOfToday.getTime() - atMs) / DAY);

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  const weeks = Math.floor(diffDays / 7);
  return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface YouAreHereProps {
  lesson: CourseProgressRollup["currentLesson"];
  gate: CourseProgressRollup["activeGate"];
}

function YouAreHere({ lesson, gate }: YouAreHereProps) {
  if (!lesson && !gate) {
    return (
      <div>
        <div className={styles.sectionLabel}>You are here</div>
        <p className={styles.positionEmpty}>No active lesson.</p>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.sectionLabel}>You are here</div>
      {lesson && (
        <p className={styles.positionLine}>
          Working on <strong>{lesson.title}</strong> — lesson {lesson.index} of {lesson.total}.
        </p>
      )}
      {gate && (
        <p className={styles.positionGate}>
          Next gate: <strong>{gate.title}</strong> — {gate.lockReason}
        </p>
      )}
      {!gate && <p className={styles.positionGate}>No upcoming gate.</p>}
    </div>
  );
}

interface StuckOnProps {
  concepts: CourseProgressRollup["stuckConcepts"];
}

function StuckOn({ concepts }: StuckOnProps) {
  return (
    <div>
      <div className={styles.sectionLabel}>Stuck on</div>
      {concepts.length === 0 ? (
        <p className={styles.stuckEmpty}>No stuck concepts.</p>
      ) : (
        <ul className={styles.stuckList}>
          {concepts.map((c) => (
            <li key={c.conceptId} className={styles.stuckItem}>
              <span className={styles.stuckName}>{c.name}</span>
              <span className={styles.stuckMastery}>{c.mastery.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface RecentlyProps {
  events: CourseProgressRollup["recentEvents"];
}

function formatEventLabel(event: CourseProgressRollup["recentEvents"][number]): string {
  switch (event.kind) {
    case "session":
      return `Session: ${event.label}`;
    case "gate":
      return `Gate passed: ${event.label}`;
    case "grade":
      return `Quiz ${event.label} · ${event.detail}`;
  }
}

function Recently({ events }: RecentlyProps) {
  return (
    <div>
      <div className={styles.sectionLabel}>Recently</div>
      {events.length === 0 ? (
        <p className={styles.recentEmpty}>No recent activity.</p>
      ) : (
        <ul className={styles.recentList}>
          {events.map((ev, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: event list has no stable id; position is stable (newest-first, capped at 3)
            <li key={i} className={styles.recentItem}>
              <span className={styles.recentWhen}>{formatRelativeTime(ev.at)}</span>
              <span className={styles.recentDesc}>
                <em>{formatEventLabel(ev)}</em>
                {ev.kind !== "grade" && ` · ${ev.detail}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── CourseChapter ─────────────────────────────────────────────────────────────

interface CourseChapterProps {
  rollup: CourseProgressRollup;
  index: number;
}

function CourseChapter({ rollup, index }: CourseChapterProps) {
  const pct = Math.round(rollup.masteryPercent * 100);

  return (
    <article className={styles.chapter}>
      <header className={styles.chapterHead}>
        <span className={styles.chapterNum}>{toRoman(index + 1)}.</span>
        <h2 className={styles.chapterTitle}>{rollup.courseTitle}</h2>
        <div className={styles.masteryRow}>
          <span className={styles.masteryLabel}>Mastery</span>
          <span className={styles.masteryPct}>{pct}%</span>
          <div className={styles.masteryBar}>
            <CoverageBar
              compact
              percent={rollup.masteryPercent}
              ariaLabel={`${rollup.courseTitle} mastery: ${pct}%`}
            />
          </div>
        </div>
      </header>
      <div className={styles.body3col}>
        <YouAreHere lesson={rollup.currentLesson} gate={rollup.activeGate} />
        <StuckOn concepts={rollup.stuckConcepts} />
        <Recently events={rollup.recentEvents} />
      </div>
    </article>
  );
}

// ── ProgressRoute ─────────────────────────────────────────────────────────────

export function ProgressRoute() {
  const client = usePraxisClient();
  const navigate = useNavigate();
  const loader = useCallback((_signal: AbortSignal) => client.progress.rollup(), [client]);
  const { data: rollups, loading, error } = useResource(loader);

  if (loading) return <LoadingState message="Loading progress…" />;
  if (error) return <ErrorMessage error={error} />;

  if (!rollups || rollups.length === 0) {
    return (
      <div className={styles.layout}>
        <RouteHeader
          ornament="‖"
          kicker="PROGRESS"
          title="progress"
          deck="Your mastery map — where you've been, where to go next."
        />
        <EmptyState
          message="Start a course to see progress."
          action={{
            label: "Start a course",
            onClick: () => {
              void navigate({ to: "/course-create" });
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament="‖"
        kicker="PROGRESS"
        title="progress"
        deck="Your mastery map — where you've been, where to go next."
      />
      <div className={styles.body}>
        {rollups.map((rollup, i) => (
          <CourseChapter key={rollup.courseId} rollup={rollup} index={i} />
        ))}
      </div>
    </div>
  );
}
