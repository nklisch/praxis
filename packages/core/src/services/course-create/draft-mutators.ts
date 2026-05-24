/**
 * Pure mutation functions for DraftCourseState.
 *
 * Each function accepts the current draft plus typed input, validates, mutates,
 * and returns either an ok-shaped result (with the mutated draft) or an error
 * shape. Callers (CourseCreateServiceImpl) are responsible for bumping
 * `lastTouchedAt`, calling `saveAndEmitUpdate`, and shaping the final return
 * value — this module contains no DB access and no side effects.
 */
import { v7 as uuidv7 } from "uuid";
import type {
  AssessmentPlan,
  DraftCourseState,
  ProposedUnit,
  Reference,
  StrategyId,
  ThresholdConfig,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { normalizeConceptName } from "./helpers.js";

// Re-export so callers can import from one place if desired.
export { normalizeConceptName };

// ─── addConcept ───────────────────────────────────────────────────────────────

export interface AddConceptInput {
  name: string;
  description: string;
}

export type AddConceptResult =
  | { ok: true; draft: DraftCourseState; conceptCount: number }
  | { ok: false; reason: string };

/**
 * Validates uniqueness (case-insensitive) and pushes the new concept.
 * Returns ok:false if the concept name already exists.
 */
export function addConceptMutation(
  draft: DraftCourseState,
  input: AddConceptInput,
): AddConceptResult {
  const lower = normalizeConceptName(input.name);
  if (draft.proposed.proposedConcepts.some((c) => normalizeConceptName(c.name) === lower)) {
    return { ok: false, reason: `concept "${input.name}" already exists` };
  }
  draft.proposed.proposedConcepts.push({
    name: input.name.trim(),
    description: input.description.trim(),
    evidence: [],
  });
  return { ok: true, draft, conceptCount: draft.proposed.proposedConcepts.length };
}

// ─── removeConcept ────────────────────────────────────────────────────────────

export interface RemoveConceptInput {
  name: string;
}

export type RemoveConceptResult =
  | { ok: true; draft: DraftCourseState }
  | { ok: false; reason: string };

/**
 * Removes a concept and all edges + lesson references to it.
 * Returns ok:false if the concept is not found.
 */
export function removeConceptMutation(
  draft: DraftCourseState,
  input: RemoveConceptInput,
): RemoveConceptResult {
  const lower = normalizeConceptName(input.name);
  const before = draft.proposed.proposedConcepts.length;
  draft.proposed.proposedConcepts = draft.proposed.proposedConcepts.filter(
    (c) => normalizeConceptName(c.name) !== lower,
  );
  if (draft.proposed.proposedConcepts.length === before) {
    return { ok: false, reason: `concept "${input.name}" not found` };
  }
  // Remove edges referencing this concept.
  draft.proposed.proposedEdges = draft.proposed.proposedEdges.filter(
    (e) =>
      normalizeConceptName(e.fromName) !== lower && normalizeConceptName(e.toName) !== lower,
  );
  // Remove concept from lessons.
  draft.proposed.proposedLessons = draft.proposed.proposedLessons.map((l) => ({
    ...l,
    conceptNames: l.conceptNames.filter((n) => normalizeConceptName(n) !== lower),
  }));
  return { ok: true, draft };
}

// ─── addEdge ─────────────────────────────────────────────────────────────────

export interface AddEdgeInput {
  fromName: string;
  toName: string;
  strength: number;
  rationale: string;
}

export type AddEdgeResult =
  | { ok: true; draft: DraftCourseState }
  | { ok: false; reason: string };

/**
 * Validates both endpoints exist, rejects self-edges and duplicates, then
 * pushes the new prerequisite edge.
 */
export function addEdgeMutation(
  draft: DraftCourseState,
  input: AddEdgeInput,
): AddEdgeResult {
  const known = new Set(draft.proposed.proposedConcepts.map((c) => normalizeConceptName(c.name)));
  const fromLower = normalizeConceptName(input.fromName);
  const toLower = normalizeConceptName(input.toName);
  if (!known.has(fromLower)) return { ok: false, reason: `concept "${input.fromName}" not found` };
  if (!known.has(toLower)) return { ok: false, reason: `concept "${input.toName}" not found` };
  if (fromLower === toLower) return { ok: false, reason: "self-edges are not allowed" };
  const exists = draft.proposed.proposedEdges.some(
    (e) =>
      normalizeConceptName(e.fromName) === fromLower &&
      normalizeConceptName(e.toName) === toLower,
  );
  if (exists) return { ok: false, reason: "edge already exists" };
  draft.proposed.proposedEdges.push({
    fromName: input.fromName.trim(),
    toName: input.toName.trim(),
    strength: Math.max(0, Math.min(1, input.strength)),
    rationale: input.rationale.trim(),
  });
  return { ok: true, draft };
}

// ─── addLesson ───────────────────────────────────────────────────────────────

export interface AddLessonInput {
  title: string;
  conceptNames: string[];
  references: ReadonlyArray<Reference>;
  suggestedStrategy?: StrategyId;
  estimatedMinutes?: number;
}

export type AddLessonResult =
  | { ok: true; draft: DraftCourseState; lessonIndex: number }
  | { ok: false; reason: string };

/**
 * Validates all conceptNames reference existing concepts, then pushes the
 * new lesson with a generated draftLessonId.
 */
export function addLessonMutation(
  draft: DraftCourseState,
  input: AddLessonInput,
): AddLessonResult {
  const known = new Set(draft.proposed.proposedConcepts.map((c) => normalizeConceptName(c.name)));
  for (const cn of input.conceptNames) {
    if (!known.has(normalizeConceptName(cn))) {
      return { ok: false, reason: `concept "${cn}" not found — add it first` };
    }
  }
  const newLesson = {
    draftLessonId: `lesson-${uuidv7()}`,
    title: input.title.trim(),
    conceptNames: input.conceptNames.map((n) => n.trim()),
    references: input.references as Reference[],
    suggestedStrategy: input.suggestedStrategy ?? brandId<"StrategyId">("worked-examples"),
    estimatedMinutes: input.estimatedMinutes ?? 45,
  };
  draft.proposed.proposedLessons.push(newLesson);
  return { ok: true, draft, lessonIndex: draft.proposed.proposedLessons.length - 1 };
}

// ─── removeLesson ─────────────────────────────────────────────────────────────

export interface RemoveLessonInput {
  lessonIndex: number;
}

export type RemoveLessonResult =
  | { ok: true; draft: DraftCourseState }
  | { ok: false; reason: string };

/**
 * Bounds-checks the lessonIndex, then splices the lesson out.
 */
export function removeLessonMutation(
  draft: DraftCourseState,
  input: RemoveLessonInput,
): RemoveLessonResult {
  if (input.lessonIndex < 0 || input.lessonIndex >= draft.proposed.proposedLessons.length) {
    return { ok: false, reason: `lesson index ${input.lessonIndex} out of bounds` };
  }
  draft.proposed.proposedLessons.splice(input.lessonIndex, 1);
  return { ok: true, draft };
}

// ─── addUnit ─────────────────────────────────────────────────────────────────

export interface AddUnitInput {
  name: string;
  summary?: string;
  draftLessonIds: string[];
  summative?: {
    kind: "quiz" | "homework" | "exam";
    title: string;
    conceptNames: string[];
    expectedItemCount?: number;
    rationale: string;
  };
}

export type AddUnitResult =
  | { ok: true; draft: DraftCourseState; draftUnitId: string }
  | { ok: false; reason: string };

/**
 * Validates draftLessonIds reference existing lessons and (if summative) that
 * all summative conceptNames reference existing concepts, then pushes the new
 * unit with a generated draftUnitId (and draftAssessmentId for the summative).
 */
export function addUnitMutation(
  draft: DraftCourseState,
  input: AddUnitInput,
): AddUnitResult {
  const knownLessons = new Set(draft.proposed.proposedLessons.map((l) => l.draftLessonId));
  for (const id of input.draftLessonIds) {
    if (!knownLessons.has(id)) {
      return { ok: false, reason: `lesson "${id}" not found in draft — add it first` };
    }
  }
  if (input.summative) {
    const knownConcepts = new Set(
      draft.proposed.proposedConcepts.map((c) => normalizeConceptName(c.name)),
    );
    for (const cn of input.summative.conceptNames) {
      if (!knownConcepts.has(normalizeConceptName(cn))) {
        return {
          ok: false,
          reason: `summative references unknown concept "${cn}" — add it first`,
        };
      }
    }
  }
  const draftUnitId = uuidv7();
  const unit: ProposedUnit = {
    draftUnitId,
    name: input.name.trim(),
    ...(input.summary !== undefined && { summary: input.summary.trim() }),
    draftLessonIds: input.draftLessonIds,
    ...(input.summative !== undefined && {
      summative: {
        draftAssessmentId: uuidv7(),
        kind: input.summative.kind,
        title: input.summative.title.trim(),
        conceptNames: input.summative.conceptNames,
        ...(input.summative.expectedItemCount !== undefined && {
          expectedItemCount: input.summative.expectedItemCount,
        }),
        rationale: input.summative.rationale.trim(),
      },
    }),
  };
  if (!draft.proposed.proposedUnits) draft.proposed.proposedUnits = [];
  draft.proposed.proposedUnits.push(unit);
  return { ok: true, draft, draftUnitId };
}

// ─── setAssessmentPlan ────────────────────────────────────────────────────────

export interface SetAssessmentPlanInput {
  plan: AssessmentPlan;
}

export type SetAssessmentPlanResult =
  | { ok: true; draft: DraftCourseState }
  | { ok: false; reason: string };

/**
 * Replaces the draft's assessmentPlan with the supplied plan.
 */
export function setAssessmentPlanMutation(
  draft: DraftCourseState,
  input: SetAssessmentPlanInput,
): SetAssessmentPlanResult {
  draft.proposed.assessmentPlan = input.plan;
  return { ok: true, draft };
}

// ─── addLessonAssessment ──────────────────────────────────────────────────────

export interface AddLessonAssessmentInput {
  draftLessonId: string;
  kind: "quiz" | "homework" | "exam";
  timing: "before" | "after" | "interleaved";
  purpose: "readiness" | "practice" | "checkpoint";
  conceptNames: string[];
  expectedItemCount?: number;
  rationale: string;
  title: string;
}

export type AddLessonAssessmentResult =
  | { ok: true; draft: DraftCourseState; draftAssessmentId: string }
  | { ok: false; reason: string };

/**
 * Validates the draftLessonId and all conceptNames, then pushes a new
 * lesson-assessment entry with a generated draftAssessmentId.
 */
export function addLessonAssessmentMutation(
  draft: DraftCourseState,
  input: AddLessonAssessmentInput,
): AddLessonAssessmentResult {
  const knownLessons = new Set(draft.proposed.proposedLessons.map((l) => l.draftLessonId));
  if (!knownLessons.has(input.draftLessonId)) {
    return {
      ok: false,
      reason: `lesson "${input.draftLessonId}" not found in draft — add it first`,
    };
  }
  const knownConcepts = new Set(
    draft.proposed.proposedConcepts.map((c) => normalizeConceptName(c.name)),
  );
  for (const cn of input.conceptNames) {
    if (!knownConcepts.has(normalizeConceptName(cn))) {
      return { ok: false, reason: `concept "${cn}" not found in draft — add it first` };
    }
  }
  const draftAssessmentId = uuidv7();
  if (!draft.proposed.proposedLessonAssessments) draft.proposed.proposedLessonAssessments = [];
  draft.proposed.proposedLessonAssessments.push({
    draftAssessmentId,
    draftLessonId: input.draftLessonId,
    kind: input.kind,
    timing: input.timing,
    purpose: input.purpose,
    title: input.title.trim(),
    conceptNames: input.conceptNames,
    ...(input.expectedItemCount !== undefined && {
      expectedItemCount: input.expectedItemCount,
    }),
    rationale: input.rationale.trim(),
  });
  return { ok: true, draft, draftAssessmentId };
}

// ─── setMetadata ─────────────────────────────────────────────────────────────

export interface SetMetadataInput {
  title?: string;
  subject?: string;
  gradeLevel?: string;
  thresholds?: Partial<ThresholdConfig>;
}

export type SetMetadataResult =
  | { ok: true; draft: DraftCourseState }
  | { ok: false; reason: string };

/**
 * Patches draft title, subject, gradeLevel, and/or thresholds.
 * All fields are optional; a call with no fields is a no-op that still returns ok.
 */
export function setMetadataMutation(
  draft: DraftCourseState,
  input: SetMetadataInput,
): SetMetadataResult {
  if (input.title !== undefined) draft.proposed.title = input.title.trim();
  if (input.subject !== undefined) draft.proposed.subject = input.subject.trim();
  if (input.gradeLevel !== undefined) draft.proposed.gradeLevel = input.gradeLevel.trim();
  if (input.thresholds !== undefined) {
    draft.proposed.thresholds = { ...draft.proposed.thresholds, ...input.thresholds };
  }
  return { ok: true, draft };
}
