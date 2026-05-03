import type {
  Assignment,
  AssignmentId,
  AssignmentResponse,
  AssignmentSubmissionResult,
  AssignmentsClient,
  CourseId,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

/** Canonical channel names for the assignments IPC surface. */
const C = {
  get: "praxis.assignments.get",
  list: "praxis.assignments.list",
  recordResponse: "praxis.assignments.recordResponse",
  getResponses: "praxis.assignments.getResponses",
  submit: "praxis.assignments.submit",
} as const;

/**
 * AssignmentsClient — Phase 8 real implementation.
 * Thin wrappers over the praxis.assignments.* IPC channels.
 *
 * Implements the client-side AssignmentsClient from @praxis/core/types/client.
 */
class AssignmentsClientImpl implements AssignmentsClient {
  constructor(private readonly transport: ClientTransport) {}

  get(input: { assignmentId: AssignmentId }): Promise<Assignment | null> {
    return this.transport.invoke<Assignment | null>(C.get, input);
  }

  list(input: { courseId: CourseId; kind?: "quiz" | "homework" | "exam" }): Promise<Assignment[]> {
    return this.transport.invoke<Assignment[]>(C.list, input);
  }

  recordResponse(input: {
    assignmentId: AssignmentId;
    itemId: string;
    response: string;
    work?: string;
    /** Phase 15a: optional sketch attached to this response. */
    sketchId?: string;
  }): Promise<void> {
    return this.transport.invoke<void>(C.recordResponse, input);
  }

  getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]> {
    return this.transport.invoke<AssignmentResponse[]>(C.getResponses, input);
  }

  submit(input: { assignmentId: AssignmentId }): Promise<AssignmentSubmissionResult> {
    return this.transport.invoke<AssignmentSubmissionResult>(C.submit, input);
  }
}

export { AssignmentsClientImpl as AssignmentsClient };
