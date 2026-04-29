import type { DocumentSummary, DocumentsClient } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  list: "praxis.documents.list",
  delete: "praxis.documents.delete",
  pageImage: "praxis.documents.pageImage",
} as const;

/**
 * DocumentsClientImpl — typed client for the documents IPC channel.
 *
 * `pageImage` returns the PNG as a base64 string (encoded by main process)
 * or null. The UI decodes it to a blob URL for rendering.
 */
class DocumentsClientImpl implements DocumentsClient {
  constructor(private readonly transport: ClientTransport) {}

  list(): Promise<DocumentSummary[]> {
    return this.transport.invoke<DocumentSummary[]>(C.list);
  }

  delete(documentId: string): Promise<void> {
    return this.transport.invoke<void>(C.delete, documentId);
  }

  pageImage(input: { documentId: string; page: number }): Promise<Buffer | null> {
    // Main process sends base64 string; we decode here for the consumer.
    return this.transport
      .invoke<string | null>(C.pageImage, input)
      .then((b64) => (b64 ? Buffer.from(b64, "base64") : null));
  }
}

export { DocumentsClientImpl as DocumentsClient };
