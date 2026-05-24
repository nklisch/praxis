import { lessonAssessments as lessonAssessmentsTable } from "@praxis/artifacts/schema";
import { eq } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  AssignmentId,
  LessonAssessment,
  LessonAssessmentId,
  LessonId,
  Logger,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface LessonAssessmentsServiceDeps {
  db: PraxisDb;
  log: Logger;
}

/**
 * LessonAssessmentsServiceImpl — read methods for the lesson_assessments table.
 * Extracted from ArtifactsServiceImpl as part of the artifacts-service domain
 * decomposition refactor.
 *
 * Covers authoring-time scheduling shells that attach assessments to lessons.
 * Future write methods (createLessonAssessment, deleteLessonAssessment) belong
 * here when they are added.
 */
export class LessonAssessmentsServiceImpl {
  constructor(private readonly deps: LessonAssessmentsServiceDeps) {}

  async lessonAssessments(lessonId: LessonId): Promise<LessonAssessment[]> {
    const rows = this.deps.db
      .select()
      .from(lessonAssessmentsTable)
      .where(eq(lessonAssessmentsTable.lessonId, lessonId))
      .all();
    return rows.map((r) => ({
      id: brandId<"LessonAssessmentId">(r.id) as LessonAssessmentId,
      lessonId: brandId<"LessonId">(r.lessonId) as LessonId,
      assignmentId: brandId<"AssignmentId">(r.assignmentId) as AssignmentId,
      timing: r.timing,
      purpose: r.purpose,
    }));
  }
}
