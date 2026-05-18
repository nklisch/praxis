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
  LessonAssessment,
  LessonId,
  Note,
  ProgressSnapshot,
  Unit,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
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
    const result = await this.transport.invoke<IpcEnvelope<Course | null> | Course | null>(
      C.course,
      id,
    );
    return unwrapEnvelope(result);
  }

  async courses(): Promise<CourseSummary[]> {
    // Server resolves student from getDefaultStudentId (single-student v1).
    const result = await this.transport.invoke<IpcEnvelope<CourseSummary[]> | CourseSummary[]>(
      C.courses,
    );
    return unwrapEnvelope(result);
  }

  async lessons(courseId: CourseId): Promise<Lesson[]> {
    const result = await this.transport.invoke<IpcEnvelope<Lesson[]> | Lesson[]>(
      C.lessons,
      courseId,
    );
    return unwrapEnvelope(result);
  }

  async units(courseId: CourseId): Promise<Unit[]> {
    const result = await this.transport.invoke<IpcEnvelope<Unit[]> | Unit[]>(
      "praxis.artifacts.units",
      courseId,
    );
    return unwrapEnvelope(result);
  }

  async lessonAssessments(lessonId: LessonId): Promise<LessonAssessment[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<LessonAssessment[]> | LessonAssessment[]
    >("praxis.artifacts.lessonAssessments", lessonId);
    return unwrapEnvelope(result);
  }

  async gates(courseId: CourseId): Promise<Gate[]> {
    const result = await this.transport.invoke<IpcEnvelope<Gate[]> | Gate[]>(C.gates, courseId);
    return unwrapEnvelope(result);
  }

  async progress(): Promise<ProgressSnapshot> {
    // Server resolves student from getDefaultStudentId (single-student v1).
    const result = await this.transport.invoke<IpcEnvelope<ProgressSnapshot> | ProgressSnapshot>(
      C.progress,
    );
    return unwrapEnvelope(result);
  }

  // Phase 12 territory — return empty stubs for now.
  flashcards(_opts?: { conceptId?: ConceptId; due?: boolean }): Promise<Flashcard[]> {
    return Promise.resolve([]);
  }

  notes(_opts?: { courseId?: CourseId }): Promise<Note[]> {
    return Promise.resolve([]);
  }

  // ── Phase 9: Gate view + evaluation ─────────────────────────────────────────

  async gateView(courseId: CourseId): Promise<GateView[]> {
    const result = await this.transport.invoke<IpcEnvelope<GateView[]> | GateView[]>(
      "praxis.artifacts.gateView",
      courseId,
    );
    return unwrapEnvelope(result);
  }

  async evaluateGates(courseId: CourseId): Promise<{ unlockedGateIds: GateId[] }> {
    const result = await this.transport.invoke<
      IpcEnvelope<{ unlockedGateIds: GateId[] }> | { unlockedGateIds: GateId[] }
    >("praxis.artifacts.evaluateGates", courseId);
    return unwrapEnvelope(result);
  }

  async markGatesViewed(courseId: CourseId): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      "praxis.artifacts.markGatesViewed",
      courseId,
    );
    return unwrapEnvelope(result);
  }

  async newlyUnlockedCount(courseId: CourseId): Promise<number> {
    const result = await this.transport.invoke<IpcEnvelope<number> | number>(
      "praxis.artifacts.newlyUnlockedCount",
      courseId,
    );
    return unwrapEnvelope(result);
  }

  // ── Phase 10: Concept list ────────────────────────────────────────────────

  /**
   * Return the full concept list for a course.
   * Concept ids are prefixed for canonical packs ("<graphId>:pack-id.concept-id")
   * and are plain UUIDs for extracted courses.
   */
  async concepts(courseId: CourseId): Promise<ConceptRow[]> {
    const result = await this.transport.invoke<IpcEnvelope<ConceptRow[]> | ConceptRow[]>(
      "praxis.artifacts.concepts",
      courseId,
    );
    return unwrapEnvelope(result);
  }
}
