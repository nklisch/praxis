import type { ProposedCourse } from "../../types/index.js";
import { normalizeConceptName } from "./helpers.js";

export interface Issue {
  kind: string;
  message: string;
}

export function validateProposed(p: ProposedCourse): Issue[] {
  const issues: Issue[] = [];
  if (!p.title?.trim()) {
    issues.push({ kind: "empty_title", message: "course title is empty" });
  }
  if (p.proposedConcepts.length === 0) {
    issues.push({ kind: "no_concepts", message: "draft has no concepts" });
  }
  if (p.proposedLessons.length === 0) {
    issues.push({ kind: "no_lessons", message: "draft has no lessons" });
  }
  const known = new Set(p.proposedConcepts.map((c) => c.name));
  for (const lesson of p.proposedLessons) {
    for (const cn of lesson.conceptNames) {
      if (!known.has(cn)) {
        issues.push({
          kind: "unknown_concept_in_lesson",
          message: `lesson "${lesson.title}" references unknown concept "${cn}"`,
        });
      }
    }
  }
  for (const e of p.proposedEdges) {
    if (!known.has(e.fromName) || !known.has(e.toName)) {
      issues.push({
        kind: "unknown_concept_in_edge",
        message: `edge ${e.fromName}→${e.toName} references unknown concept`,
      });
    }
  }

  // Phase 16: validate units.
  const knownLessons = new Set(p.proposedLessons.map((l) => l.draftLessonId));
  const knownLower = new Set(p.proposedConcepts.map((c) => normalizeConceptName(c.name)));
  for (const unit of p.proposedUnits ?? []) {
    for (const id of unit.draftLessonIds) {
      if (!knownLessons.has(id)) {
        issues.push({
          kind: "unit_unknown_lesson",
          message: `unit "${unit.name}" references unknown lesson id "${id}"`,
        });
      }
    }
    if (unit.summative) {
      for (const cn of unit.summative.conceptNames) {
        if (!knownLower.has(normalizeConceptName(cn))) {
          issues.push({
            kind: "assessment_unknown_concept",
            message: `unit "${unit.name}" summative references unknown concept "${cn}"`,
          });
        }
      }
    }
  }

  // Phase 16: validate per-lesson assessments.
  for (const la of p.proposedLessonAssessments ?? []) {
    if (!knownLessons.has(la.draftLessonId)) {
      issues.push({
        kind: "unit_lesson_not_in_draft",
        message: `lesson assessment "${la.title}" references unknown lesson id "${la.draftLessonId}"`,
      });
    }
    for (const cn of la.conceptNames) {
      if (!knownLower.has(normalizeConceptName(cn))) {
        issues.push({
          kind: "assessment_unknown_concept",
          message: `lesson assessment "${la.title}" references unknown concept "${cn}"`,
        });
      }
    }
  }

  return issues;
}
