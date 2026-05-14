import type {
  DocumentId,
  DocumentTabSummary,
  SessionId,
  TabId,
  TabSummary,
  TabsClientApi,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
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

  async listOpen(): Promise<TabSummary[]> {
    const result = await this.transport.invoke<IpcEnvelope<TabSummary[]> | TabSummary[]>(
      `${C}.listOpen`,
    );
    return unwrapEnvelope(result);
  }

  async list(opts?: { limit?: number; includeClosed?: boolean }): Promise<TabSummary[]> {
    const result = await this.transport.invoke<IpcEnvelope<TabSummary[]> | TabSummary[]>(
      `${C}.list`,
      opts ?? {},
    );
    return unwrapEnvelope(result);
  }

  async get(tabId: TabId): Promise<TabSummary | null> {
    const result = await this.transport.invoke<IpcEnvelope<TabSummary | null> | TabSummary | null>(
      `${C}.get`,
      tabId,
    );
    return unwrapEnvelope(result);
  }

  async open(input: { sessionId: SessionId; courseTitle?: string }): Promise<TabSummary> {
    const result = await this.transport.invoke<IpcEnvelope<TabSummary> | TabSummary>(`${C}.open`, {
      sessionId: input.sessionId,
      ...(input.courseTitle !== undefined && { courseTitle: input.courseTitle }),
    });
    return unwrapEnvelope(result);
  }

  async openDocument(input: {
    documentId: DocumentId;
    title: string;
  }): Promise<DocumentTabSummary> {
    const result = await this.transport.invoke<
      IpcEnvelope<DocumentTabSummary> | DocumentTabSummary
    >(`${C}.openDocument`, {
      documentId: input.documentId,
      title: input.title,
    });
    return unwrapEnvelope(result);
  }

  async reopen(tabId: TabId): Promise<TabSummary> {
    const result = await this.transport.invoke<IpcEnvelope<TabSummary> | TabSummary>(
      `${C}.reopen`,
      tabId,
    );
    return unwrapEnvelope(result);
  }

  async close(tabId: TabId): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(`${C}.close`, tabId);
    return unwrapEnvelope(result);
  }

  async touch(tabId: TabId): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(`${C}.touch`, tabId);
    return unwrapEnvelope(result);
  }

  async rename(tabId: TabId, title: string): Promise<TabSummary> {
    const result = await this.transport.invoke<IpcEnvelope<TabSummary> | TabSummary>(
      `${C}.rename`,
      { tabId, title },
    );
    return unwrapEnvelope(result);
  }
}
