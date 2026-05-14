import type {
  AssignmentId,
  CourseId,
  EngineEvent,
  SessionEndSummary,
  SessionHandle,
  SessionId,
  SessionService,
  SessionSummary,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const CHANNEL = "praxis.session";

export class SessionClient implements SessionService {
  constructor(private readonly transport: ClientTransport) {}

  start(opts: {
    courseId?: CourseId;
    assignmentId?: AssignmentId;
    modeId: string;
  }): Promise<SessionHandle> {
    return this.transport.invoke<SessionHandle>(`${CHANNEL}.start`, opts);
  }

  send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
    return this.transport.stream<EngineEvent>(`${CHANNEL}.send`, sessionId, message);
  }

  async end(sessionId: SessionId): Promise<SessionEndSummary> {
    const result = await this.transport.invoke<IpcEnvelope<SessionEndSummary> | SessionEndSummary>(
      `${CHANNEL}.end`,
      sessionId,
    );
    return unwrapEnvelope(result);
  }

  async active(): Promise<SessionHandle | null> {
    const result = await this.transport.invoke<
      IpcEnvelope<SessionHandle | null> | SessionHandle | null
    >(`${CHANNEL}.active`);
    return unwrapEnvelope(result);
  }

  list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]> {
    return this.transport.invoke<SessionSummary[]>(`${CHANNEL}.list`, opts ?? {});
  }

  /** Phase 16: open a child quiz/homework/exam session from a tutor-authored assignment. */
  async spawnFromAssignment(input: {
    assignmentId: AssignmentId;
    parentSessionId: SessionId;
  }): Promise<SessionHandle> {
    const result = await this.transport.invoke<IpcEnvelope<SessionHandle> | SessionHandle>(
      `${CHANNEL}.spawnFromAssignment`,
      input,
    );
    return unwrapEnvelope(result);
  }
}
