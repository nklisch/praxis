import type { ConceptId, LessonId, Timestamp } from "@praxis/core/types";
import { DEFAULT_ROUTER_CONFIG, type RouterConfig } from "./config.js";
import type { ConceptCandidate, RouterInput, RouterSuggestion } from "./types.js";

/**
 * Suggest the next concept(s) for the student to work on.
 *
 * Algorithm (Phase 10 v1):
 *   1. Build annotated candidate list from the course snapshot.
 *   2. Partition into current-lesson and earlier-lesson candidates.
 *   3. Pick PRIMARY (single concept for current lesson):
 *      - If current lesson has un-studied concepts: first un-studied (next-in-order).
 *      - Else pick highest-scoring studied-but-not-mastered concept (frontier).
 *      - If all concepts are mastered → primary = null (all-complete).
 *   4. Pick REVIEWS from earlier lessons: studied concepts whose mastery has
 *      decayed below `reviewThreshold`, sorted by lowest mastery first.
 *   5. Pick INTERLEAVES from earlier lessons: studied concepts with high mastery
 *      that haven't been practiced in `interleaveMinDays` days, sorted oldest-first.
 *      Reviews and interleaves are mutually exclusive.
 *
 * PURE FUNCTION — no DB access, no side effects, no Date.now().
 * Same inputs always produce the same output. Tests run in microseconds.
 */
export function suggestNext(
  input: RouterInput,
  config: RouterConfig = DEFAULT_ROUTER_CONFIG,
): RouterSuggestion {
  // No current lesson → course is complete or not started.
  if (input.snapshot.currentLesson === null) {
    return { primary: null, reviews: [], interleaves: [] };
  }

  const currentLessonId = input.snapshot.currentLesson.id;

  const allCandidates = buildCandidates(input);

  // Partition by lesson position.
  const lessonOrder = new Map<LessonId, number>(
    input.snapshot.lessons.map((l, idx) => [l.id, idx]),
  );
  const currentLessonIndex = lessonOrder.get(currentLessonId) ?? 0;

  const currentCandidates = allCandidates.filter((c) => c.lessonId === currentLessonId);
  const earlierCandidates = allCandidates.filter((c) => {
    const idx = lessonOrder.get(c.lessonId);
    return idx !== undefined && idx < currentLessonIndex;
  });

  const primary = pickPrimary(currentCandidates, config);
  const reviews = pickReviews(earlierCandidates, config);
  const interleaves = pickInterleaves(earlierCandidates, input, config, reviews);

  return { primary, reviews, interleaves };
}

// ─── Internal annotated candidate ────────────────────────────────────────────

interface AnnotatedCandidate {
  conceptId: ConceptId;
  name: string;
  description: string;
  lessonId: LessonId;
  masteryNow: number;
  uncertainty: number;
  studied: boolean;
  studiedAt: Timestamp | undefined;
}

function buildCandidates(input: RouterInput): AnnotatedCandidate[] {
  const out: AnnotatedCandidate[] = [];
  for (const lesson of input.snapshot.lessons) {
    const conceptRows = input.snapshot.conceptsByLesson.get(lesson.id) ?? [];
    for (const row of conceptRows) {
      out.push({
        conceptId: row.conceptId,
        name: row.name,
        description: row.description,
        lessonId: row.lessonId,
        masteryNow: input.masteryByConceptId.get(row.conceptId) ?? 0,
        uncertainty: input.uncertaintyByConceptId.get(row.conceptId) ?? 0.5,
        studied: row.studied,
        studiedAt: row.studiedAt ?? undefined,
      });
    }
  }
  return out;
}

// ─── Primary picker ───────────────────────────────────────────────────────────

function pickPrimary(
  currentCandidates: AnnotatedCandidate[],
  config: RouterConfig,
): ConceptCandidate | null {
  // Only consider concepts not yet fully mastered.
  const eligible = currentCandidates.filter((c) => c.masteryNow < config.masteredThreshold);
  if (eligible.length === 0) return null;

  // Prefer un-studied concepts (next-in-order). The course snapshot orders
  // concepts by their position within the lesson, so the first un-studied
  // concept is the pedagogically appropriate next step.
  const unstudied = eligible.filter((c) => !c.studied);
  if (unstudied.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: unstudied.length > 0 guarantees element exists
    const pick = unstudied[0]!;
    return toCandidate(pick, "next-in-order", 1.0);
  }

  // All current-lesson concepts are studied — pick the frontier:
  // highest combined score of uncertainty * frontierWeight + (1 - mastery) * (1 - frontierWeight).
  const scored = eligible.map((c) => {
    const score =
      c.uncertainty * config.frontierWeight + (1 - c.masteryNow) * (1 - config.frontierWeight);
    return { candidate: c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  // biome-ignore lint/style/noNonNullAssertion: eligible.length > 0 guarantees scored is non-empty
  const best = scored[0]!;
  return toCandidate(best.candidate, "frontier", best.score);
}

// ─── Reviews picker ───────────────────────────────────────────────────────────

function pickReviews(
  earlierCandidates: AnnotatedCandidate[],
  config: RouterConfig,
): ConceptCandidate[] {
  // A concept is due for review when it was studied but mastery has decayed below threshold.
  const dueForReview = earlierCandidates.filter(
    (c) => c.studied && c.masteryNow < config.reviewThreshold,
  );
  if (dueForReview.length === 0) return [];

  // Sort by lowest mastery first (most urgently needed review).
  const sorted = [...dueForReview].sort((a, b) => a.masteryNow - b.masteryNow);
  return sorted.slice(0, config.maxReviews).map((c) => toCandidate(c, "review", 1 - c.masteryNow));
}

// ─── Interleaves picker ───────────────────────────────────────────────────────

function pickInterleaves(
  earlierCandidates: AnnotatedCandidate[],
  input: RouterInput,
  config: RouterConfig,
  alreadyPickedAsReview: ConceptCandidate[],
): ConceptCandidate[] {
  const reviewIds = new Set(alreadyPickedAsReview.map((r) => r.conceptId));

  const eligible = earlierCandidates.filter((c) => {
    // Must not already be chosen as a review.
    if (reviewIds.has(c.conceptId)) return false;
    // Must be at high mastery — strong but at risk of fading.
    if (c.masteryNow < config.interleaveMinMastery) return false;
    // Must have been practiced at some point (not just studied via study_concept).
    const lastPracticed = input.lastPracticedByConceptId.get(c.conceptId);
    if (!lastPracticed) return false;
    // Must be old enough to warrant interleaving.
    const daysSince = (input.now - lastPracticed) / (1000 * 60 * 60 * 24);
    return daysSince >= config.interleaveMinDays;
  });

  if (eligible.length === 0) return [];

  // Sort by oldest-practiced first (most likely to fade).
  const sorted = [...eligible].sort((a, b) => {
    const aLast = input.lastPracticedByConceptId.get(a.conceptId)!;
    const bLast = input.lastPracticedByConceptId.get(b.conceptId)!;
    return aLast - bLast; // ascending: oldest first
  });

  return sorted.slice(0, config.maxInterleaves).map((c) => {
    const lastPracticed = input.lastPracticedByConceptId.get(c.conceptId)!;
    const daysSince = (input.now - lastPracticed) / (1000 * 60 * 60 * 24);
    return toCandidate(c, "interleave", daysSince);
  });
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function toCandidate(
  c: AnnotatedCandidate,
  reason: ConceptCandidate["reason"],
  score: number,
): ConceptCandidate {
  return {
    conceptId: c.conceptId,
    name: c.name,
    description: c.description,
    lessonId: c.lessonId,
    reason,
    score,
    masteryNow: c.masteryNow,
    uncertainty: c.uncertainty,
  };
}
