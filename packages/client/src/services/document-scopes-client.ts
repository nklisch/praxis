import type {
  DocumentId,
  DocumentScope,
  DocumentScopeAttachment,
  DocumentScopeSource,
  DocumentScopesClientApi,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.documentScopes" as const;

/**
 * DocumentScopesClient — typed wrapper for polymorphic scope ↔ document attachment IPC.
 *
 * Implements DocumentScopesClientApi (renderer-facing). All methods delegate to
 * transport.invoke over the `praxis.documentScopes.*` channels.
 */
export class DocumentScopesClient implements DocumentScopesClientApi {
  constructor(private readonly transport: ClientTransport) {}

  async listOrphaned(): Promise<DocumentScopeAttachment[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<DocumentScopeAttachment[]> | DocumentScopeAttachment[]
    >(`${C}.listOrphaned`);
    return unwrapEnvelope(result);
  }

  async listForScope(scope: DocumentScope): Promise<DocumentScopeAttachment[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<DocumentScopeAttachment[]> | DocumentScopeAttachment[]
    >(`${C}.listForScope`, scope);
    return unwrapEnvelope(result);
  }

  async attach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
    source?: DocumentScopeSource;
  }): Promise<{ attached: boolean }> {
    const result = await this.transport.invoke<
      IpcEnvelope<{ attached: boolean }> | { attached: boolean }
    >(`${C}.attach`, {
      scope: input.scope,
      documentId: input.documentId,
      ...(input.source !== undefined && { source: input.source }),
    });
    return unwrapEnvelope(result);
  }

  async detach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
  }): Promise<{ detached: boolean }> {
    const result = await this.transport.invoke<
      IpcEnvelope<{ detached: boolean }> | { detached: boolean }
    >(`${C}.detach`, {
      scope: input.scope,
      documentId: input.documentId,
    });
    return unwrapEnvelope(result);
  }

  async listScopesForDocument(documentId: DocumentId): Promise<DocumentScope[]> {
    const result = await this.transport.invoke<IpcEnvelope<DocumentScope[]> | DocumentScope[]>(
      `${C}.listScopesForDocument`,
      documentId,
    );
    return unwrapEnvelope(result);
  }
}
