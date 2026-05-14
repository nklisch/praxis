import type { DocumentDetail, DocumentSummary, DocumentsClient } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
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

  async list(): Promise<DocumentSummary[]> {
    const result = await this.transport.invoke<IpcEnvelope<DocumentSummary[]> | DocumentSummary[]>(
      C.list,
    );
    return unwrapEnvelope(result);
  }

  async get(documentId: string): Promise<DocumentDetail | null> {
    const result = await this.transport.invoke<
      IpcEnvelope<DocumentDetail | null> | DocumentDetail | null
    >(C.get, documentId);
    return unwrapEnvelope(result);
  }

  async delete(documentId: string): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(C.delete, documentId);
    return unwrapEnvelope(result);
  }

  async pageImage(input: { documentId: string; page: number }): Promise<Uint8Array | null> {
    // Main process sends base64 string; we decode here for the consumer.
    const raw = await this.transport.invoke<IpcEnvelope<string | null> | string | null>(
      C.pageImage,
      input,
    );
    const b64 = unwrapEnvelope(raw);
    return b64 ? base64ToBytes(b64) : null;
  }
}

export { DocumentsClientImpl as DocumentsClient };
