import type { DraftCourseState, DraftEditOp, DraftSummary, ProposedCourse } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { validateProposed } from "./draft-validator.js";
import { normalizeConceptName } from "./helpers.js";

export interface EditResult {
  state: ProposedCourse;
  warnings: readonly string[];
}

/** Convenience constructor for a result with no warnings. */
function ok(state: ProposedCourse): EditResult {
  return { state, warnings: [] };
}

export function buildSummary(d: DraftCourseState): DraftSummary {
  const p = d.proposed;
  const units = p.proposedUnits ?? [];
  const lessonAssessments = p.proposedLessonAssessments ?? [];
  // Count summatives from all units + per-lesson assessments.
  const summativeCount = units.filter((u) => u.summative !== undefined).length;
  return {
    draftId: d.draftId,
    title: p.title,
    lessonCount: p.proposedLessons.length,
    conceptCount: p.proposedConcepts.length,
    edgeCount: p.proposedEdges.length,
    firstLessons: p.proposedLessons.slice(0, 5).map((l) => ({
      title: l.title,
      conceptCount: l.conceptNames.length,
    })),
    unitCount: units.length,
    assessmentCount: summativeCount + lessonAssessments.length,
  };
}

/**
 * Apply a single edit operation to a ProposedCourse (pure function).
 * Returns `{ state, warnings }` — warnings are informational signals for the
 * model (e.g. "concept already exists"); they do not abort the operation.
 * Throws only on hard structural violations (index out of bounds, missing
 * endpoint for add-edge, etc.).
 *
 * Exhaustive switch — TypeScript will error if a new DraftEditOp variant is
 * added without adding a branch here.
 */
export function applyEdit(p: ProposedCourse, op: DraftEditOp): EditResult {
  switch (op.kind) {
    case "rename-course":
      return ok({ ...p, title: op.title });

    case "rename-lesson": {
      const ls = [...p.proposedLessons];
      const target = ls[op.lessonIndex];
      if (!target) throw new Error(`Lesson index out of bounds: ${op.lessonIndex}`);
      ls[op.lessonIndex] = { ...target, title: op.title };
      return ok({ ...p, proposedLessons: ls });
    }

    case "reorder-lessons": {
      if (op.newOrder.length !== p.proposedLessons.length) {
        throw new Error(
          `reorder-lessons: newOrder length ${op.newOrder.length} !== lesson count ${p.proposedLessons.length}`,
        );
      }
      return ok({
        ...p,
        proposedLessons: op.newOrder.map((i) => {
          const l = p.proposedLessons[i];
          if (!l) throw new Error(`reorder-lessons: index ${i} out of bounds`);
          return l;
        }),
      });
    }

    case "remove-lesson": {
      const removed = p.proposedLessons[op.lessonIndex];
      if (!removed) throw new Error(`remove-lesson: lessonIndex ${op.lessonIndex} out of bounds`);
      const removedId = removed.draftLessonId;
      const removedTitle = removed.title;

      const ls = p.proposedLessons.filter((_, i) => i !== op.lessonIndex);

      // Cascade: remove the lesson id from every unit's draftLessonIds.
      let unitMembershipCount = 0;
      const units = (p.proposedUnits ?? []).map((u) => {
        const before = u.draftLessonIds.length;
        const filtered = u.draftLessonIds.filter((id) => id !== removedId);
        unitMembershipCount += before - filtered.length;
        return { ...u, draftLessonIds: filtered };
      });

      // Cascade: drop lesson assessments that belong to the removed lesson.
      const assessmentsBefore = p.proposedLessonAssessments ?? [];
      const assessmentsAfter = assessmentsBefore.filter((a) => a.draftLessonId !== removedId);
      const droppedAssessments = assessmentsBefore.length - assessmentsAfter.length;

      const warning =
        `removed lesson '${removedTitle}' (id ${removedId}); also dropped: ` +
        `${unitMembershipCount} unit-membership ref${unitMembershipCount !== 1 ? "s" : ""}, ` +
        `${droppedAssessments} lesson assessment${droppedAssessments !== 1 ? "s" : ""}`;

      return {
        state: {
          ...p,
          proposedLessons: ls,
          proposedUnits: units,
          proposedLessonAssessments: assessmentsAfter,
        },
        warnings: [warning],
      };
    }

    case "add-lesson": {
      const newLesson = {
        draftLessonId: `lesson-${Date.now()}`,
        title: op.title,
        conceptNames: op.conceptNames,
        references: [],
        suggestedStrategy: brandId<"StrategyId">("worked-examples"),
        estimatedMinutes: 45,
      };
      const ls = [...p.proposedLessons];
      ls.splice(op.afterIndex + 1, 0, newLesson);
      return ok({ ...p, proposedLessons: ls });
    }

    case "rename-concept": {
      // Update the concept list and all lesson conceptNames references.
      const cs = p.proposedConcepts.map((c) =>
        c.name === op.conceptName ? { ...c, name: op.newName } : c,
      );
      const ls = p.proposedLessons.map((l) => ({
        ...l,
        conceptNames: l.conceptNames.map((n) => (n === op.conceptName ? op.newName : n)),
      }));
      const es = p.proposedEdges.map((e) => ({
        ...e,
        fromName: e.fromName === op.conceptName ? op.newName : e.fromName,
        toName: e.toName === op.conceptName ? op.newName : e.toName,
      }));
      return ok({ ...p, proposedConcepts: cs, proposedLessons: ls, proposedEdges: es });
    }

    case "remove-concept": {
      const cs = p.proposedConcepts.filter((c) => c.name !== op.conceptName);
      const ls = p.proposedLessons.map((l) => ({
        ...l,
        conceptNames: l.conceptNames.filter((n) => n !== op.conceptName),
      }));
      const es = p.proposedEdges.filter(
        (e) => e.fromName !== op.conceptName && e.toName !== op.conceptName,
      );
      return ok({ ...p, proposedConcepts: cs, proposedLessons: ls, proposedEdges: es });
    }

    case "add-concept": {
      const known = new Set(p.proposedConcepts.map((c) => c.name));
      if (known.has(op.name)) {
        return {
          state: p,
          warnings: [
            `concept '${op.name}' already exists in the draft; no new concept was added. ` +
              `Use relink-concept if you want to associate it with lesson ${op.lessonIndex}.`,
          ],
        };
      }
      const newConcept = { name: op.name, description: op.description, evidence: [] };
      const cs = [...p.proposedConcepts, newConcept];
      const ls = [...p.proposedLessons];
      const lessonTarget = ls[op.lessonIndex];
      if (!lessonTarget)
        throw new Error(`add-concept: lessonIndex ${op.lessonIndex} out of bounds`);
      const names = [...lessonTarget.conceptNames];
      const insertAt = op.afterConceptIndex !== undefined ? op.afterConceptIndex + 1 : names.length;
      names.splice(insertAt, 0, op.name);
      ls[op.lessonIndex] = { ...lessonTarget, conceptNames: names };
      return ok({ ...p, proposedConcepts: cs, proposedLessons: ls });
    }

    case "set-thresholds":
      return ok({ ...p, thresholds: op.thresholds });

    case "relink-concept": {
      const known = new Set(p.proposedConcepts.map((c) => c.name));
      if (!known.has(op.conceptName)) {
        return {
          state: p,
          warnings: [
            `relink-concept: concept '${op.conceptName}' not found in draft; no change made.`,
          ],
        };
      }

      // Step 1: Remove the concept name from every lesson.
      const stripped = p.proposedLessons.map((l) => ({
        ...l,
        conceptNames: l.conceptNames.filter((n) => n !== op.conceptName),
      }));

      if (op.lessonIndex === -1) {
        // Orphan: remove from all lessons, keep node + edges.
        return ok({ ...p, proposedLessons: stripped });
      }

      // Step 2: Insert into the destination lesson at afterConceptIndex+1 (or end).
      const dest = stripped[op.lessonIndex];
      if (!dest) throw new Error(`relink-concept: lessonIndex ${op.lessonIndex} out of bounds`);
      const names = [...dest.conceptNames];
      const insertAt = op.afterConceptIndex !== undefined ? op.afterConceptIndex + 1 : names.length;
      names.splice(insertAt, 0, op.conceptName);
      const ls = [...stripped];
      ls[op.lessonIndex] = { ...dest, conceptNames: names };
      return ok({ ...p, proposedLessons: ls });
    }

    case "add-edge": {
      const known = new Set(p.proposedConcepts.map((c) => normalizeConceptName(c.name)));
      const fromLower = normalizeConceptName(op.fromName);
      const toLower = normalizeConceptName(op.toName);
      if (!known.has(fromLower))
        throw new Error(`add-edge: concept "${op.fromName}" not found in draft`);
      if (!known.has(toLower))
        throw new Error(`add-edge: concept "${op.toName}" not found in draft`);
      if (fromLower === toLower) throw new Error("add-edge: self-edges are not allowed");
      const duplicate = p.proposedEdges.some(
        (e) =>
          normalizeConceptName(e.fromName) === fromLower &&
          normalizeConceptName(e.toName) === toLower,
      );
      if (duplicate)
        throw new Error(`add-edge: edge from "${op.fromName}" to "${op.toName}" already exists`);
      const newEdge = {
        fromName: op.fromName.trim(),
        toName: op.toName.trim(),
        strength: Math.max(0, Math.min(1, op.strength)),
        rationale: op.rationale?.trim() ?? "",
      };
      return ok({ ...p, proposedEdges: [...p.proposedEdges, newEdge] });
    }

    case "remove-unit": {
      const unit = (p.proposedUnits ?? []).find((u) => u.draftUnitId === op.draftUnitId);
      if (!unit) {
        return {
          state: p,
          warnings: [`remove-unit: unit with id '${op.draftUnitId}' not found; no change made.`],
        };
      }
      const lessonCount = unit.draftLessonIds.length;
      const units = (p.proposedUnits ?? []).filter((u) => u.draftUnitId !== op.draftUnitId);
      const warning =
        `removed unit '${unit.name}' (id ${op.draftUnitId}); ` +
        `it contained ${lessonCount} lesson reference${lessonCount !== 1 ? "s" : ""}`;
      return { state: { ...p, proposedUnits: units }, warnings: [warning] };
    }

    case "validate-draft": {
      const issues = validateProposed(p);
      if (issues.length === 0) return ok(p);
      const warnings = issues.map((issue) => `${issue.kind}: ${issue.message}`);
      return { state: p, warnings };
    }

    default: {
      // Exhaustiveness check: TypeScript will error here if a new op.kind is added
      // without a case above.
      const _exhaustive: never = op;
      throw new Error(`Unknown DraftEditOp kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
