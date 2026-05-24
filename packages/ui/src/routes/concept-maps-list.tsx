/**
 * Phase 15b: /courses/$courseId/concept-maps — list of concept maps for a course.
 *
 * Shows a list of maps with version counts + "discussion points" badge,
 * an empty state with "+ new map" CTA, and navigates to the editor.
 */
import type { ConceptMapSummary, CourseId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { EmptyState } from "../components/empty-state.js";
import { LoadingState } from "../components/loading-state.js";
import { RouteHeader } from "../components/route-header.js";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import { COPY } from "../lib/copy.js";
import styles from "./concept-maps-list.module.css";

export function ConceptMapsListRoute() {
  const { courseId: rawCourseId } = useParams({ strict: false });
  const courseId = rawCourseId ? brandId<"CourseId">(rawCourseId) : undefined;
  const client = usePraxisClient();
  const navigate = useNavigate();

  const loader = useCallback(
    () =>
      courseId
        ? client.conceptMaps.list({ courseId: courseId as CourseId })
        : Promise.resolve([] as ConceptMapSummary[]),
    [client, courseId],
  );

  const { data: maps, loading, error, setData } = useResource(loader);

  const handleCreate = useCallback(async () => {
    if (!courseId) return;
    const newMap = await client.conceptMaps.create({
      courseId: courseId as CourseId,
      title: "untitled",
    });
    // Optimistically add to list before navigating
    setData((prev) => [
      {
        id: newMap.id,
        studentId: newMap.studentId,
        courseId: newMap.courseId,
        title: newMap.title,
        versionCount: 0,
        hasDivergences: false,
        createdAt: newMap.createdAt,
        updatedAt: newMap.updatedAt,
        linkedNodeCount: 0,
        totalNodeCount: 0,
      },
      ...(prev ?? []),
    ]);
    await navigate({
      to: "/courses/$courseId/concept-maps/$conceptMapId",
      params: { courseId: rawCourseId ?? "", conceptMapId: newMap.id },
    });
  }, [client, courseId, rawCourseId, navigate, setData]);

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament="§"
        kicker="CONCEPT MAPS"
        title="concept maps"
        deck="how concepts connect"
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

      {!loading && !error && maps?.length === 0 && (
        <EmptyState
          message={COPY.empty.conceptMaps}
          ornament="§"
          action={{ label: "+ new map", onClick: handleCreate }}
        />
      )}

      {!loading && !error && maps && maps.length > 0 && (
        <>
          <div className={styles.listActions}>
            <button type="button" className={styles.newMapBtn} onClick={handleCreate}>
              + new map
            </button>
          </div>
          <ul className={styles.list}>
            {maps.map((map) => (
              <li key={map.id} className={styles.mapItem}>
                <button
                  type="button"
                  className={styles.mapLink}
                  onClick={() =>
                    navigate({
                      to: "/courses/$courseId/concept-maps/$conceptMapId",
                      params: { courseId: rawCourseId ?? "", conceptMapId: map.id },
                    })
                  }
                >
                  <span className={styles.mapTitle}>{map.title}</span>
                  <span className={styles.mapMeta}>
                    <span className={styles.versionCount}>
                      {map.versionCount} version{map.versionCount !== 1 ? "s" : ""}
                    </span>
                    {map.hasDivergences && (
                      <span className={styles.divergenceBadge}>discussion points</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
