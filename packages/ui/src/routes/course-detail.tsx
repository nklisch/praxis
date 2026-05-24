import type { ConceptMapSummary, CourseId, DocumentScopeAttachment } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AddDocumentButton } from "../components/add-document-button.js";
import { CoverageBar } from "../components/coverage-bar.js";
import { EmptyState } from "../components/empty-state.js";
import { LibraryDocumentPicker } from "../components/library-document-picker.js";
import { RouteHeader } from "../components/route-header.js";
import { getRouteMeta } from "../components/route-meta.js";
import { usePraxisClient } from "../context/client-context.js";
import { useCourseDetail } from "../hooks/use-course-detail.js";
import { useIngestion } from "../hooks/use-ingestion.js";
import { useResource } from "../hooks/use-resource.js";
import { useTabs } from "../hooks/use-tabs.js";
import { COPY } from "../lib/copy.js";
import { openSessionInTab } from "../lib/open-session-in-tab.js";
import styles from "./course-detail.module.css";

export function CourseDetailRoute() {
  // useParams with strict: false gives us the courseId from /courses/$courseId.
  const { courseId: rawCourseId } = useParams({ strict: false });
  const courseId = rawCourseId ? brandId<"CourseId">(rawCourseId) : undefined;

  const client = usePraxisClient();
  const { course, lessons, loading, error } = useCourseDetail(courseId as CourseId | undefined);
  const navigate = useNavigate();
  const { openTab } = useTabs();

  // Phase 16: course-scoped ingestion — auto-attaches when courseId is set.
  const ingestion = useIngestion(
    () => {
      void courseDocsRefresh();
    },
    courseId ? { scope: { kind: "course" as const, id: courseId as CourseId } } : undefined,
  );

  // Phase 16: track whether the library picker is open.
  const [pickerOpen, setPickerOpen] = useState(false);

  // Phase 16: load attached documents for this course.
  const courseDocsLoader = useCallback(
    () =>
      courseId
        ? client.documentScopes.listForScope({ kind: "course", id: courseId as CourseId })
        : Promise.resolve([] as DocumentScopeAttachment[]),
    [client, courseId],
  );
  const {
    data: attachedDocs,
    loading: courseDocsLoading,
    refresh: courseDocsRefresh,
  } = useResource(courseDocsLoader);

  // Phase 15b: load concept maps for this course in parallel with course detail.
  const mapsLoader = useCallback(
    () =>
      courseId
        ? client.conceptMaps.list({ courseId: courseId as CourseId })
        : Promise.resolve([] as ConceptMapSummary[]),
    [client, courseId],
  );
  const {
    data: conceptMaps,
    loading: mapsLoading,
    setData: setConceptMaps,
  } = useResource(mapsLoader);

  // Phase 9: Mark gates as viewed when the student enters the course detail page.
  // This clears the "newly unlocked" badge in the courses list.
  // Fires once per courseId visit; wrapped in try/catch so it never breaks the page.
  useEffect(() => {
    if (!courseId) return;
    client.artifacts.markGatesViewed(courseId).catch(() => {
      // Non-fatal — badge will clear on next successful visit.
    });
  }, [courseId, client]);

  const handleNewMap = useCallback(async () => {
    if (!courseId) return;
    const newMap = await client.conceptMaps.create({
      courseId: courseId as CourseId,
      title: "untitled",
    });
    // Optimistically prepend to the list before navigating.
    setConceptMaps((prev) => [
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
  }, [client, courseId, rawCourseId, navigate, setConceptMaps]);

  const handleStartSession = async () => {
    if (!courseId || !course) return;
    await openSessionInTab({
      client,
      navigate,
      openTab,
      startOpts: { modeId: "teach", courseId },
      courseTitle: course.title,
    });
  };

  const meta = getRouteMeta("courseDetail");

  if (loading) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>{COPY.loading.courses}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.layout}>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className={styles.layout}>
        <p className={styles.status}>Course not found.</p>
      </div>
    );
  }

  const lessonCount = lessons.length;

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament={meta.ornament}
        kicker={meta.kicker}
        title={course.title}
        deck={`${course.subject} · ${lessonCount} lesson${lessonCount !== 1 ? "s" : ""}`}
        actions={
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => navigate({ to: "/library" })}
          >
            ← Library
          </button>
        }
      />

      {/* Actions section — structured for Phase 11 additions (configure mode). */}
      <section className={styles.actions}>
        <button type="button" className={styles.startBtn} onClick={handleStartSession}>
          Start session
        </button>
        <button
          type="button"
          className={styles.mapBtn}
          onClick={() =>
            navigate({ to: "/courses/$courseId/map", params: { courseId: course.id } })
          }
        >
          View progress map
        </button>
        <AddDocumentButton ingestion={ingestion} />
        <button type="button" className={styles.mapBtn} onClick={() => setPickerOpen(true)}>
          Reuse from library
        </button>
      </section>

      {/* Phase 16: Library picker modal */}
      {pickerOpen && courseId && (
        <LibraryDocumentPicker
          scope={{ kind: "course", id: courseId as CourseId }}
          onClose={() => setPickerOpen(false)}
          onAttached={() => void courseDocsRefresh()}
        />
      )}

      {/* Phase 16: Attached documents section */}
      <section className={styles.documentsSection}>
        <h2 className={styles.sectionTitle}>Documents</h2>
        {courseDocsLoading && <p className={styles.status}>{COPY.loading.documents}</p>}
        {!courseDocsLoading && (!attachedDocs || attachedDocs.length === 0) && (
          <EmptyState message={COPY.empty.attachedDocsEmpty} compact />
        )}
        {!courseDocsLoading && attachedDocs && attachedDocs.length > 0 && (
          <ul className={styles.documentList}>
            {attachedDocs.map((doc) => (
              <li key={doc.documentId} className={styles.documentItem}>
                <span className={styles.documentName}>{doc.filename}</span>
                <span className={styles.documentMeta}>
                  {doc.chunkCount} chunk{doc.chunkCount !== 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.lessonsSection}>
        <h2 className={styles.sectionTitle}>Lessons</h2>
        {lessons.length === 0 ? (
          <p className={styles.emptyLessons}>No lessons found for this course.</p>
        ) : (
          <ol className={styles.lessonList}>
            {lessons.map((lesson, i) => (
              <li key={lesson.id} className={styles.lessonItem}>
                <span className={styles.lessonIndex}>Lesson {i + 1}</span>
                <div className={styles.lessonBody}>
                  <span className={styles.lessonTitle}>{lesson.title}</span>
                  <span className={styles.lessonMeta}>
                    {lesson.conceptIds.length} concept
                    {lesson.conceptIds.length !== 1 ? "s" : ""} · ~{lesson.estimatedMinutes} min
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Phase 15b: Concept maps section */}
      <section className={styles.conceptMapsSection}>
        <h2 className={styles.sectionTitle}>§ Concept maps</h2>
        {mapsLoading && <p className={styles.status}>{COPY.loading.default}</p>}
        {!mapsLoading && conceptMaps && conceptMaps.length === 0 && (
          <EmptyState
            message={COPY.empty.conceptMaps}
            action={{ label: "+ new map", onClick: () => void handleNewMap() }}
            compact
          />
        )}
        {!mapsLoading && conceptMaps && conceptMaps.length > 0 && (
          <>
            <ul className={styles.conceptMapList}>
              {conceptMaps.map((m) => (
                <li key={m.id} className={styles.conceptMapItem}>
                  <button
                    type="button"
                    className={styles.conceptMapLink}
                    onClick={() =>
                      navigate({
                        to: "/courses/$courseId/concept-maps/$conceptMapId",
                        params: { courseId: rawCourseId ?? "", conceptMapId: m.id },
                      })
                    }
                  >
                    <div className={styles.conceptMapTopRow}>
                      <span className={styles.conceptMapTitle}>{m.title}</span>
                      <span className={styles.conceptMapMeta}>
                        <span className={styles.conceptMapVersions}>
                          {m.versionCount} version{m.versionCount !== 1 ? "s" : ""}
                        </span>
                        {m.hasDivergences && (
                          <span className={styles.divergenceBadge}>discussion points</span>
                        )}
                      </span>
                    </div>
                    <div className={styles.mapCoverageRow}>
                      <CoverageBar
                        compact
                        percent={m.linkedNodeCount / Math.max(m.totalNodeCount, 1)}
                      />
                      <span className={styles.mapCoverageLabel}>
                        <span className={styles.mapCoverageNum}>
                          {m.linkedNodeCount} / {m.totalNodeCount}
                        </span>
                        {" · "}
                        {Math.round((100 * m.linkedNodeCount) / Math.max(m.totalNodeCount, 1))}%
                        mapped
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.newMapBtn} onClick={() => void handleNewMap()}>
              + new map
            </button>
          </>
        )}
      </section>
    </div>
  );
}
