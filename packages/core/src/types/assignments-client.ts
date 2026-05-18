import type {
  Assignment,
  AssignmentResponse,
  AssignmentSubmissionResult,
  ConfidenceBand,
} from "./artifacts.js";
import type { AssignmentId, CourseId } from "./ids.js";

// ─── Phase 8: AssignmentsClient (client-side) ────────────────────────────────

/**
 * Client-side interface for the assignments IPC surface.
 * The server-side AssignmentService lives in tool.ts; this is the
 * thin client wrapper over praxis.assignments.* IPC channels.
 */
export interface AssignmentsClient {
  get(input: { assignmentId: AssignmentId }): Promise<Assignment | null>;
  list(input: { courseId: CourseId; kind?: "quiz" | "homework" | "exam" }): Promise<Assignment[]>;
  recordResponse(input: {
    assignmentId: AssignmentId;
    itemId: string;
    response: string;
    work?: string;
    /** Phase 15a: optional sketch attached to this response. */
    sketchId?: string;
    /** Confidence band — formative self-assessment signal per quiz item. Optional. */
    confidence?: ConfidenceBand;
  }): Promise<void>;
  getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]>;
  submit(input: { assignmentId: AssignmentId }): Promise<AssignmentSubmissionResult>;
}
