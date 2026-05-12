/**
 * Flat-list concepts route at /courses/$courseId/concepts.
 *
 * Renders every concept in the course grouped by the lesson they belong to.
 * Each lesson title becomes a sticky <h3> section header. Concepts without
 * a parent lesson are placed in an "Ungrouped" section at the end.
 *
 * Features:
 *   - Scrollable container with constrained max-height.
 *   - Sticky <h3> section headers (position: sticky; top: 0) per lesson group.
 *   - Case-insensitive substring filter against concept name + description.
 *   - Filter clears via Escape key or a "×" clear button.
 *
 * Concept-map (graph view) at /courses/$courseId/map is OUT of scope.
 */
import type { CourseId, Lesson } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { EmptyState } from "../components/empty-state.js";
import { LoadingState } from "../components/loading-state.js";
import { RouteHeader } from "../components/route-header.js";
import { usePraxisClient } from "../context/client-context.js";
import type { ConceptRow } from "../hooks/use-course-gates.js";
import { useResource } from "../hooks/use-resource.js";
import { COPY } from "../lib/copy.js";
import styles from "./course-concepts-list.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface ConceptGroup {
  /** Lesson title, or "Ungrouped" for concepts with no lesson. */
  label: string;
  concepts: ConceptRow[];
}

// ── Grouping helper ────────────────────────────────────────────────────────

/**
 * Group concepts by the lesson they belong to.
 * Preserves lesson order; concepts not in any lesson go to "Ungrouped" last.
 */
function groupConceptsByLesson(concepts: ConceptRow[], lessons: Lesson[]): ConceptGroup[] {
  const groups: ConceptGroup[] = [];
  const assignedIds = new Set<string>();

  for (const lesson of lessons) {
    const lessonConcepts = lesson.conceptIds
      .map((id) => concepts.find((c) => c.id === (id as string)))
      .filter((c): c is ConceptRow => c !== undefined);

    if (lessonConcepts.length === 0) continue;

    for (const c of lessonConcepts) assignedIds.add(c.id);
    groups.push({ label: lesson.title, concepts: lessonConcepts });
  }

  const ungrouped = concepts.filter((c) => !assignedIds.has(c.id));
  if (ungrouped.length > 0) {
    groups.push({ label: "Ungrouped", concepts: ungrouped });
  }

  return groups;
}

// ── Filter helper ─────────────────────────────────────────────────────────

function filterGroups(groups: ConceptGroup[], query: string): ConceptGroup[] {
  if (!query.trim()) return groups;
  const lower = query.toLowerCase();
  return groups
    .map((g) => ({
      ...g,
      concepts: g.concepts.filter(
        (c) => c.name.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower),
      ),
    }))
    .filter((g) => g.concepts.length > 0);
}

// ── Component ─────────────────────────────────────────────────────────────

export function CourseConceptsListRoute() {
  const { courseId: rawCourseId } = useParams({ strict: false });
  const courseId = rawCourseId ? brandId<"CourseId">(rawCourseId) : undefined;
  const client = usePraxisClient();
  const navigate = useNavigate();

  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ──────────────────────────────────────────────────────

  const loader = useCallback(async () => {
    if (!courseId) return { concepts: [] as ConceptRow[], lessons: [] as Lesson[] };
    const [concepts, lessons] = await Promise.all([
      client.artifacts.concepts(courseId as CourseId),
      client.artifacts.lessons(courseId as CourseId),
    ]);
    return { concepts, lessons };
  }, [client, courseId]);

  const { data, loading, error } = useResource(loader);

  const concepts = data?.concepts ?? [];
  const lessons = data?.lessons ?? [];

  // ── Grouping + filtering ────────────────────────────────────────────────

  const allGroups = useMemo(() => groupConceptsByLesson(concepts, lessons), [concepts, lessons]);

  const visibleGroups = useMemo(() => filterGroups(allGroups, filter), [allGroups, filter]);

  const totalConcepts = concepts.length;

  // ── Keyboard handler ───────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setFilter("");
      inputRef.current?.blur();
    }
  }, []);

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament="§"
        kicker="CONCEPTS"
        title="concepts"
        deck={
          totalConcepts > 0
            ? `${totalConcepts} concept${totalConcepts !== 1 ? "s" : ""} across ${lessons.length} lesson${lessons.length !== 1 ? "s" : ""}`
            : "the concepts in this course"
        }
        actions={
          <button
            type="button"
            className={styles.backBtn}
            onClick={() =>
              navigate({
                to: "/courses/$courseId",
                params: { courseId: rawCourseId ?? "" },
              })
            }
          >
            ← Course
          </button>
        }
      />

      {loading && <LoadingState message={COPY.loading.default} />}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && concepts.length === 0 && (
        <EmptyState message={COPY.empty.concepts} ornament="§" />
      )}

      {!loading && !error && concepts.length > 0 && (
        <>
          {/* Filter input */}
          <div className={styles.filterRow}>
            <div className={styles.filterInputWrap}>
              <input
                ref={inputRef}
                type="search"
                className={styles.filterInput}
                placeholder="filter concepts…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Filter concepts"
              />
              {filter.length > 0 && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => {
                    setFilter("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear filter"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Scrollable grouped list */}
          <div className={styles.scrollContainer}>
            {visibleGroups.length === 0 ? (
              <p className={styles.noResults}>No concepts match "{filter}".</p>
            ) : (
              visibleGroups.map((group) => (
                <section key={group.label} className={styles.group}>
                  <h3 className={styles.groupHeader}>{group.label}</h3>
                  <ul className={styles.conceptList}>
                    {group.concepts.map((concept) => (
                      <li key={concept.id} className={styles.conceptItem}>
                        <div className={styles.conceptName}>{concept.name}</div>
                        {concept.description && (
                          <p className={styles.conceptDescription}>{concept.description}</p>
                        )}
                        {concept.aliases.length > 0 && (
                          <p className={styles.conceptAliases}>
                            also: {concept.aliases.join(", ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
