import type {
  AssignmentId,
  CourseId,
  EngineEvent,
  NoteId,
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

  async start(opts: {
    courseId?: CourseId;
    assignmentId?: AssignmentId;
    modeId: string;
  }): Promise<SessionHandle> {
    const result = await this.transport.invoke<IpcEnvelope<SessionHandle> | SessionHandle>(
      `${CHANNEL}.start`,
      opts,
    );
    return unwrapEnvelope(result);
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

  async list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]> {
    const result = await this.transport.invoke<IpcEnvelope<SessionSummary[]> | SessionSummary[]>(
      `${CHANNEL}.list`,
      opts,
    );
    return unwrapEnvelope(result);
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

  /** Open a teach session pre-loaded with a note's cue context. */
  async spawnFromNote(input: { noteId: NoteId; cueId?: string }): Promise<SessionHandle> {
    const result = await this.transport.invoke<IpcEnvelope<SessionHandle> | SessionHandle>(
      `${CHANNEL}.spawnFromNote`,
      input,
    );
    return unwrapEnvelope(result);
  }
}
