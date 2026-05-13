import type {
  DocumentId,
  DocumentTabSummary,
  SessionId,
  TabId,
  TabSummary,
  TabsClientApi,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.tabs" as const;

/**
 * TabsClient — Phase 14 implementation.
 *
 * Implements TabsClientApi (renderer-facing). The `studentId` parameters from the
 * server-side TabsService are omitted here — the IPC server resolves the active
 * student from the single-student v1 install context.
 */
export class TabsClient implements TabsClientApi {
  constructor(private readonly transport: ClientTransport) {}

  listOpen(): Promise<TabSummary[]> {
    return this.transport.invoke<TabSummary[]>(`${C}.listOpen`);
  }

  list(opts?: { limit?: number; includeClosed?: boolean }): Promise<TabSummary[]> {
    return this.transport.invoke<TabSummary[]>(`${C}.list`, opts ?? {});
  }

  get(tabId: TabId): Promise<TabSummary | null> {
    return this.transport.invoke<TabSummary | null>(`${C}.get`, tabId);
  }

  open(input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary> {
    return this.transport.invoke<TabSummary>(`${C}.open`, {
      sessionId: input.sessionId,
      ...(input.courseTitle !== undefined && { courseTitle: input.courseTitle }),
    });
  }

  openDocument(input: { documentId: DocumentId; title: string }): Promise<DocumentTabSummary> {
    return this.transport.invoke<DocumentTabSummary>(`${C}.openDocument`, {
      documentId: input.documentId,
      title: input.title,
    });
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
