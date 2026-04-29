import type {
  ArtifactsService,
  ConceptId,
  ConceptMapDrawing,
  Course,
  CourseId,
  Flashcard,
  Gate,
  Note,
  ProgressSnapshot,
} from "@praxis/core/types";
/**
 * ArtifactsClient — Phase 3 stub.
 * Full implementation deferred to Phase 6 (course/artifact loading).
 */
export class ArtifactsClient implements ArtifactsService {
  course(_id: CourseId): Promise<Course> {
    return Promise.reject(new Error("ArtifactsClient not implemented in Phase 3"));
  }

  courses(): Promise<Course[]> {
    return Promise.reject(new Error("ArtifactsClient not implemented in Phase 3"));
  }

  gates(_courseId: CourseId): Promise<Gate[]> {
    return Promise.reject(new Error("ArtifactsClient not implemented in Phase 3"));
  }

  progress(): Promise<ProgressSnapshot> {
    return Promise.reject(new Error("ArtifactsClient not implemented in Phase 3"));
  }

  flashcards(_opts?: { conceptId?: ConceptId; due?: boolean }): Promise<Flashcard[]> {
    return Promise.reject(new Error("ArtifactsClient not implemented in Phase 3"));
  }

  notes(_opts?: { courseId?: CourseId }): Promise<Note[]> {
    return Promise.reject(new Error("ArtifactsClient not implemented in Phase 3"));
  }

  conceptMaps(_courseId?: CourseId): Promise<ConceptMapDrawing[]> {
    return Promise.reject(new Error("ArtifactsClient not implemented in Phase 3"));
  }
}
