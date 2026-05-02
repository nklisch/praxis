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

  end(sessionId: SessionId): Promise<SessionEndSummary> {
    return this.transport.invoke<SessionEndSummary>(`${CHANNEL}.end`, sessionId);
  }

  active(): Promise<SessionHandle | null> {
    return this.transport.invoke<SessionHandle | null>(`${CHANNEL}.active`);
  }

  list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]> {
    return this.transport.invoke<SessionSummary[]>(`${CHANNEL}.list`, opts ?? {});
  }
}
