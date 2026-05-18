import type { CitationsClientApi, DocumentCitationRecord, DocumentId, SessionId } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const CHANNEL = "praxis.citations";

export class CitationsClient implements CitationsClientApi {
  constructor(private readonly transport: ClientTransport) {}

  async record(input: {
    documentId: DocumentId;
    citingSessionId: SessionId;
    citingTurnId?: string;
    startOffset: number;
    endOffset: number;
    citedText?: string;
  }): Promise<DocumentCitationRecord> {
    const result = await this.transport.invoke<
      IpcEnvelope<DocumentCitationRecord> | DocumentCitationRecord
    >(`${CHANNEL}.record`, input);
    return unwrapEnvelope(result);
  }

  async listByDocument(documentId: DocumentId): Promise<DocumentCitationRecord[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<DocumentCitationRecord[]> | DocumentCitationRecord[]
    >(`${CHANNEL}.listByDocument`, documentId);
    return unwrapEnvelope(result);
  }
}
