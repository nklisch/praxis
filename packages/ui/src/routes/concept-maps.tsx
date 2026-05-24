/**
 * /concept-maps top-nav surface — Option 2: Swiss Grid Catalog.
 *
 * Flat sortable 2-col card grid with per-card coverage micro-bar,
 * filter pills by course (left) + sort tabs (right).
 *
 * URL contract: ?course=<courseId>&sort=recent|coverage|course
 * Bookmarkable: each pill/tab click updates the search params without
 * pushing a full navigation.
 */
import type { ConceptMapId, ConceptMapSummary, CourseId, CourseSummary } from "@praxis/core/types";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { CoverageBar } from "../components/coverage-bar.js";
import { EmptyState } from "../components/empty-state.js";
import { ErrorMessage } from "../components/error-message.js";
import { LoadingState } from "../components/loading-state.js";
import { RouteHeader } from "../components/route-header.js";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import styles from "./concept-maps.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortMode = "recent" | "coverage" | "course";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a Timestamp (ms epoch) as a short relative string. */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < 2 * hr) return `${Math.max(1, Math.round(diff / hr))}h ago`;
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.round(diff / day)} days ago`;
  if (diff < 14 * day) return "1 week ago";
  return `${Math.round(diff / (7 * day))} weeks ago`;
}

/** Build a short course label from a CourseSummary. */
function courseLabel(course: CourseSummary | undefined, fallbackId: string): string {
  if (!course) return fallbackId;
  return course.title;
}

// ── Route component ───────────────────────────────────────────────────────────

export function ConceptMapsRoute() {
  // TanStack Router — strict: false because validateSearch is declared on
  // conceptMapsSurfaceRoute in router.tsx; this component just reads the params.
  const { course, sort } = (
    useSearch as unknown as (opts: { strict: false }) => {
      course?: string;
      sort?: SortMode;
    }
  )({ strict: false });

  const navigate = useNavigate();
  const client = usePraxisClient();

  // ── Data loading ─────────────────────────────────────────────────────────

  const mapsLoader = useCallback(
    (_signal: AbortSignal) =>
      client.conceptMaps.list({
        ...(course !== undefined && { courseId: course as CourseId }),
        sort: sort ?? "recent",
      }),
    [client, course, sort],
  );

  const { data: maps, loading, error } = useResource(mapsLoader);

  // Courses list is stable — no filter/sort dep.
  const coursesLoader = useCallback((_signal: AbortSignal) => client.artifacts.courses(), [client]);
  const { data: courses } = useResource(coursesLoader);

  // ── Derived ───────────────────────────────────────────────────────────────

  const courseMap = new Map<string, CourseSummary>((courses ?? []).map((c) => [c.courseId, c]));

  const activeSort: SortMode = sort ?? "recent";
  const hasCourses = (courses ?? []).length > 0;
  const hasMaps = (maps ?? []).length > 0;

  // ── Filter / sort handlers ────────────────────────────────────────────────

  const onPickCourse = useCallback(
    (id: string | undefined) => {
      // biome-ignore lint/suspicious/noExplicitAny: TanStack Router search params — safe cast
      void (navigate as any)({ to: "/concept-maps", search: { course: id, sort: activeSort } });
    },
    [navigate, activeSort],
  );

  const onPickSort = useCallback(
    (s: SortMode) => {
      // biome-ignore lint/suspicious/noExplicitAny: TanStack Router search params — safe cast
      void (navigate as any)({ to: "/concept-maps", search: { course, sort: s } });
    },
    [navigate, course],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament="‡"
        kicker="CONCEPT MAPS"
        title="concept maps"
        deck="Visual representations of your knowledge."
      />

      {/* Control bar — filter pills + sort tabs */}
      {hasCourses && (
        <div className={styles.controlBar}>
          <div className={styles.filterRow}>
            <button
              type="button"
              className={`${styles.filterPill}${course === undefined ? ` ${styles.filterPillActive}` : ""}`}
              onClick={() => onPickCourse(undefined)}
            >
              All courses
            </button>
            {(courses ?? []).map((c) => (
              <button
                key={c.courseId}
                type="button"
                className={`${styles.filterPill}${course === c.courseId ? ` ${styles.filterPillActive}` : ""}`}
                onClick={() => onPickCourse(c.courseId)}
              >
                {c.title}
              </button>
            ))}
          </div>

          <div className={styles.sortRow}>
            <span className={styles.sortLabel}>Sort</span>
            {(["recent", "coverage", "course"] as SortMode[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.sortTab}${activeSort === s ? ` ${styles.sortTabActive}` : ""}`}
                onClick={() => onPickSort(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingState message="loading concept maps…" />}

      {/* Error */}
      {!loading && error && <ErrorMessage error={error} />}

      {/* Empty state — no courses at all */}
      {!loading && !error && !hasCourses && (
        <div className={styles.emptyWrapper}>
          <EmptyState
            message="Start a course to build concept maps."
            ornament="‡"
            action={{
              label: "Create a course",
              onClick: () => {
                void navigate({ to: "/course-create" });
              },
            }}
          />
        </div>
      )}

      {/* Empty state — has courses, but no maps in the current filter */}
      {!loading && !error && hasCourses && !hasMaps && (
        <div className={styles.emptyWrapper}>
          <EmptyState message="Open a course to build your first concept map." ornament="‡" />
          <div className={styles.courseLinks}>
            {(courses ?? []).map((c) => (
              <button
                key={c.courseId}
                type="button"
                className={styles.courseLink}
                onClick={() => {
                  void navigate({
                    to: "/courses/$courseId/concept-maps",
                    params: { courseId: c.courseId },
                  });
                }}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Card grid */}
      {!loading && !error && hasMaps && (
        <ul className={styles.grid}>
          {(maps ?? []).map((map) => (
            <ConceptMapCard
              key={map.id}
              map={map}
              courseName={courseLabel(courseMap.get(map.courseId), map.courseId)}
              onNavigate={(courseId, mapId) => {
                void navigate({
                  to: "/courses/$courseId/concept-maps/$conceptMapId",
                  params: { courseId, conceptMapId: mapId },
                });
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── ConceptMapCard ─────────────────────────────────────────────────────────────

interface ConceptMapCardProps {
  map: ConceptMapSummary;
  courseName: string;
  onNavigate: (courseId: string, mapId: ConceptMapId) => void;
}

function ConceptMapCard({ map, courseName, onNavigate }: ConceptMapCardProps) {
  const total = Math.max(map.totalNodeCount, 1);
  const pct = Math.round((map.linkedNodeCount / total) * 100);

  return (
    <li>
      <button
        type="button"
        className={styles.card}
        onClick={() => onNavigate(map.courseId, map.id)}
        aria-label={`${map.title} — ${map.versionCount} version${map.versionCount !== 1 ? "s" : ""}, ${pct}% mapped`}
      >
        <div className={styles.cardHead}>
          <span className={styles.cardCourse}>{courseName}</span>
          <span className={styles.cardWhen}>{relativeTime(map.updatedAt)}</span>
        </div>

        <h3 className={styles.cardTitle}>{map.title}</h3>

        <div className={styles.cardMeta}>
          <span>
            {map.versionCount} version{map.versionCount !== 1 ? "s" : ""}
          </span>
          {map.hasDivergences && <span className={styles.badge}>discussion points</span>}
        </div>

        <div className={styles.coverageRow}>
          <CoverageBar compact percent={map.linkedNodeCount / total} />
          <span className={styles.coverageLabel}>
            <span className={styles.coverageLabelNum}>
              {map.linkedNodeCount} / {map.totalNodeCount}
            </span>
            {" · "}
            {pct}% mapped
          </span>
        </div>
      </button>
    </li>
  );
}
