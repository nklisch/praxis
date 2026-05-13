import type {
  DocumentId,
  DocumentScope,
  DocumentScopeAttachment,
  DocumentScopeSource,
  DocumentScopesClientApi,
} from "@praxis/core/types";
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

  listForScope(scope: DocumentScope): Promise<DocumentScopeAttachment[]> {
    return this.transport.invoke<DocumentScopeAttachment[]>(`${C}.listForScope`, scope);
  }

  attach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
    source?: DocumentScopeSource;
  }): Promise<{ attached: boolean }> {
    return this.transport.invoke<{ attached: boolean }>(`${C}.attach`, {
      scope: input.scope,
      documentId: input.documentId,
      ...(input.source !== undefined && { source: input.source }),
    });
  }

  detach(input: { scope: DocumentScope; documentId: DocumentId }): Promise<{ detached: boolean }> {
    return this.transport.invoke<{ detached: boolean }>(`${C}.detach`, {
      scope: input.scope,
      documentId: input.documentId,
    });
  }
}
