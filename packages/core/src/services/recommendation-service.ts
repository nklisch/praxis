/**
 * RecommendationServiceImpl — aggregates five signal collectors into a
 * priority-ordered "what's next" list for the Workbench front door.
 *
 * Pure aggregator: reads existing state (sessions, flashcards, memory,
 * drafts, lessons); never persists anything.
 */

import {
  assignments,
  courses as coursesTable,
  flashcards,
  lessonAssessments,
  lessons as lessonsTable,
} from "@praxis/artifacts/schema";
import { concepts as conceptsTable } from "@praxis/curriculum/schema";
import { sessions, studentMastery } from "@praxis/memory/schema";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  ConceptId,
  CourseId,
  DraftId,
  LessonId,
  Logger,
  ModeId,
  Recommendation,
  RecommendationService,
  StudentId,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import type { DraftStore } from "./draft-store.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 5;

/** 6 hours in ms */
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
/** 24 hours in ms */
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
/** 7 days in ms */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Default mastery gate threshold (mirrors the 0.7 value set in course creation). */
const DEFAULT_MASTERY_THRESHOLD = 0.7;

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface RecommendationServiceDeps {
  db: PraxisDb;
  log: Logger;
  draftStore: DraftStore;
}

// ── Humanize helper ────────────────────────────────────────────────────────────

/**
 * Returns a plain-English description of a duration (e.g. "an hour", "2 days").
 * Used in reason-string composition.
 */
export function humanize(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 2) return "a moment";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(ms / 3_600_000);
  if (hours === 1) return "an hour";
  if (hours < 24) return `${hours} hours`;
  const days = Math.round(ms / 86_400_000);
  if (days === 1) return "a day";
  return `${days} days`;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

export function scoreResumeSession(lastTouchedAt: Timestamp, now: number): number {
  const age = now - lastTouchedAt;
  let score = 80;
  if (age < SIX_HOURS_MS) {
    score += 10;
  } else if (age > SEVEN_DAYS_MS) {
    score -= 20;
  }
  return score;
}

export function scoreReviewCards(dueNow: number): number {
  const base = 75;
  const boost = Math.min(Math.floor(dueNow / 10) * 5, 20);
  return base + boost;
}

export function scorePracticeConcept(mastery: number, threshold: number): number {
  const base = 60;
  const boost = Math.min(Math.round((threshold - mastery) * 50), 30);
  return base + boost;
}

export function scoreResumeDraft(lastTouchedAt: Timestamp, now: number): number {
  const age = now - lastTouchedAt;
  return age < TWENTY_FOUR_HOURS_MS ? 65 : 55;
}

// ── Reason-string composers ──────────────────────────────────────────────────

export function reasonResumeSession(lastTouchedAt: Timestamp, now: number): string {
  const age = now - lastTouchedAt;
  if (age < SIX_HOURS_MS) {
    return "Continuing now keeps the chain — coming back tomorrow loses the thread.";
  }
  return `Paused ${humanize(age)}. Pick up where you left off.`;
}

export function reasonReviewCards(dueNow: number, dueIn24h: number): string {
  if (dueNow > 0) {
    return `${dueNow} card${dueNow === 1 ? "" : "s"} ready to review.`;
  }
  return `${dueIn24h} card${dueIn24h === 1 ? "" : "s"} coming due in the next 24 hours.`;
}

export function reasonPracticeConcept(
  conceptName: string,
  mastery: number,
  threshold: number,
): string {
  return `${conceptName} mastery ${Math.round(mastery * 100)}% (target ${Math.round(threshold * 100)}%) — gates next lesson.`;
}

export function reasonResumeDraft(lastTouchedAt: Timestamp, now: number): string {
  const age = now - lastTouchedAt;
  return `Course-create draft from ${humanize(age)} ago.`;
}

export function reasonQuickCheck(lessonTitle: string): string {
  return `Quick check on '${lessonTitle}' takes ~3 minutes.`;
}

// ── Tie-break helper ──────────────────────────────────────────────────────────

/**
 * Extract a recency timestamp from a recommendation for stable tie-breaking.
 * For kinds without a `lastTouchedAt`, returns `now` (treat as just-happened).
 */
export function recencyOf(rec: Recommendation, now: number): number {
  switch (rec.kind) {
    case "resume_session":
    case "resume_draft":
      return rec.lastTouchedAt;
    case "review_cards":
    case "practice_concept":
    case "quick_check":
      return now;
  }
}

// ── Implementation ────────────────────────────────────────────────────────────

export class RecommendationServiceImpl implements RecommendationService {
  constructor(private readonly deps: RecommendationServiceDeps) {}

  async next(input: { studentId: StudentId; limit?: number }): Promise<Recommendation[]> {
    const { studentId, limit = DEFAULT_LIMIT } = input;
    const now = Date.now();

    // Fan out to all collectors in parallel.
    const [resumeSessions, cards, concepts, drafts, quickChecks] = await Promise.all([
      this.collectResumeSessions(studentId, now),
      this.collectReviewCards(studentId, now),
      this.collectPracticeConcepts(studentId),
      this.collectResumeDrafts(studentId, now),
      this.collectQuickChecks(studentId),
    ]);

    const all: Recommendation[] = [
      ...resumeSessions,
      ...cards,
      ...concepts,
      ...drafts,
      ...quickChecks,
    ];

    // Sort descending by score; tie-break by recency (lastTouchedAt desc, or
    // implicit "now" for kinds without a timestamp).
    all.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: higher recency (more recent = larger timestamp) wins.
      return recencyOf(b, now) - recencyOf(a, now);
    });

    return all.slice(0, limit);
  }

  // ── Collectors ───────────────────────────────────────────────────────────────

  private collectResumeSessions(studentId: StudentId, now: number): Recommendation[] {
    // Query open (not ended) sessions for the student.
    // We use startedAt as the proxy for lastTouchedAt — there is no separate
    // "last active at" column on the sessions table. Using startedAt means
    // older open sessions get lower scores, which is the correct behavior.
    const rows = this.deps.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.studentId, studentId), isNull(sessions.endedAt)))
      .all();

    return rows.map((row): Recommendation => {
      const lastTouchedAt = row.startedAt.getTime() as Timestamp;
      return {
        kind: "resume_session",
        sessionId: brandId<"SessionId">(row.id),
        mode: row.modeId as ModeId,
        lastTouchedAt,
        reason: reasonResumeSession(lastTouchedAt, now),
        score: scoreResumeSession(lastTouchedAt, now),
      };
    });
  }

  private collectReviewCards(studentId: StudentId, now: number): Recommendation[] {
    const nowDate = new Date(now);
    const in24h = new Date(now + TWENTY_FOUR_HOURS_MS);

    // Count cards due now.
    const dueNowRows = this.deps.db
      .select({ id: flashcards.id })
      .from(flashcards)
      .where(and(eq(flashcards.studentId, studentId), lte(flashcards.nextReviewAt, nowDate)))
      .all();
    const dueNow = dueNowRows.length;

    // Count cards due within the next 24 hours (but not yet due).
    const dueIn24hRows = this.deps.db
      .select({ id: flashcards.id })
      .from(flashcards)
      .where(
        and(
          eq(flashcards.studentId, studentId),
          gt(flashcards.nextReviewAt, nowDate),
          lte(flashcards.nextReviewAt, in24h),
        ),
      )
      .all();
    const dueIn24h = dueIn24hRows.length;

    // Only surface a review_cards recommendation if there are cards to act on.
    if (dueNow === 0 && dueIn24h === 0) return [];

    return [
      {
        kind: "review_cards",
        courseId: null, // cross-course aggregate
        dueNow,
        dueIn24h,
        reason: reasonReviewCards(dueNow, dueIn24h),
        score: scoreReviewCards(dueNow),
      },
    ];
  }

  private collectPracticeConcepts(studentId: StudentId): Recommendation[] {
    // Read all mastery rows for this student.
    const masteryRows = this.deps.db
      .select()
      .from(studentMastery)
      .where(eq(studentMastery.studentId, studentId))
      .all();

    if (masteryRows.length === 0) return [];

    const recommendations: Recommendation[] = [];

    for (const row of masteryRows) {
      const mastery = row.pKnown / 1000;
      const threshold = DEFAULT_MASTERY_THRESHOLD;

      // Only surface concepts that are meaningfully below the threshold.
      if (mastery >= threshold) continue;

      const conceptId = brandId<"ConceptId">(row.conceptId);

      // Look up the concept name from the concepts table.
      const conceptRow = this.deps.db
        .select({ name: conceptsTable.name })
        .from(conceptsTable)
        .where(eq(conceptsTable.id, row.conceptId))
        .get();

      const conceptName = conceptRow?.name ?? row.conceptId;

      // Find a course that contains this concept.
      const courseId = this.resolveCourseForConcept(conceptId, studentId);
      if (courseId === null) continue;

      recommendations.push({
        kind: "practice_concept",
        conceptId,
        courseId,
        mastery,
        threshold,
        reason: reasonPracticeConcept(conceptName, mastery, threshold),
        score: scorePracticeConcept(mastery, threshold),
      });
    }

    // Cap at top 3 to avoid swamping the recommendation list with concepts.
    recommendations.sort((a, b) => b.score - a.score);
    return recommendations.slice(0, 3);
  }

  private collectResumeDrafts(studentId: StudentId, now: number): Recommendation[] {
    const draftList = this.deps.draftStore.listForStudent(studentId);
    return draftList.map((draft): Recommendation => {
      const lastTouchedAt = draft.lastTouchedAt;
      return {
        kind: "resume_draft",
        draftId: draft.draftId as DraftId,
        lastTouchedAt,
        reason: reasonResumeDraft(lastTouchedAt, now),
        score: scoreResumeDraft(lastTouchedAt, now),
      };
    });
  }

  private collectQuickChecks(studentId: StudentId): Recommendation[] {
    // Surface quick checks for unsubmitted quiz assignments that are attached
    // to lessons via the lessonAssessments join table.
    // Assignments link to courses (not directly to students), so we join
    // through courses to filter by student.
    const rows = this.deps.db
      .select({
        lessonId: lessonsTable.id,
        lessonTitle: lessonsTable.title,
      })
      .from(lessonAssessments)
      .innerJoin(lessonsTable, eq(lessonAssessments.lessonId, lessonsTable.id))
      .innerJoin(coursesTable, eq(lessonsTable.courseId, coursesTable.id))
      .innerJoin(assignments, eq(lessonAssessments.assignmentId, assignments.id))
      .where(
        and(
          eq(coursesTable.studentId, studentId),
          eq(assignments.kind, "quiz"),
          isNull(assignments.submittedAt),
        ),
      )
      .limit(3)
      .all();

    return rows.map(
      (row): Recommendation => ({
        kind: "quick_check",
        lessonId: row.lessonId as LessonId,
        reason: reasonQuickCheck(row.lessonTitle),
        score: 40,
      }),
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  /**
   * Find the first course (for this student) whose lessons reference the given concept.
   * Returns null when no course is found.
   */
  private resolveCourseForConcept(conceptId: ConceptId, studentId: StudentId): CourseId | null {
    // Fetch all lessons for this student's courses.
    const rows = this.deps.db
      .select({
        courseId: lessonsTable.courseId,
        conceptIdsJson: lessonsTable.conceptIdsJson,
      })
      .from(lessonsTable)
      .innerJoin(coursesTable, eq(coursesTable.id, lessonsTable.courseId))
      .where(eq(coursesTable.studentId, studentId))
      .all();

    for (const row of rows) {
      const ids = row.conceptIdsJson as string[];
      if (Array.isArray(ids) && ids.includes(conceptId)) {
        return brandId<"CourseId">(row.courseId);
      }
    }
    return null;
  }
}
