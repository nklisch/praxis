/**
 * ProgressServiceImpl — aggregates per-course progress data for the student
 * into a single-payload response.
 *
 * Pure aggregator: reads existing state (courses, lessons, mastery, sessions,
 * gateUnlockEvents, assignments); never persists anything.
 *
 * Mirrors RecommendationServiceImpl shape.
 */

import {
  assignments,
  courses as coursesTable,
  gateUnlockEvents,
  lessons as lessonsTable,
} from "@praxis/artifacts/schema";
import { concepts as conceptsTable } from "@praxis/curriculum/schema";
import { sessions, studentMastery } from "@praxis/memory/schema";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  ConceptId,
  CourseId,
  CourseStateReader,
  Logger,
  StudentId,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import type { CourseProgressRollup, ProgressService } from "../types/progress.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Mastery threshold below which a concept is considered "stuck". */
const STUCK_MASTERY_THRESHOLD = 0.7;
/** Max stuck concepts to surface per course. */
const MAX_STUCK_CONCEPTS = 3;
/** Max recent events to surface per course. */
const MAX_RECENT_EVENTS = 3;
/** Per-kind limit for recent-event queries (fetched then merged + trimmed). */
const RECENT_EVENTS_PER_KIND_LIMIT = 3;

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface ProgressServiceDeps {
  db: PraxisDb;
  log: Logger;
  courseStateReader: CourseStateReader;
}

// ── Implementation ────────────────────────────────────────────────────────────

export class ProgressServiceImpl implements ProgressService {
  constructor(private readonly deps: ProgressServiceDeps) {}

  async rollup(input: { studentId: StudentId }): Promise<CourseProgressRollup[]> {
    const { studentId } = input;

    // List all courses for this student.
    const courseRows = this.deps.db
      .select()
      .from(coursesTable)
      .where(eq(coursesTable.studentId, studentId))
      .all();

    if (courseRows.length === 0) return [];

    // Fan out to one rollup builder per course in parallel.
    const rollups = await Promise.all(
      courseRows.map((courseRow) =>
        this.buildRollup(studentId, brandId<"CourseId">(courseRow.id) as CourseId, courseRow.title),
      ),
    );

    return rollups;
  }

  // ── Per-course rollup ─────────────────────────────────────────────────────

  private async buildRollup(
    studentId: StudentId,
    courseId: CourseId,
    courseTitle: string,
  ): Promise<CourseProgressRollup> {
    // Gather all data in parallel.
    const [snapshot, stuckConcepts, recentEvents] = await Promise.all([
      this.deps.courseStateReader.read({ studentId, courseId }),
      Promise.resolve(this.collectStuckConcepts(studentId, courseId)),
      Promise.resolve(this.collectRecentEvents(studentId, courseId)),
    ]);

    // ── Mastery percent ───────────────────────────────────────────────────────

    let masteryPercent = 0;
    if (snapshot !== null) {
      // Collect all concept IDs from this course's lessons.
      const allConceptIds: ConceptId[] = [];
      for (const rows of snapshot.conceptsByLesson.values()) {
        for (const row of rows) {
          allConceptIds.push(row.conceptId);
        }
      }

      if (allConceptIds.length > 0) {
        // Read effectivePKnown for all concepts in the course in one query.
        const masteryRows = this.deps.db
          .select({
            conceptId: studentMastery.conceptId,
            effectivePKnown: studentMastery.effectivePKnown,
          })
          .from(studentMastery)
          .where(
            and(
              eq(studentMastery.studentId, studentId),
              inArray(studentMastery.conceptId, allConceptIds),
            ),
          )
          .all();

        const masteryMap = new Map<string, number>(
          masteryRows.map((r) => [r.conceptId, r.effectivePKnown / 1000]),
        );

        // Mean over all concepts (0 for concepts with no mastery row).
        const sum = allConceptIds.reduce((acc, cid) => acc + (masteryMap.get(cid) ?? 0), 0);
        masteryPercent = sum / allConceptIds.length;
      }
    }

    // ── Current lesson ────────────────────────────────────────────────────────

    let currentLesson: CourseProgressRollup["currentLesson"] = null;
    if (snapshot !== null && snapshot.currentLesson !== null) {
      const cl = snapshot.currentLesson;
      const index = snapshot.lessons.findIndex((l) => l.id === cl.id);
      currentLesson = {
        id: cl.id,
        title: cl.title,
        index: index >= 0 ? index + 1 : 1, // 1-based
        total: snapshot.lessons.length,
      };
    }

    // ── Active gate ───────────────────────────────────────────────────────────

    let activeGate: CourseProgressRollup["activeGate"] = null;
    if (snapshot !== null && snapshot.activeGate !== null) {
      const ag = snapshot.activeGate;
      activeGate = {
        id: ag.gate.id,
        title: ag.summaryText,
        lockReason: ag.lockReason,
        progress: ag.progress,
      };
    }

    return {
      courseId,
      courseTitle,
      masteryPercent,
      currentLesson,
      activeGate,
      stuckConcepts,
      recentEvents,
    };
  }

  // ── Stuck concepts ────────────────────────────────────────────────────────

  /**
   * Collect bottom-3 concepts for this course that are below the mastery threshold.
   * Only considers concepts attached to this course's lessons.
   * Mirrors collectPracticeConcepts logic in RecommendationServiceImpl.
   */
  private collectStuckConcepts(
    studentId: StudentId,
    courseId: CourseId,
  ): CourseProgressRollup["stuckConcepts"] {
    // Get all concept IDs referenced by this course's lessons.
    const lessonRows = this.deps.db
      .select({ conceptIdsJson: lessonsTable.conceptIdsJson })
      .from(lessonsTable)
      .where(eq(lessonsTable.courseId, courseId))
      .all();

    const allConceptIds: string[] = [];
    for (const row of lessonRows) {
      const ids = row.conceptIdsJson as string[];
      if (Array.isArray(ids)) {
        allConceptIds.push(...ids);
      }
    }

    if (allConceptIds.length === 0) return [];

    // Read mastery for all concepts in this course.
    const masteryRows = this.deps.db
      .select()
      .from(studentMastery)
      .where(
        and(
          eq(studentMastery.studentId, studentId),
          inArray(studentMastery.conceptId, allConceptIds),
        ),
      )
      .all();

    // Read concept names.
    const conceptRows = this.deps.db
      .select({ id: conceptsTable.id, name: conceptsTable.name })
      .from(conceptsTable)
      .where(inArray(conceptsTable.id, allConceptIds))
      .all();
    const conceptNameMap = new Map<string, string>(conceptRows.map((c) => [c.id, c.name]));

    // Filter to stuck concepts (below threshold) and sort ascending by mastery.
    const stuck: Array<{ conceptId: ConceptId; name: string; mastery: number }> = [];
    for (const row of masteryRows) {
      const mastery = row.effectivePKnown / 1000;
      if (mastery >= STUCK_MASTERY_THRESHOLD) continue;
      stuck.push({
        conceptId: brandId<"ConceptId">(row.conceptId) as ConceptId,
        name: conceptNameMap.get(row.conceptId) ?? row.conceptId,
        mastery,
      });
    }

    // Sort ascending (lowest mastery first = most stuck).
    stuck.sort((a, b) => a.mastery - b.mastery);
    return stuck.slice(0, MAX_STUCK_CONCEPTS);
  }

  // ── Recent events ─────────────────────────────────────────────────────────

  /**
   * Collect top-3 recent events across sessions, gate unlocks, and submitted assignments.
   * Three separate queries + JS merge — simpler than UNION ALL in Drizzle.
   */
  private collectRecentEvents(
    studentId: StudentId,
    courseId: CourseId,
  ): CourseProgressRollup["recentEvents"] {
    type RawEvent = {
      kind: "session" | "gate" | "grade";
      at: Timestamp;
      label: string;
      detail: string;
    };
    const raw: RawEvent[] = [];

    // ── Sessions for this course ──────────────────────────────────────────────
    const sessionRows = this.deps.db
      .select({
        modeId: sessions.modeId,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
      })
      .from(sessions)
      .where(and(eq(sessions.studentId, studentId), eq(sessions.courseId, courseId)))
      .orderBy(desc(sessions.startedAt))
      .limit(RECENT_EVENTS_PER_KIND_LIMIT)
      .all();

    for (const row of sessionRows) {
      const ts = (row.endedAt ?? row.startedAt).getTime() as Timestamp;
      raw.push({
        kind: "session",
        at: ts,
        label: `${row.modeId} session`,
        detail: row.endedAt ? "completed" : "in progress",
      });
    }

    // ── Gate unlock events ────────────────────────────────────────────────────
    const gateRows = this.deps.db
      .select({
        gateId: gateUnlockEvents.gateId,
        unlockedAt: gateUnlockEvents.unlockedAt,
      })
      .from(gateUnlockEvents)
      .where(
        and(eq(gateUnlockEvents.studentId, studentId), eq(gateUnlockEvents.courseId, courseId)),
      )
      .orderBy(desc(gateUnlockEvents.unlockedAt))
      .limit(RECENT_EVENTS_PER_KIND_LIMIT)
      .all();

    for (const row of gateRows) {
      raw.push({
        kind: "gate",
        at: row.unlockedAt.getTime() as Timestamp,
        label: "gate unlocked",
        detail: `gate ${row.gateId}`,
      });
    }

    // ── Submitted assignments for this course ─────────────────────────────────
    const gradeRows = this.deps.db
      .select({
        title: assignments.title,
        kind: assignments.kind,
        submittedAt: assignments.submittedAt,
      })
      .from(assignments)
      .where(and(eq(assignments.courseId, courseId), isNotNull(assignments.submittedAt)))
      .orderBy(desc(assignments.submittedAt))
      .limit(RECENT_EVENTS_PER_KIND_LIMIT)
      .all();

    for (const row of gradeRows) {
      if (!row.submittedAt) continue;
      raw.push({
        kind: "grade",
        at: row.submittedAt.getTime() as Timestamp,
        label: `${row.kind} graded`,
        detail: row.title,
      });
    }

    // Sort all events newest-first; return top 3.
    raw.sort((a, b) => b.at - a.at);
    return raw.slice(0, MAX_RECENT_EVENTS);
  }
}

// Re-export for test helpers convenience (mirrors recommendation-service pattern).
export { STUCK_MASTERY_THRESHOLD };
