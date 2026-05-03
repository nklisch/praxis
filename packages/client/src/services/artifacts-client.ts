import type {
  ArtifactsClientSurface,
  ConceptId,
  Course,
  CourseId,
  CourseSummary,
  Flashcard,
  Gate,
  GateId,
  GateView,
  Lesson,
  Note,
  ProgressSnapshot,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

/** Shape returned by praxis.artifacts.concepts. */
interface ConceptRow {
  id: string;
  graphId: string;
  name: string;
  description: string;
  aliases: string[];
  standardsTags: string[];
}

/** Canonical channel names for the artifacts IPC surface. */
const C = {
  courses: "praxis.artifacts.courses",
  course: "praxis.artifacts.course",
  lessons: "praxis.artifacts.lessons",
  gates: "praxis.artifacts.gates",
  progress: "praxis.artifacts.progress",
} as const;

/**
 * ArtifactsClient — Phase 6 real implementation.
 * Replaces the Phase 3 stub. Backed by praxis.artifacts.* IPC channels.
 *
 * Implements the client-side ArtifactsService from @praxis/core/types/client.
 * Write methods are server-side only (called by tools); this client is read-only.
 * Unimplemented stubs (flashcards, notes, conceptMaps) return empty arrays;
 * Phase 12 will wire those channels.
 */
export class ArtifactsClient implements ArtifactsClientSurface {
  constructor(private readonly transport: ClientTransport) {}

  async course(id: CourseId): Promise<Course | null> {
    return this.transport.invoke<Course | null>(C.course, id);
  }

  courses(): Promise<CourseSummary[]> {
    // Server resolves student from getDefaultStudentId (single-student v1).
    return this.transport.invoke<CourseSummary[]>(C.courses);
  }

  lessons(courseId: CourseId): Promise<Lesson[]> {
    return this.transport.invoke<Lesson[]>(C.lessons, courseId);
  }

  gates(courseId: CourseId): Promise<Gate[]> {
    return this.transport.invoke<Gate[]>(C.gates, courseId);
  }

  progress(): Promise<ProgressSnapshot> {
    // Server resolves student from getDefaultStudentId (single-student v1).
    return this.transport.invoke<ProgressSnapshot>(C.progress);
  }

  // Phase 12 territory — return empty stubs for now.
  flashcards(_opts?: { conceptId?: ConceptId; due?: boolean }): Promise<Flashcard[]> {
    return Promise.resolve([]);
  }

  notes(_opts?: { courseId?: CourseId }): Promise<Note[]> {
    return Promise.resolve([]);
  }

  // ── Phase 9: Gate view + evaluation ─────────────────────────────────────────

  gateView(courseId: CourseId): Promise<GateView[]> {
    return this.transport.invoke<GateView[]>("praxis.artifacts.gateView", courseId);
  }

  evaluateGates(courseId: CourseId): Promise<{ unlockedGateIds: GateId[] }> {
    return this.transport.invoke<{ unlockedGateIds: GateId[] }>(
      "praxis.artifacts.evaluateGates",
      courseId,
    );
  }

  markGatesViewed(courseId: CourseId): Promise<void> {
    return this.transport.invoke<void>("praxis.artifacts.markGatesViewed", courseId);
  }

  newlyUnlockedCount(courseId: CourseId): Promise<number> {
    return this.transport.invoke<number>("praxis.artifacts.newlyUnlockedCount", courseId);
  }

  // ── Phase 10: Concept list ────────────────────────────────────────────────

  /**
   * Return the full concept list for a course.
   * Concept ids are prefixed for canonical packs ("<graphId>:pack-id.concept-id")
   * and are plain UUIDs for extracted courses.
   */
  concepts(courseId: CourseId): Promise<ConceptRow[]> {
    return this.transport.invoke<ConceptRow[]>("praxis.artifacts.concepts", courseId);
  }
}
