import type { DocumentDetail, DocumentSummary, DocumentsClient } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

/** Decode a base64 string to bytes — browser-native (atob) so this code runs in the renderer. */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const C = {
  list: "praxis.documents.list",
  get: "praxis.documents.get",
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

  get(documentId: string): Promise<DocumentDetail | null> {
    return this.transport.invoke<DocumentDetail | null>(C.get, documentId);
  }

  delete(documentId: string): Promise<void> {
    return this.transport.invoke<void>(C.delete, documentId);
  }

  pageImage(input: { documentId: string; page: number }): Promise<Uint8Array | null> {
    // Main process sends base64 string; we decode here for the consumer.
    return this.transport
      .invoke<string | null>(C.pageImage, input)
      .then((b64) => (b64 ? base64ToBytes(b64) : null));
  }
}

export { DocumentsClientImpl as DocumentsClient };
