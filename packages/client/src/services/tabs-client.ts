import type { SessionId, StudentId, TabId, TabSummary, TabsService } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.tabs" as const;

/**
 * TabsClient — Phase 14 implementation.
 *
 * Implements TabsService but the `studentId` parameter on `listOpen` and `list`
 * is intentionally ignored on the client side. The IPC server resolves the active
 * student from the single-student v1 install — the renderer never needs to pass it.
 * The parameter is present in the interface for structural compatibility only.
 */
export class TabsClient implements TabsService {
  constructor(private readonly transport: ClientTransport) {}

  listOpen(_studentId: StudentId): Promise<TabSummary[]> {
    return this.transport.invoke<TabSummary[]>(`${C}.listOpen`);
  }

  list(
    _studentId: StudentId,
    opts?: { limit?: number; includeClosed?: boolean },
  ): Promise<TabSummary[]> {
    return this.transport.invoke<TabSummary[]>(`${C}.list`, opts ?? {});
  }

  get(tabId: TabId): Promise<TabSummary | null> {
    return this.transport.invoke<TabSummary | null>(`${C}.get`, tabId);
  }

  open(input: {
    studentId: StudentId;
    sessionId: SessionId;
    courseTitle?: string;
  }): Promise<TabSummary> {
    // studentId is resolved server-side; only pass sessionId and courseTitle.
    const payload: { sessionId: SessionId; courseTitle?: string } = {
      sessionId: input.sessionId,
      ...(input.courseTitle !== undefined && { courseTitle: input.courseTitle }),
    };
    return this.transport.invoke<TabSummary>(`${C}.open`, payload);
  }

  reopen(tabId: TabId): Promise<TabSummary> {
    return this.transport.invoke<TabSummary>(`${C}.reopen`, tabId);
  }

  close(tabId: TabId): Promise<void> {
    return this.transport.invoke<void>(`${C}.close`, tabId);
  }

  touch(tabId: TabId): Promise<void> {
    return this.transport.invoke<void>(`${C}.touch`, tabId);
  }

  rename(tabId: TabId, title: string): Promise<TabSummary> {
    return this.transport.invoke<TabSummary>(`${C}.rename`, { tabId, title });
  }
}
